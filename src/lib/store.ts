import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { applyAssignments, computeSuggestions } from "./dispatch";
import { DEFAULT_STOPS } from "./stops";
import type {
  AppState,
  Driver,
  PickupEvent,
  RideRequest,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

let writeChain: Promise<void> = Promise.resolve();

function emptyState(): AppState {
  return {
    stops: DEFAULT_STOPS,
    requests: [],
    drivers: [],
    pickups: [],
    suggestions: [],
    updatedAt: new Date().toISOString(),
  };
}

async function ensureStore(): Promise<AppState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.stops?.length) parsed.stops = DEFAULT_STOPS;
    return parsed;
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

function refreshDispatch(state: AppState): AppState {
  const suggestions = computeSuggestions(state);
  return applyAssignments({ ...state, suggestions }, suggestions);
}

export async function getState(): Promise<AppState> {
  return withWrite(async (state) => {
    const next = refreshDispatch(state);
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      await persist(next);
    }
    return next;
  });
}

export async function createRequest(input: {
  stopId: string;
  destinationId: string;
  partySize: number;
  note?: string;
}): Promise<RideRequest> {
  return withWrite(async (state) => {
    if (!state.stops.some((s) => s.id === input.stopId)) {
      throw new Error("Unknown pickup stop");
    }
    if (!state.stops.some((s) => s.id === input.destinationId)) {
      throw new Error("Unknown destination");
    }
    if (input.stopId === input.destinationId) {
      throw new Error("Destination must differ from pickup stop");
    }
    const partySize = Math.min(12, Math.max(1, Math.floor(input.partySize)));
    const now = new Date().toISOString();
    const request: RideRequest = {
      id: randomUUID(),
      stopId: input.stopId,
      destinationId: input.destinationId,
      partySize,
      status: "waiting",
      assignedDriverId: null,
      createdAt: now,
      updatedAt: now,
      note: input.note?.slice(0, 120),
    };
    let next: AppState = {
      ...state,
      requests: [...state.requests, request],
      updatedAt: now,
    };
    next = refreshDispatch(next);
    await persist(next);
    return next.requests.find((r) => r.id === request.id)!;
  });
}

export async function cancelRequest(id: string): Promise<RideRequest | null> {
  return withWrite(async (state) => {
    const idx = state.requests.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated = {
      ...state.requests[idx],
      status: "cancelled" as const,
      updatedAt: now,
    };
    const requests = [...state.requests];
    requests[idx] = updated;
    let next: AppState = { ...state, requests, updatedAt: now };
    next = refreshDispatch(next);
    await persist(next);
    return updated;
  });
}

export async function registerDriver(input: {
  label: string;
  capacity?: number;
}): Promise<Driver> {
  return withWrite(async (state) => {
    const label = input.label.trim().slice(0, 32);
    if (!label) throw new Error("Shuttle label is required");
    const now = new Date().toISOString();
    const driver: Driver = {
      id: randomUUID(),
      label,
      capacity: Math.min(40, Math.max(4, input.capacity ?? 14)),
      onboard: 0,
      lat: null,
      lng: null,
      lastLocationAt: null,
      active: true,
      currentStopId: null,
      createdAt: now,
    };
    let next: AppState = {
      ...state,
      drivers: [...state.drivers.filter((d) => d.label !== label), driver],
      updatedAt: now,
    };
    next = refreshDispatch(next);
    await persist(next);
    return driver;
  });
}

export async function updateDriverLocation(input: {
  driverId: string;
  lat: number;
  lng: number;
  currentStopId?: string | null;
}): Promise<Driver | null> {
  return withWrite(async (state) => {
    const idx = state.drivers.findIndex((d) => d.id === input.driverId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated: Driver = {
      ...state.drivers[idx],
      lat: input.lat,
      lng: input.lng,
      lastLocationAt: now,
      currentStopId:
        input.currentStopId === undefined
          ? state.drivers[idx].currentStopId
          : input.currentStopId,
      active: true,
    };
    const drivers = [...state.drivers];
    drivers[idx] = updated;
    let next: AppState = { ...state, drivers, updatedAt: now };
    next = refreshDispatch(next);
    await persist(next);
    return updated;
  });
}

export async function setDriverActive(
  driverId: string,
  active: boolean,
): Promise<Driver | null> {
  return withWrite(async (state) => {
    const idx = state.drivers.findIndex((d) => d.id === driverId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const updated = { ...state.drivers[idx], active };
    const drivers = [...state.drivers];
    drivers[idx] = updated;
    let next: AppState = { ...state, drivers, updatedAt: now };
    next = refreshDispatch(next);
    await persist(next);
    return updated;
  });
}

export async function recordPickup(input: {
  driverId: string;
  stopId: string;
  destinationId: string;
  requestIds?: string[];
  partySize?: number;
}): Promise<PickupEvent> {
  return withWrite(async (state) => {
    const driver = state.drivers.find((d) => d.id === input.driverId);
    if (!driver) throw new Error("Unknown driver");
    if (!state.stops.some((s) => s.id === input.stopId)) {
      throw new Error("Unknown stop");
    }
    if (!state.stops.some((s) => s.id === input.destinationId)) {
      throw new Error("Unknown destination");
    }

    const now = new Date().toISOString();
    let requestIds = input.requestIds ?? [];
    let partySize = input.partySize ?? 0;

    if (requestIds.length === 0) {
      const candidates = state.requests.filter(
        (r) =>
          r.stopId === input.stopId &&
          r.destinationId === input.destinationId &&
          (r.status === "waiting" || r.status === "assigned") &&
          (!r.assignedDriverId || r.assignedDriverId === input.driverId),
      );
      requestIds = candidates.map((c) => c.id);
      partySize = candidates.reduce((n, c) => n + c.partySize, 0);
    } else if (!partySize) {
      partySize = state.requests
        .filter((r) => requestIds.includes(r.id))
        .reduce((n, r) => n + r.partySize, 0);
    }

    partySize = Math.max(1, partySize);

    const pickup: PickupEvent = {
      id: randomUUID(),
      driverId: input.driverId,
      stopId: input.stopId,
      destinationId: input.destinationId,
      requestIds,
      partySize,
      createdAt: now,
    };

    const idSet = new Set(requestIds);
    const requests = state.requests.map((r) =>
      idSet.has(r.id)
        ? {
            ...r,
            status: "picked_up" as const,
            assignedDriverId: input.driverId,
            updatedAt: now,
          }
        : r,
    );

    const drivers = state.drivers.map((d) =>
      d.id === input.driverId
        ? {
            ...d,
            onboard: Math.min(d.capacity, d.onboard + partySize),
            currentStopId: input.stopId,
            active: true,
          }
        : d,
    );

    let next: AppState = {
      ...state,
      requests,
      drivers,
      pickups: [pickup, ...state.pickups].slice(0, 200),
      updatedAt: now,
    };
    next = refreshDispatch(next);
    await persist(next);
    return pickup;
  });
}

export async function dropOff(input: {
  driverId: string;
  partySize: number;
}): Promise<Driver | null> {
  return withWrite(async (state) => {
    const idx = state.drivers.findIndex((d) => d.id === input.driverId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const drop = Math.max(0, Math.floor(input.partySize));
    const updated = {
      ...state.drivers[idx],
      onboard: Math.max(0, state.drivers[idx].onboard - drop),
    };
    const drivers = [...state.drivers];
    drivers[idx] = updated;
    let next: AppState = { ...state, drivers, updatedAt: now };
    next = refreshDispatch(next);
    await persist(next);
    return updated;
  });
}

export async function resetDemo(): Promise<AppState> {
  return withWrite(async () => {
    const state = emptyState();
    await persist(state);
    return state;
  });
}
