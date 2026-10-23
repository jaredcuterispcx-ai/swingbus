import { maxPartySize, minutesQuiet, presenceOf, type Presence } from "./lifecycle";
import { activeClearances, seatLedger } from "./seats";
import type {
  AppState,
  BoardingEvent,
  Clearance,
  PassengerParty,
  SeatLedger,
  Stop,
  Vehicle,
} from "./types";

/** Worked out on the server, so the feed never carries a shuttle's check-in times. */
type PresenceFields = {
  /** "stale" after 2 quiet minutes ("last seen"), "lost" once out of contact at 5. */
  presence: Presence;
  /** Whole minutes since the shuttle's phone last checked in. */
  lastSeenMin: number;
};

export type PublicVehicle = Pick<
  Vehicle,
  "id" | "callsign" | "active" | "lat" | "lng" | "currentStopId" | "headingStopId"
> &
  PresenceFields & { seats: Pick<SeatLedger, "available"> };

export type PublicClearance = Pick<Clearance, "vehicleId" | "stopId" | "status">;

export type PublicRide = Pick<
  PassengerParty,
  "id" | "stopId" | "destinationId" | "partySize" | "status" | "vehicleId" | "cancelReason" | "updatedAt"
>;

/**
 * What anonymous callers get from GET /api/state: only what passenger screens use.
 * Never add other riders' requests, rider free text, or offline shuttles here.
 */
export interface PublicState {
  stops: Stop[];
  /** Shuttles in service only, so an offline shuttle's last position stays private. */
  vehicles: PublicVehicle[];
  /** Which shuttle is coming to which stop, without seat counts or riders. */
  clearances: PublicClearance[];
  /** This phone's latest ride request, found by its cancel-token cookie. */
  ride: PublicRide | null;
  /** Most riders one request may have: the biggest shuttle ground control can send, at most 12. */
  maxPartySize: number;
  /** When the server took this snapshot; rider screens time how long ago their ride ended against it. */
  updatedAt: string;
}

export type VehicleWithSeats = Vehicle & PresenceFields & { seats: SeatLedger };

export type StaffParty = Omit<PassengerParty, "cancelTokenHash">;

/** GET /api/state for a signed-in driver or admin; a superset, so passenger screens work for staff too. */
export interface StaffState extends PublicState {
  schemaVersion: number;
  vehicles: VehicleWithSeats[];
  clearances: Clearance[];
  activeClearances: Clearance[];
  parties: StaffParty[];
  events: BoardingEvent[];
}

function presenceFields(v: Vehicle, now: number): PresenceFields {
  return { presence: presenceOf(v, now), lastSeenMin: minutesQuiet(v, now) };
}

export function publicRide(p: PassengerParty): PublicRide {
  return {
    id: p.id,
    stopId: p.stopId,
    destinationId: p.destinationId,
    partySize: p.partySize,
    status: p.status,
    vehicleId: p.vehicleId,
    cancelReason: p.cancelReason,
    updatedAt: p.updatedAt,
  };
}

export function staffParty(p: PassengerParty): StaffParty {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cancelTokenHash, ...party } = p;
  return party;
}

export function publicState(state: AppState, ride: PassengerParty | null): PublicState {
  const now = Date.parse(state.updatedAt);
  return {
    stops: state.stops,
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
        ...presenceFields(v, now),
        seats: { available: seatLedger(state, v).available },
      })),
    clearances: activeClearances(state).map((c) => ({
      vehicleId: c.vehicleId,
      stopId: c.stopId,
      status: c.status,
    })),
    ride: ride ? publicRide(ride) : null,
    maxPartySize: maxPartySize(state.vehicles, now),
    updatedAt: state.updatedAt,
  };
}

export function staffState(state: AppState, ride: PassengerParty | null): StaffState {
  const now = Date.parse(state.updatedAt);
  return {
    schemaVersion: state.schemaVersion,
    stops: state.stops,
    vehicles: state.vehicles.map((v) => ({
      ...v,
      ...presenceFields(v, now),
      seats: seatLedger(state, v),
    })),
    clearances: state.clearances,
    activeClearances: activeClearances(state),
    parties: state.parties.map(staffParty),
    events: state.events,
    ride: ride ? publicRide(ride) : null,
    maxPartySize: maxPartySize(state.vehicles, now),
    updatedAt: state.updatedAt,
  };
}
