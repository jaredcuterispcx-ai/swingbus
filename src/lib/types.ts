export type StopId = string;

export interface Stop {
  id: StopId;
  name: string;
  shortCode: string;
  lat: number;
  lng: number;
  description: string;
}

export type RequestStatus = "waiting" | "assigned" | "picked_up" | "cancelled";

export interface RideRequest {
  id: string;
  stopId: StopId;
  destinationId: StopId;
  partySize: number;
  status: RequestStatus;
  assignedDriverId: string | null;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface Driver {
  id: string;
  label: string;
  capacity: number;
  onboard: number;
  lat: number | null;
  lng: number | null;
  lastLocationAt: string | null;
  active: boolean;
  currentStopId: StopId | null;
  createdAt: string;
}

export interface PickupEvent {
  id: string;
  driverId: string;
  stopId: StopId;
  destinationId: StopId;
  requestIds: string[];
  partySize: number;
  createdAt: string;
}

export interface DispatchSuggestion {
  driverId: string;
  driverLabel: string;
  stopId: StopId;
  stopName: string;
  waitingPeople: number;
  estimatedMinutes: number;
  reason: string;
  requestIds: string[];
}

export interface AppState {
  stops: Stop[];
  requests: RideRequest[];
  drivers: Driver[];
  pickups: PickupEvent[];
  suggestions: DispatchSuggestion[];
  updatedAt: string;
}
