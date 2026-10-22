import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { normalizeCallsign } from "./callsigns";
import { refreshGroundControl } from "./dispatch";
import { seatLedger } from "./seats";
import { DEFAULT_STOPS } from "./stops";
import type {
  AppState,
  BoardingEvent,
  Clearance,
  PassengerParty,
  Vehicle,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
export const SCHEMA_VERSION = 2;

let writeChain: Promise<void> = Promise.resolve();

function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    stops: DEFAULT_STOPS,
    parties: [],
    vehicles: [],
    clearances: [],
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

function migrate(raw: Record<string, unknown>): AppState {
  if (raw.schemaVersion === SCHEMA_VERSION && Array.isArray(raw.parties)) {
    const state = raw as unknown as AppState;
    state.vehicles = (state.vehicles ?? []).map((v) => ({
      ...v,
      headingStopId: v.headingStopId ?? null,
    }));
    return state;
  }

  // v1 → v2: drivers/requests/suggestions/pickups
  const base = emptyState();
  if (Array.isArray(raw.stops) && raw.stops.length) {
    base.stops = raw.stops as AppState["stops"];
  }

  const drivers = (raw.drivers as Array<Record<string, unknown>>) ?? [];
  base.vehicles = drivers.map((d) => ({
    id: String(d.id),
    callsign: String(d.label ?? d.callsign ?? "Shuttle"),
    capacity: Number(d.capacity ?? 14),
    occupied: Number(d.onboard ?? d.occupied ?? 0),
    status: d.active === false ? ("offline" as const) : ("available" as const),
    lat: (d.lat as number | null) ?? null,
    lng: (d.lng as number | null) ?? null,
    lastLocationAt: (d.lastLocationAt as string | null) ?? null,
    currentStopId: (d.currentStopId as string | null) ?? null,
    headingStopId: (d.headingStopId as string | null) ?? null,
    active: d.active !== false,
    createdAt: String(d.createdAt ?? new Date().toISOString()),
  }));

  const requests = (raw.requests as Array<Record<string, unknown>>) ?? [];
  base.parties = requests.map((r) => {
    const statusMap: Record<string, PassengerParty["status"]> = {
      waiting: "waiting",
      assigned: "cleared",
      picked_up: "onboard",
      cancelled: "cancelled",
    };
    const status = statusMap[String(r.status)] ?? "waiting";
    return {
      id: String(r.id),
      stopId: String(r.stopId),
      destinationId: String(r.destinationId),
      partySize: Number(r.partySize ?? 1),
      status,
      vehicleId: (r.assignedDriverId as string | null) ?? null,
      clearanceId: null,
      createdAt: String(r.createdAt ?? new Date().toISOString()),
      updatedAt: String(r.updatedAt ?? new Date().toISOString()),
      note: r.note ? String(r.note) : undefined,
    };
  });

  return base;
}

async function ensureStore(): Promise<AppState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = JSON.parse(await fs.readFile(STORE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const state = migrate(raw);
    if (!state.stops?.length) state.stops = DEFAULT_STOPS;
    state.schemaVersion = SCHEMA_VERSION;
    return state;
  } catch {
    const state = emptyState();
    await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2));
    return state;
  }
}

async function persist(state: AppState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2));
}

function withWrite<T>(fn: (state: AppState) => Promise<T> | T): Promise<T> {
  const run = writeChain.then(async () => {
    const state = await ensureStore();
    return fn(state);
  });
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getState(): Promise<AppState> {
  return withWrite(async (state) => {
    const next = refreshGroundControl(state);
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      await persist(next);
    }
    return next;
  });
}

export async function createParty(input: {
  stopId: string;
  destinationId: string;
  partySize: number;
  note?: string;
  contactHint?: string;
}): Promise<PassengerParty> {
  return withWrite(async (state) => {
    if (!state.stops.some((s) => s.id === input.stopId)) {
      throw new Error("Unknown pickup stand");
    }
    if (!state.stops.some((s) => s.id === input.destinationId)) {
      throw new Error("Unknown destination");
    }
    if (input.stopId === input.destinationId) {
      throw new Error("Destination must differ from pickup stand");
    }
    const partySize = Math.min(12, Math.max(1, Math.floor(input.partySize)));
    const now = new Date().toISOString();
    const party: PassengerParty = {
      id: randomUUID(),
      stopId: input.stopId,
      destinationId: input.destinationId,
      partySize,
      status: "waiting",
      vehicleId: null,
      clearanceId: null,
      createdAt: now,
      updatedAt: now,
      note: input.note?.slice(0, 120),
      contactHint: input.contactHint?.slice(0, 40),
    };
    let next: AppState = {
      ...state,
      parties: [...state.parties, party],
      updatedAt: now,
    };
    next = refreshGroundControl(next);
    await persist(next);
    return next.parties.find((p) => p.id === party.id)!;
  });
}

export async function cancelParty(id: string): Promise<PassengerParty | null> {
  return withWrite(async (state) => {
    const idx = state.parties.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated: PassengerParty = {
      ...state.parties[idx],
      status: "cancelled",
      updatedAt: now,
    };
    const parties = [...state.parties];
    parties[idx] = updated;
    let next: AppState = { ...state, parties, updatedAt: now };
    next = refreshGroundControl(next);
    await persist(next);
    return updated;
  });
}

export async function registerVehicle(input: {
  callsign: string;
  capacity?: number;
}): Promise<Vehicle> {
  return withWrite(async (state) => {
    const callsign = normalizeCallsign(input.callsign).slice(0, 32);
    if (!callsign) throw new Error("Callsign / shuttle label is required");
    const key = callsign.toLowerCase();
    const duplicate = state.vehicles.find(
      (v) => v.active && normalizeCallsign(v.callsign).toLowerCase() === key,
    );
    if (duplicate) {
      throw new Error(
        `Callsign “${duplicate.callsign}” is already on duty — pick another`,
      );
    }
    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: randomUUID(),
      callsign,
      capacity: Math.min(40, Math.max(4, input.capacity ?? 14)),
      occupied: 0,
      status: "available",
      lat: null,
      lng: null,
      lastLocationAt: null,
      currentStopId: null,
      headingStopId: null,
      active: true,
      createdAt: now,
    };
    let next: AppState = {
      ...state,
      vehicles: [...state.vehicles, vehicle],
      updatedAt: now,
    };
    next = refreshGroundControl(next);
    await persist(next);
    return vehicle;
  });
}

export async function updateVehicleLocation(input: {
  vehicleId: string;
  lat: number;
  lng: number;
  currentStopId?: string | null;
}): Promise<Vehicle | null> {
  return withWrite(async (state) => {
    const idx = state.vehicles.findIndex((v) => v.id === input.vehicleId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...state.vehicles[idx],
      lat: input.lat,
      lng: input.lng,
      lastLocationAt: now,
      currentStopId:
        input.currentStopId === undefined
          ? state.vehicles[idx].currentStopId
          : input.currentStopId,
      active: true,
    };
    const vehicles = [...state.vehicles];
    vehicles[idx] = updated;
    let next: AppState = { ...state, vehicles, updatedAt: now };
    next = refreshGroundControl(next);
    await persist(next);
    return next.vehicles.find((v) => v.id === input.vehicleId) ?? null;
  });
}

export async function setVehicleHeading(input: {
  vehicleId: string;
  headingStopId: string | null;
}): Promise<Vehicle | null> {
  return withWrite(async (state) => {
    const idx = state.vehicles.findIndex((v) => v.id === input.vehicleId);
    if (idx < 0) return null;
    if (
      input.headingStopId &&
      !state.stops.some((s) => s.id === input.headingStopId)
    ) {
      throw new Error("Unknown destination");
    }
    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...state.vehicles[idx],
      headingStopId: input.headingStopId,
      status:
        input.headingStopId && state.vehicles[idx].active
          ? "enroute"
          : state.vehicles[idx].status,
    };
    const vehicles = [...state.vehicles];
    vehicles[idx] = updated;
    let next: AppState = { ...state, vehicles, updatedAt: now };
    next = refreshGroundControl(next);
    await persist(next);
    return next.vehicles[idx];
  });
}

export async function setVehicleActive(
  vehicleId: string,
  active: boolean,
): Promise<Vehicle | null> {
  return withWrite(async (state) => {
    const idx = state.vehicles.findIndex((v) => v.id === vehicleId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...state.vehicles[idx],
      active,
      status: active ? "available" : "offline",
    };
    const vehicles = [...state.vehicles];
    vehicles[idx] = updated;
    let next: AppState = { ...state, vehicles, updatedAt: now };
    next = refreshGroundControl(next);
    await persist(next);
    return updated;
  });
}

export async function acceptClearance(
  clearanceId: string,
  vehicleId: string,
): Promise<Clearance | null> {
  return withWrite(async (state) => {
    const idx = state.clearances.findIndex((c) => c.id === clearanceId);
    if (idx < 0) return null;
    if (state.clearances[idx].vehicleId !== vehicleId) {
      throw new Error("Clearance is for a different vehicle");
    }
    const now = new Date().toISOString();
    const updated: Clearance = {
      ...state.clearances[idx],
      status: "accepted",
      updatedAt: now,
    };
    const clearances = [...state.clearances];
    clearances[idx] = updated;
    const vehicles = state.vehicles.map((v) =>
      v.id === vehicleId ? { ...v, status: "enroute" as const } : v,
    );
    const next: AppState = {
      ...state,
      clearances,
      vehicles,
      updatedAt: now,
    };
    await persist(next);
    return updated;
  });
}

export async function boardParties(input: {
  vehicleId: string;
  stopId: string;
  partyIds?: string[];
  destinationId?: string;
  seats?: number;
}): Promise<{ event: BoardingEvent; vehicle: Vehicle; ledger: ReturnType<typeof seatLedger> }> {
  return withWrite(async (state) => {
    const vehicle = state.vehicles.find((v) => v.id === input.vehicleId);
    if (!vehicle) throw new Error("Unknown vehicle");
    if (!state.stops.some((s) => s.id === input.stopId)) {
      throw new Error("Unknown stand");
    }

    const now = new Date().toISOString();
    let partyIds = input.partyIds ?? [];
    let seats = input.seats ?? 0;
    let parties = state.parties;

    if (partyIds.length === 0) {
      const candidates = state.parties.filter(
        (p) =>
          p.stopId === input.stopId &&
          (p.status === "waiting" ||
            p.status === "cleared" ||
            p.status === "boarding") &&
          (!p.vehicleId || p.vehicleId === input.vehicleId) &&
          (!input.destinationId || p.destinationId === input.destinationId),
      );
      if (candidates.length > 0) {
        partyIds = candidates.map((c) => c.id);
        seats = candidates.reduce((n, c) => n + c.partySize, 0);
      } else if (input.destinationId && (input.seats ?? 0) > 0) {
        // Driver-logged group: pax count + destination at this stop.
        const manual: PassengerParty = {
          id: randomUUID(),
          stopId: input.stopId,
          destinationId: input.destinationId,
          partySize: Math.max(1, Math.floor(input.seats!)),
          status: "boarding",
          vehicleId: input.vehicleId,
          clearanceId: null,
          createdAt: now,
          updatedAt: now,
        };
        parties = [...state.parties, manual];
        partyIds = [manual.id];
        seats = manual.partySize;
      }
    } else if (!seats) {
      seats = state.parties
        .filter((p) => partyIds.includes(p.id))
        .reduce((n, p) => n + p.partySize, 0);
    }

    seats = Math.max(1, seats);
    const ledgerBefore = seatLedger(state, vehicle);
    if (seats > ledgerBefore.available + ledgerBefore.reserved) {
      // Allow boarding up to reserved+available (reserved converts to occupied)
      const room = vehicle.capacity - vehicle.occupied;
      if (seats > room) {
        throw new Error(
          `Only ${room} seats left on ${vehicle.callsign} (${ledgerBefore.available} free after holds)`,
        );
      }
    }

    const idSet = new Set(partyIds);
    const dest =
      input.destinationId ??
      parties.find((p) => idSet.has(p.id))?.destinationId ??
      input.stopId;

    parties = parties.map((p) =>
      idSet.has(p.id)
        ? {
            ...p,
            status: "onboard" as const,
            vehicleId: input.vehicleId,
            updatedAt: now,
          }
        : p,
    );

    const clearances = state.clearances.map((c) => {
      if (c.vehicleId !== input.vehicleId) return c;
      const remaining = c.partyIds.filter((id) => {
        const p = parties.find((x) => x.id === id);
        return p && (p.status === "cleared" || p.status === "boarding");
      });
      if (remaining.length === 0 && c.partyIds.some((id) => idSet.has(id))) {
        return { ...c, status: "completed" as const, updatedAt: now, seatsReserved: 0 };
      }
      if (c.partyIds.some((id) => idSet.has(id))) {
        return {
          ...c,
          status: "boarding" as const,
          partyIds: remaining,
          seatsReserved: remaining
            .map((id) => parties.find((p) => p.id === id)?.partySize ?? 0)
            .reduce((a, b) => a + b, 0),
          updatedAt: now,
        };
      }
      return c;
    });

    const vehicles = state.vehicles.map((v) => {
      if (v.id !== input.vehicleId) return v;
      const occupied = Math.min(v.capacity, v.occupied + seats);
      return {
        ...v,
        occupied,
        currentStopId: input.stopId,
        active: true,
        status:
          occupied >= v.capacity
            ? ("full" as const)
            : ("boarding" as const),
      };
    });

    const event: BoardingEvent = {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      stopId: input.stopId,
      destinationId: dest,
      partyIds,
      seats,
      kind: "board",
      createdAt: now,
    };

    let next: AppState = {
      ...state,
      parties,
      vehicles,
      clearances,
      events: [event, ...state.events].slice(0, 200),
      updatedAt: now,
    };
    next = refreshGroundControl(next);
    await persist(next);
    const v = next.vehicles.find((x) => x.id === input.vehicleId)!;
    return { event, vehicle: v, ledger: seatLedger(next, v) };
  });
}

export async function alight(input: {
  vehicleId: string;
  seats: number;
  destinationId?: string;
}): Promise<{ vehicle: Vehicle; ledger: ReturnType<typeof seatLedger> }> {
  return withWrite(async (state) => {
    const idx = state.vehicles.findIndex((v) => v.id === input.vehicleId);
    if (idx < 0) throw new Error("Unknown vehicle");
    const now = new Date().toISOString();
    const drop = Math.max(0, Math.floor(input.seats));
    const vehicle = state.vehicles[idx];
    const occupied = Math.max(0, vehicle.occupied - drop);

    const parties = state.parties.map((p) => {
      if (
        p.vehicleId === input.vehicleId &&
        p.status === "onboard" &&
        (!input.destinationId || p.destinationId === input.destinationId)
      ) {
        return { ...p, status: "delivered" as const, updatedAt: now };
      }
      return p;
    });

    // If destination filter, only mark matching; else mark enough by size
    let remaining = drop;
    const adjusted = parties.map((p) => {
      if (
        !input.destinationId &&
        p.vehicleId === input.vehicleId &&
        p.status === "onboard" &&
        remaining > 0
      ) {
        remaining -= p.partySize;
        return { ...p, status: "delivered" as const, updatedAt: now };
      }
      return p;
    });

    const event: BoardingEvent = {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      stopId: vehicle.currentStopId ?? state.stops[0]?.id ?? "hq-lobby",
      destinationId: input.destinationId ?? vehicle.currentStopId ?? "hq-lobby",
      partyIds: [],
      seats: drop,
      kind: "alight",
      createdAt: now,
    };

    const vehicles = [...state.vehicles];
    vehicles[idx] = {
      ...vehicle,
      occupied,
      status: occupied === 0 ? "available" : "enroute",
    };

    let next: AppState = {
      ...state,
      parties: input.destinationId ? parties : adjusted,
      vehicles,
      events: [event, ...state.events].slice(0, 200),
      updatedAt: now,
    };
    next = refreshGroundControl(next);
    await persist(next);
    const v = next.vehicles[idx];
    return { vehicle: v, ledger: seatLedger(next, v) };
  });
}

export async function resetDemo(): Promise<AppState> {
  return withWrite(async () => {
    const state = emptyState();
    await persist(state);
    return state;
  });
}

// Back-compat exports used by older route files during transition
export const createRequest = createParty;
export const cancelRequest = cancelParty;
export const registerDriver = (input: { label: string; capacity?: number }) =>
  registerVehicle({ callsign: input.label, capacity: input.capacity });
export const updateDriverLocation = (input: {
  driverId: string;
  lat: number;
  lng: number;
  currentStopId?: string | null;
}) =>
  updateVehicleLocation({
    vehicleId: input.driverId,
    lat: input.lat,
    lng: input.lng,
    currentStopId: input.currentStopId,
  });
export const setDriverActive = setVehicleActive;
export const recordPickup = async (input: {
  driverId: string;
  stopId: string;
  destinationId: string;
  requestIds?: string[];
  partySize?: number;
}) => {
  const { event } = await boardParties({
    vehicleId: input.driverId,
    stopId: input.stopId,
    destinationId: input.destinationId,
    partyIds: input.requestIds,
    seats: input.partySize,
  });
  return event;
};
export const dropOff = async (input: { driverId: string; partySize: number }) => {
  const { vehicle } = await alight({
    vehicleId: input.driverId,
    seats: input.partySize,
  });
  return vehicle;
};
