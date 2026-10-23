import { distanceMeters } from "./geo";
import { tripService } from "./service-hours";
import type { AppState, BoardingEvent, PassengerParty, ShuttleService, Stop, Vehicle } from "./types";

/** `/driver` checks in about this often while it's open, even when parked. */
export const HEARTBEAT_MS = 30_000;
/** A shuttle quiet this long shows riders when it was last seen. */
export const STALE_AFTER_MS = 2 * 60_000;
/** Quiet this long: no new riders, and the riders it holds go to another shuttle. */
export const LOST_AFTER_MS = 5 * 60_000;
/** Quiet this long: taken offline, and anyone still on board counts as dropped off. */
export const OFFLINE_AFTER_MS = 30 * 60_000;
/** Waiting or cleared requests lapse after this long without a pickup. */
export const EXPIRE_AFTER_MS = 30 * 60_000;
/** Most riders on one request, before the shuttles' own size limit. */
export const MAX_PARTY = 12;

export type Presence = "live" | "stale" | "lost";

type CheckIn = Pick<Vehicle, "lastLocationAt" | "createdAt">;

/** When the shuttle's phone last checked in; a new shuttle counts from sign-on. */
export function lastSeenAt(v: CheckIn): number {
  return Date.parse(v.lastLocationAt ?? v.createdAt);
}

/** `now` should be the server's clock (`state.updatedAt` on clients). */
export function presenceOf(v: CheckIn, now: number): Presence {
  const quiet = now - lastSeenAt(v);
  if (quiet >= LOST_AFTER_MS) return "lost";
  if (quiet >= STALE_AFTER_MS) return "stale";
  return "live";
}

export function minutesQuiet(v: CheckIn, now: number): number {
  return Math.max(0, Math.floor((now - lastSeenAt(v)) / 60_000));
}

/** Online and heard from recently enough to be sent riders. */
export function canDispatch(v: CheckIn & Pick<Vehicle, "active">, now: number): boolean {
  return v.active && presenceOf(v, now) !== "lost";
}

/** Seats on the biggest shuttle ground control can send, or null if it can't send any. */
function largestShuttle(vehicles: Vehicle[], now: number): number | null {
  const caps = vehicles.filter((v) => canDispatch(v, now)).map((v) => v.capacity);
  return caps.length ? Math.max(...caps) : null;
}

/** A party bigger than every shuttle would never be cleared. */
export function maxPartySize(vehicles: Vehicle[], now: number): number {
  return Math.min(MAX_PARTY, largestShuttle(vehicles, now) ?? MAX_PARTY);
}

export type PartyCaps = {
  /** Counting every shuttle, for trips either service runs. */
  maxPartySize: number;
  /** Counting one service's shuttles, for trips only that service runs. */
  maxPartyByService: Record<ShuttleService, number>;
};

export function partyCaps(vehicles: Vehicle[], now: number): PartyCaps {
  const capOf = (service: ShuttleService) =>
    maxPartySize(vehicles.filter((v) => v.service === service), now);
  return {
    maxPartySize: maxPartySize(vehicles, now),
    maxPartyByService: { onsite: capOf("onsite"), offsite: capOf("offsite") },
  };
}

/** Only shuttles that run the trip count; before a destination is picked, every shuttle does. */
export function maxPartyForTrip(
  caps: PartyCaps,
  pickup: Pick<Stop, "service"> | null | undefined,
  destination: Pick<Stop, "service"> | null | undefined,
): number {
  const service = pickup && destination ? tripService(pickup, destination) : null;
  return service ? caps.maxPartyByService[service] : caps.maxPartySize;
}

const isOpen = (p: PassengerParty) =>
  p.status === "waiting" || p.status === "cleared" || p.status === "boarding";

/** No-shows shouldn't hold seats forever. */
export function expireRequests(state: AppState, now: number): AppState {
  const at = new Date(now).toISOString();
  let changed = false;
  const parties = state.parties.map((p) => {
    if (!isOpen(p) || now - Date.parse(p.createdAt) < EXPIRE_AFTER_MS) return p;
    changed = true;
    return { ...p, status: "cancelled" as const, cancelReason: "expired" as const, updatedAt: at };
  });
  return changed ? { ...state, parties } : state;
}

/** Everyone still on board gets off at their own stop. */
function dropOffEveryone(state: AppState, vehicleId: string, now: number): AppState {
  const riding = state.parties.filter((p) => p.vehicleId === vehicleId && p.status === "onboard");
  if (riding.length === 0) {
    return {
      ...state,
      vehicles: state.vehicles.map((v) => (v.id === vehicleId ? { ...v, occupied: 0 } : v)),
    };
  }
  const at = new Date(now).toISOString();
  const byStop = new Map<string, PassengerParty[]>();
  for (const p of riding) byStop.set(p.destinationId, [...(byStop.get(p.destinationId) ?? []), p]);
  const events: BoardingEvent[] = [...byStop.entries()].map(([stopId, group]) => ({
    id: crypto.randomUUID(),
    vehicleId,
    stopId,
    destinationId: stopId,
    partyIds: group.map((p) => p.id),
    seats: group.reduce((n, p) => n + p.partySize, 0),
    kind: "alight",
    createdAt: at,
  }));
  const ids = new Set(riding.map((p) => p.id));
  return {
    ...state,
    parties: state.parties.map((p) =>
      ids.has(p.id) ? { ...p, status: "delivered" as const, updatedAt: at } : p,
    ),
    vehicles: state.vehicles.map((v) => (v.id === vehicleId ? { ...v, occupied: 0 } : v)),
    events: [...events, ...state.events].slice(0, 200),
  };
}

/** Out of service: riders on board are dropped off, and its holds are freed on the next refresh. */
export function takeOffline(state: AppState, vehicleId: string, now: number): AppState {
  const next = dropOffEveryone(state, vehicleId, now);
  return {
    ...next,
    vehicles: next.vehicles.map((v) =>
      v.id === vehicleId ? { ...v, active: false, status: "offline" as const } : v,
    ),
  };
}

/** A dead battery or a closed tab would otherwise leave the shuttle online forever. */
export function retireSilentShuttles(state: AppState, now: number): AppState {
  return state.vehicles
    .filter((v) => v.active && now - lastSeenAt(v) >= OFFLINE_AFTER_MS)
    .reduce((next, v) => takeOffline(next, v.id, now), state);
}

/** The closest stop someone on board is going to. */
export function nearestDropOff(
  state: AppState,
  vehicleId: string,
  from: { lat: number; lng: number } | null,
): string | null {
  const ids = new Set(
    state.parties
      .filter((p) => p.vehicleId === vehicleId && p.status === "onboard")
      .map((p) => p.destinationId),
  );
  const stops = state.stops.filter((s) => ids.has(s.id));
  if (stops.length === 0) return null;
  if (!from) return stops[0].id;
  return stops.reduce((best, s) =>
    distanceMeters(from, s) < distanceMeters(from, best) ? s : best,
  ).id;
}
