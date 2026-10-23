import { activeClearances, seatLedger } from "./seats";
import { serviceStatusByStop, type StopServiceStatus } from "./service-hours";
import type {
  AppState,
  BoardingEvent,
  Clearance,
  PassengerParty,
  SeatLedger,
  Stop,
  StopId,
  Vehicle,
} from "./types";

export type PublicVehicle = Pick<
  Vehicle,
  "id" | "callsign" | "active" | "lat" | "lng" | "currentStopId" | "headingStopId" | "service"
> & { seats: Pick<SeatLedger, "available"> };

export type PublicClearance = Pick<Clearance, "vehicleId" | "stopId" | "status">;

export type PublicRide = Pick<
  PassengerParty,
  "id" | "stopId" | "destinationId" | "partySize" | "status" | "vehicleId"
>;

/**
 * What anonymous callers get from GET /api/state: only what passenger screens use.
 * Never add other riders' requests, rider free text, or offline shuttles here.
 */
export interface PublicState {
  stops: Stop[];
  /** Open or closed right now, by the server's clock. */
  serviceStatus: Record<StopId, StopServiceStatus>;
  /** Shuttles in service only, so an offline shuttle's last position stays private. */
  vehicles: PublicVehicle[];
  /** Which shuttle is coming to which stop, without seat counts or riders. */
  clearances: PublicClearance[];
  /** This phone's latest ride request, found by its cancel-token cookie. */
  ride: PublicRide | null;
}

export type VehicleWithSeats = Vehicle & { seats: SeatLedger };

export type StaffParty = Omit<PassengerParty, "cancelTokenHash">;

/** GET /api/state for a signed-in driver or admin; a superset, so passenger screens work for staff too. */
export interface StaffState extends PublicState {
  schemaVersion: number;
  vehicles: VehicleWithSeats[];
  clearances: Clearance[];
  activeClearances: Clearance[];
  parties: StaffParty[];
  events: BoardingEvent[];
  updatedAt: string;
}

export function publicRide(p: PassengerParty): PublicRide {
  return {
    id: p.id,
    stopId: p.stopId,
    destinationId: p.destinationId,
    partySize: p.partySize,
    status: p.status,
    vehicleId: p.vehicleId,
  };
}

export function staffParty(p: PassengerParty): StaffParty {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cancelTokenHash, ...party } = p;
  return party;
}

export function publicState(state: AppState, ride: PassengerParty | null): PublicState {
  return {
    stops: state.stops,
    serviceStatus: serviceStatusByStop(state.stops),
    vehicles: state.vehicles
      .filter((v) => v.active)
      .map((v) => ({
        id: v.id,
        callsign: v.callsign,
        active: v.active,
        lat: v.lat,
        lng: v.lng,
        currentStopId: v.currentStopId,
        headingStopId: v.headingStopId,
        service: v.service,
        seats: { available: seatLedger(state, v).available },
      })),
    clearances: activeClearances(state).map((c) => ({
      vehicleId: c.vehicleId,
      stopId: c.stopId,
      status: c.status,
    })),
    ride: ride ? publicRide(ride) : null,
  };
}

export function staffState(state: AppState, ride: PassengerParty | null): StaffState {
  return {
    schemaVersion: state.schemaVersion,
    stops: state.stops,
    serviceStatus: serviceStatusByStop(state.stops),
    vehicles: state.vehicles.map((v) => ({ ...v, seats: seatLedger(state, v) })),
    clearances: state.clearances,
    activeClearances: activeClearances(state),
    parties: state.parties.map(staffParty),
    events: state.events,
    ride: ride ? publicRide(ride) : null,
    updatedAt: state.updatedAt,
  };
}
