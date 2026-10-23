import { seatLedger } from "./seats";
import { runsTrip } from "./service-hours";
import type {
  AppState,
  Clearance,
  PassengerParty,
  Stop,
  Vehicle,
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

function vehiclePosition(vehicle: Vehicle, stops: Stop[]) {
  if (vehicle.lat != null && vehicle.lng != null) {
    return { lat: vehicle.lat, lng: vehicle.lng };
  }
  if (vehicle.currentStopId) {
    const stop = stopById(stops, vehicle.currentStopId);
    if (stop) return { lat: stop.lat, lng: stop.lng };
  }
  return null;
}

function destSummary(state: AppState, parties: PassengerParty[]): string {
  const counts = new Map<string, number>();
  for (const p of parties) {
    const name = stopById(state.stops, p.destinationId)?.name ?? p.destinationId;
    counts.set(name, (counts.get(name) ?? 0) + p.partySize);
  }
  return [...counts.entries()]
    .map(([name, n]) => `${n}→${name}`)
    .join(", ");
}

/**
 * Ground control: issue clearances so each waiting stand gets the nearest
 * vehicle with enough *available* seats (capacity − occupied − reserved).
 */
export function computeClearances(state: AppState): Clearance[] {
  const waiting = state.parties.filter((p) => p.status === "waiting");
  const alreadyCleared = state.parties.filter(
    (p) => p.status === "cleared" || p.status === "boarding",
  );

  const byStop = new Map<string, PassengerParty[]>();
  for (const req of waiting) {
    const list = byStop.get(req.stopId) ?? [];
    list.push(req);
    byStop.set(req.stopId, list);
  }

  // Keep existing active clearances as the baseline (rebuilt below for waiting).
  const keepExisting: Clearance[] = state.clearances.filter((c) => {
    if (c.status === "completed" || c.status === "cancelled") return false;
    // Drop if all parties gone
    const still = c.partyIds.some((id) =>
      alreadyCleared.some((p) => p.id === id),
    );
    return still;
  });

  const stopLoads = [...byStop.entries()]
    .map(([stopId, parties]) => {
      const seats = parties.reduce((n, r) => n + r.partySize, 0);
      const oldest = Math.min(
        ...parties.map((r) => new Date(r.createdAt).getTime()),
      );
      const waitMin = (Date.now() - oldest) / 60_000;
      return { stopId, parties, seats, waitMin, score: seats * 2 + waitMin };
    })
    .sort((a, b) => b.score - a.score);

  type Slot = { vehicle: Vehicle; remaining: number };
  const slots: Slot[] = state.vehicles
    .filter((v) => v.active)
    .map((v) => ({ vehicle: v, remaining: seatLedger(state, v).available }));

  // Subtract seats already held by keepExisting clearances from slot remaining
  // (seatLedger already counts reserved from cleared parties).
  const claimed = new Set<string>();
  const fresh: Clearance[] = [];
  const now = new Date().toISOString();

  for (const load of stopLoads) {
    const stop = stopById(state.stops, load.stopId);
    if (!stop) continue;
    const unclaimed = load.parties.filter((r) => !claimed.has(r.id));
    if (unclaimed.length === 0) continue;

    // Rank vehicles by ETA; try each until someone can take at least one party.
    const ranked: { slotIndex: number; minutes: number }[] = [];
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].remaining <= 0) continue;
      const pos = vehiclePosition(slots[i].vehicle, state.stops);
      if (!pos) continue;
      const km = haversineKm(pos, stop);
      const minutes = Math.max(1, Math.round((km / AVG_SHUTTLE_KMH) * 60));
      ranked.push({ slotIndex: i, minutes });
    }
    ranked.sort((a, b) => a.minutes - b.minutes);

    let assignedAny = false;
    for (const candidate of ranked) {
      const stillUnclaimed = unclaimed.filter((r) => !claimed.has(r.id));
      if (stillUnclaimed.length === 0) break;

      const slot = slots[candidate.slotIndex];
      if (slot.remaining <= 0) continue;

      const pack: PassengerParty[] = [];
      let seats = slot.remaining;
      for (const req of stillUnclaimed) {
        const destination = stopById(state.stops, req.destinationId);
        const serves = !destination || runsTrip(slot.vehicle.service, stop, destination);
        if (serves && req.partySize <= seats) {
          pack.push(req);
          seats -= req.partySize;
          claimed.add(req.id);
        }
      }
      if (pack.length === 0) continue;

      slots[candidate.slotIndex].remaining = seats;
      const seatsReserved = pack.reduce((n, p) => n + p.partySize, 0);
      const waitHint =
        load.waitMin >= 5
          ? `${Math.round(load.waitMin)} min stand wait`
          : "fresh demand";

      fresh.push({
        id: `clr_${pack.map((p) => p.id.slice(0, 8)).join("_")}`,
        vehicleId: slot.vehicle.id,
        vehicleCallsign: slot.vehicle.callsign,
        stopId: stop.id,
        stopName: stop.name,
        seatsReserved,
        partyIds: pack.map((p) => p.id),
        destinationSummary: destSummary(state, pack),
        etaMinutes: candidate.minutes,
        status: "issued",
        reason: `Nearest free seats · ${waitHint} · hold ${seatsReserved}`,
        createdAt: now,
        updatedAt: now,
      });
      assignedAny = true;
      // Keep trying other vehicles for leftover parties at this stand.
    }
    if (!assignedAny) continue;
  }

  // Merge: prefer fresh for waiting; keep existing for already-cleared
  const existingIds = new Set(
    keepExisting.flatMap((c) => c.partyIds),
  );
  const merged = [
    ...keepExisting.map((c) => ({
      ...c,
      seatsReserved: c.partyIds
        .map((id) => state.parties.find((p) => p.id === id))
        .filter(Boolean)
        .reduce((n, p) => n + (p?.partySize ?? 0), 0),
      updatedAt: now,
    })),
    ...fresh.filter((c) => !c.partyIds.some((id) => existingIds.has(id))),
  ];

  return merged;
}

/** Apply issued clearances: waiting parties → cleared + vehicleId + reserved seats. */
export function applyClearances(
  state: AppState,
  clearances: Clearance[],
): AppState {
  const assignMap = new Map<string, Clearance>();
  for (const c of clearances) {
    if (c.status === "completed" || c.status === "cancelled") continue;
    for (const id of c.partyIds) assignMap.set(id, c);
  }

  const now = new Date().toISOString();
  const parties = state.parties.map((p) => {
    const clr = assignMap.get(p.id);
    if (!clr) return p;
    if (p.status !== "waiting") {
      // Keep linkage if already cleared/boarding
      if (
        (p.status === "cleared" || p.status === "boarding") &&
        !p.clearanceId
      ) {
        return {
          ...p,
          vehicleId: clr.vehicleId,
          clearanceId: clr.id,
          updatedAt: now,
        };
      }
      return p;
    }
    return {
      ...p,
      status: "cleared" as const,
      vehicleId: clr.vehicleId,
      clearanceId: clr.id,
      updatedAt: now,
    };
  });

  const vehicles = state.vehicles.map((v) => {
    if (!v.active) return { ...v, status: "offline" as const };
    const ledger = seatLedger({ ...state, parties }, v);
    let status = v.status;
    if (ledger.available <= 0) status = "full";
    else if (clearances.some((c) => c.vehicleId === v.id && c.status === "issued"))
      status = "enroute";
    else if (ledger.occupied === 0 && ledger.reserved === 0) status = "available";
    return { ...v, status };
  });

  return {
    ...state,
    parties,
    vehicles,
    clearances,
    updatedAt: now,
  };
}

export function refreshGroundControl(state: AppState): AppState {
  const clearances = computeClearances(state);
  return applyClearances({ ...state, clearances }, clearances);
}
