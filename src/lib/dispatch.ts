import type {
  AppState,
  DispatchSuggestion,
  Driver,
  RideRequest,
  Stop,
} from "./types";

const EARTH_KM = 6371;
const AVG_SHUTTLE_KMH = 22;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

function stopById(stops: Stop[], id: string) {
  return stops.find((s) => s.id === id);
}

function driverPosition(driver: Driver, stops: Stop[]) {
  if (driver.lat != null && driver.lng != null) {
    return { lat: driver.lat, lng: driver.lng };
  }
  if (driver.currentStopId) {
    const stop = stopById(stops, driver.currentStopId);
    if (stop) return { lat: stop.lat, lng: stop.lng };
  }
  return null;
}

function freeSeats(driver: Driver) {
  return Math.max(0, driver.capacity - driver.onboard);
}

/**
 * Greedy dispatcher: for each waiting stop (by wait time + party size),
 * assign the nearest active driver with enough free seats.
 */
export function computeSuggestions(state: AppState): DispatchSuggestion[] {
  // Include assigned-but-not-picked-up so the board keeps showing active routes.
  const open = state.requests.filter(
    (r) => r.status === "waiting" || r.status === "assigned",
  );
  if (open.length === 0) return [];

  const byStop = new Map<string, RideRequest[]>();
  for (const req of open) {
    const list = byStop.get(req.stopId) ?? [];
    list.push(req);
    byStop.set(req.stopId, list);
  }

  const stopLoads = [...byStop.entries()]
    .map(([stopId, reqs]) => {
      const people = reqs.reduce((n, r) => n + r.partySize, 0);
      const oldest = Math.min(
        ...reqs.map((r) => new Date(r.createdAt).getTime()),
      );
      const waitMin = (Date.now() - oldest) / 60_000;
      return {
        stopId,
        reqs,
        people,
        waitMin,
        score: people * 2 + waitMin,
      };
    })
    .sort((a, b) => b.score - a.score);

  const drivers = state.drivers
    .filter((d) => d.active)
    .map((d) => ({ driver: d, remaining: freeSeats(d) }));

  const suggestions: DispatchSuggestion[] = [];
  const claimed = new Set<string>();

  for (const load of stopLoads) {
    const stop = stopById(state.stops, load.stopId);
    if (!stop) continue;

    const unclaimed = load.reqs.filter((r) => !claimed.has(r.id));
    if (unclaimed.length === 0) continue;

    type Candidate = {
      driver: Driver;
      remaining: number;
      minutes: number;
      index: number;
    };

    let best: Candidate | null = null;

    // Prefer a driver already assigned to parties at this stop.
    const preassignedId = unclaimed.find((r) => r.assignedDriverId)
      ?.assignedDriverId;

    for (let index = 0; index < drivers.length; index += 1) {
      const slot = drivers[index];
      if (slot.remaining <= 0) continue;
      if (preassignedId && slot.driver.id !== preassignedId) continue;
      const pos = driverPosition(slot.driver, state.stops);
      if (!pos) continue;
      const km = haversineKm(pos, stop);
      const minutes = Math.max(1, Math.round((km / AVG_SHUTTLE_KMH) * 60));
      if (!best || minutes < best.minutes) {
        best = {
          driver: slot.driver,
          remaining: slot.remaining,
          minutes,
          index,
        };
      }
    }

    // If a preassigned driver has no GPS yet, fall back to nearest with seats.
    if (!best && preassignedId) {
      for (let index = 0; index < drivers.length; index += 1) {
        const slot = drivers[index];
        if (slot.remaining <= 0) continue;
        const pos = driverPosition(slot.driver, state.stops);
        if (!pos) continue;
        const km = haversineKm(pos, stop);
        const minutes = Math.max(1, Math.round((km / AVG_SHUTTLE_KMH) * 60));
        if (!best || minutes < best.minutes) {
          best = {
            driver: slot.driver,
            remaining: slot.remaining,
            minutes,
            index,
          };
        }
      }
    }

    if (!best) continue;

    const chosen: Candidate = best;
    const pack: RideRequest[] = [];
    let seats = chosen.remaining;
    for (const req of unclaimed) {
      if (req.partySize <= seats) {
        pack.push(req);
        seats -= req.partySize;
        claimed.add(req.id);
      }
    }
    if (pack.length === 0) continue;

    drivers[chosen.index].remaining = seats;

    const people = pack.reduce((n, r) => n + r.partySize, 0);
    const waitHint =
      load.waitMin >= 5
        ? `${Math.round(load.waitMin)} min wait`
        : "fresh demand";

    suggestions.push({
      driverId: chosen.driver.id,
      driverLabel: chosen.driver.label,
      stopId: stop.id,
      stopName: stop.name,
      waitingPeople: people,
      estimatedMinutes: chosen.minutes,
      reason: `Nearest free capacity · ${waitHint} · ${people} pax`,
      requestIds: pack.map((r) => r.id),
    });
  }

  return suggestions;
}

/** Apply suggestions: mark matching waiting requests as assigned. */
export function applyAssignments(
  state: AppState,
  suggestions: DispatchSuggestion[],
): AppState {
  const assignMap = new Map<string, string>();
  for (const s of suggestions) {
    for (const id of s.requestIds) assignMap.set(id, s.driverId);
  }

  const now = new Date().toISOString();
  const requests = state.requests.map((r) => {
    const driverId = assignMap.get(r.id);
    if (!driverId || r.status !== "waiting") return r;
    return {
      ...r,
      status: "assigned" as const,
      assignedDriverId: driverId,
      updatedAt: now,
    };
  });

  return {
    ...state,
    requests,
    suggestions,
    updatedAt: now,
  };
}
