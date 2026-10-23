import type {
  AppState,
  Clearance,
  PassengerParty,
  SeatLedger,
  Vehicle,
  VehicleStatus,
} from "./types";

/** Parties that still hold reserved seats on a vehicle. */
export function reservedParties(
  state: AppState,
  vehicleId: string,
): PassengerParty[] {
  return state.parties.filter(
    (p) =>
      p.vehicleId === vehicleId &&
      (p.status === "cleared" || p.status === "boarding"),
  );
}

export function seatsReserved(state: AppState, vehicleId: string): number {
  return reservedParties(state, vehicleId).reduce((n, p) => n + p.partySize, 0);
}

export function seatLedger(state: AppState, vehicle: Vehicle): SeatLedger {
  const reserved = seatsReserved(state, vehicle.id);
  const occupied = Math.max(0, vehicle.occupied);
  const available = Math.max(0, vehicle.capacity - occupied - reserved);
  return {
    capacity: vehicle.capacity,
    occupied,
    reserved,
    available,
  };
}

export function deriveVehicleStatus(
  vehicle: Vehicle,
  ledger: SeatLedger,
): VehicleStatus {
  if (!vehicle.active) return "offline";
  if (ledger.available <= 0) return "full";
  if (ledger.reserved > 0 && vehicle.currentStopId) return "boarding";
  if (ledger.reserved > 0) return "enroute";
  if (vehicle.currentStopId) return "at_stand";
  return "available";
}

export function openParties(state: AppState): PassengerParty[] {
  return state.parties.filter(
    (p) =>
      p.status === "waiting" ||
      p.status === "cleared" ||
      p.status === "boarding",
  );
}

export function waitingSeatsAtStop(state: AppState, stopId: string): number {
  return state.parties
    .filter((p) => p.stopId === stopId && p.status === "waiting")
    .reduce((n, p) => n + p.partySize, 0);
}

export function activeClearances(state: AppState): Clearance[] {
  return state.clearances.filter(
    (c) =>
      c.status === "issued" ||
      c.status === "accepted" ||
      c.status === "boarding",
  );
}

export function formatSeatTape(ledger: SeatLedger): string {
  return `${ledger.available} free · ${ledger.reserved} held · ${ledger.occupied}/${ledger.capacity} onboard`;
}
