export type StopId = string;

/** Which MEM shuttle services pick up at this stand. */
export type StopService = "onsite" | "offsite" | "both";

/** The service a shuttle runs, picked by its driver at sign-in. */
export type ShuttleService = Exclude<StopService, "both">;

export interface Stop {
  id: StopId;
  name: string;
  shortCode: string;
  lat: number;
  lng: number;
  description: string;
  service?: StopService;
  /** Drivers within this many meters are treated as at the stop. */
  arrivalRadiusM?: number;
}

/** Passenger party waiting at a stand (stop). */
export type PartyStatus =
  | "waiting"
  | "cleared"
  | "boarding"
  | "onboard"
  | "delivered"
  | "cancelled";

export interface PassengerParty {
  id: string;
  stopId: StopId;
  destinationId: StopId;
  partySize: number;
  status: PartyStatus;
  /** Vehicle cleared / carrying this party */
  vehicleId: string | null;
  clearanceId: string | null;
  createdAt: string;
  updatedAt: string;
  note?: string;
  contactHint?: string;
  /** SHA-256 of the cancel token the requesting phone holds; never sent to any client. */
  cancelTokenHash?: string;
  /** Set when the request was closed for the rider: nobody picked it up in time, or the driver couldn't find them. */
  cancelReason?: "expired" | "no_show";
}

/**
 * Vehicle / shuttle seat ledger (airport ground-ops style):
 *   available = capacity - occupied - reserved
 * - occupied: heads currently onboard
 * - reserved: seats held by issued clearances not yet boarded
 */
export type VehicleStatus =
  | "available"
  | "enroute"
  | "at_stand"
  | "boarding"
  | "full"
  | "offline";

export interface Vehicle {
  id: string;
  callsign: string;
  capacity: number;
  service: ShuttleService;
  occupied: number;
  status: VehicleStatus;
  lat: number | null;
  lng: number | null;
  /** Last check-in from the driver's phone (a GPS fix, or going back online); presence cutoffs run off it. */
  lastLocationAt: string | null;
  currentStopId: StopId | null;
  /** Where the driver is heading / routing toward */
  headingStopId: StopId | null;
  active: boolean;
  createdAt: string;
}

/** Ground-control clearance: “Vehicle X, pick up N seats at stand Y”. */
export type ClearanceStatus =
  | "issued"
  | "accepted"
  | "boarding"
  | "completed"
  | "cancelled";

export interface Clearance {
  id: string;
  vehicleId: string;
  vehicleCallsign: string;
  stopId: StopId;
  stopName: string;
  seatsReserved: number;
  partyIds: string[];
  destinationSummary: string;
  etaMinutes: number;
  status: ClearanceStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardingEvent {
  id: string;
  vehicleId: string;
  stopId: StopId;
  destinationId: StopId;
  partyIds: string[];
  seats: number;
  kind: "board" | "alight" | "no_show";
  createdAt: string;
}

/** Derived seat snapshot for UI / drivers. */
export interface SeatLedger {
  capacity: number;
  occupied: number;
  reserved: number;
  available: number;
}

export interface StandLoad {
  stop: Stop;
  waitingSeats: number;
  clearedSeats: number;
  parties: PassengerParty[];
}

export interface AppState {
  schemaVersion: number;
  stops: Stop[];
  parties: PassengerParty[];
  vehicles: Vehicle[];
  clearances: Clearance[];
  events: BoardingEvent[];
  updatedAt: string;
}

/** @deprecated aliases kept for gradual UI migration */
export type RideRequest = PassengerParty;
export type Driver = Vehicle;
export type DispatchSuggestion = Clearance;
export type PickupEvent = BoardingEvent;
export type RequestStatus = PartyStatus;
