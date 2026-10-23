import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { allocateCallsign, normalizeCallsign, takenCallsigns } from "./callsigns";
import { refreshGroundControl } from "./dispatch";
import { stopAt } from "./geo";
import { seatLedger } from "./seats";
import { assertInService } from "./service-hours";
import { DEFAULT_STOPS } from "./stops";
import type {
  AppState,
  BoardingEvent,
  Clearance,
  PassengerParty,
  ShuttleService,
  Stop,
  StopService,
  Vehicle,
} from "./types";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const STORE_PATH = path.join(DATA_DIR, "store.json");
export const SCHEMA_VERSION = 3;

let writeChain: Promise<void> = Promise.resolve();

function emptyState(stops: Stop[] = DEFAULT_STOPS): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    stops: stops.map((s) => ({ ...s })),
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
    if (!Array.isArray(state.stops) || state.stops.length === 0) {
      state.stops = DEFAULT_STOPS.map((s) => ({ ...s }));
    }
    state.vehicles = (state.vehicles ?? []).map((v) => ({
      ...v,
      headingStopId: v.headingStopId ?? null,
      service: v.service ?? "onsite",
    }));
    return state;
  }

  // v1/v2 → v3: drivers/requests → parties/vehicles + MEM stops
  const base = emptyState();
  base.stops = DEFAULT_STOPS;

  const drivers = (raw.drivers as Array<Record<string, unknown>>) ?? [];
  base.vehicles = drivers.map((d) => ({
    id: String(d.id),
    callsign: String(d.label ?? d.callsign ?? "Shuttle"),
    capacity: Number(d.capacity ?? 14),
    service: "onsite" as const,
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

function pruneOrphanParties(state: AppState): AppState {
  const ids = new Set(state.stops.map((s) => s.id));
  const parties = state.parties.filter(
    (p) => ids.has(p.stopId) && ids.has(p.destinationId),
  );
  if (parties.length === state.parties.length) return state;
  return {
    ...state,
    parties,
    clearances: [],
    updatedAt: new Date().toISOString(),
  };
}

async function ensureStore(): Promise<AppState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let text: string;
  try {
    text = await fs.readFile(STORE_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const state = emptyState();
    await persist(state);
    return state;
  }
  // An unreadable store is an error, not a fresh start: reseeding would
  // overwrite admin-edited stops with the defaults.
  const raw = JSON.parse(text) as Record<string, unknown>;
  const migrated = raw.schemaVersion !== SCHEMA_VERSION;
  let state = migrate(raw);
  state.schemaVersion = SCHEMA_VERSION;
  const before = state.parties.length;
  state = pruneOrphanParties(state);
  if (migrated || state.parties.length !== before) {
    await persist(state);
  }
  return state;
}

async function persist(state: AppState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write, fsync, rename, fsync the directory: neither a crash nor a power
  // loss can leave a truncated store or undo the rename.
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  const file = await fs.open(tmp, "w");
  try {
    await file.writeFile(JSON.stringify(state, null, 2));
    await file.sync();
  } finally {
    await file.close();
  }
  await fs.rename(tmp, STORE_PATH);
  await syncDir(DATA_DIR);
}

async function syncDir(dir: string) {
  // Windows can't fsync a directory handle.
  if (process.platform === "win32") return;
  const handle = await fs.open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** refreshGroundControl restamps updatedAt on every call; that alone isn't worth a write. */
function withoutTimestamps(state: AppState): string {
  return JSON.stringify(state, (key, value) => (key === "updatedAt" ? undefined : value));
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
    if (withoutTimestamps(next) !== withoutTimestamps(state)) {
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
    for (const id of [input.stopId, input.destinationId]) {
      assertInService(state.stops.find((s) => s.id === id)!);
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
  service?: ShuttleService;
}): Promise<Vehicle> {
  return withWrite(async (state) => {
    const requested = normalizeCallsign(input.callsign).slice(0, 32);
    if (!requested) throw new Error("Callsign / shuttle label is required");
    const callsign = takenCallsigns(state.vehicles).has(requested.toLowerCase())
      ? allocateCallsign(requested, state.vehicles)
      : requested;
    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: randomUUID(),
      callsign,
      capacity: Math.min(40, Math.max(4, input.capacity ?? 14)),
      service: input.service ?? "onsite",
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
    // Without an explicit stop, snap to whichever stop the GPS fix is inside;
    // keep the last stop when between stops.
    const detected =
      input.currentStopId === undefined
        ? stopAt(state.stops, { lat: input.lat, lng: input.lng })?.id
        : undefined;
    const updated: Vehicle = {
      ...state.vehicles[idx],
      lat: input.lat,
      lng: input.lng,
      lastLocationAt: now,
      currentStopId:
        input.currentStopId !== undefined
          ? input.currentStopId
          : (detected ?? state.vehicles[idx].currentStopId),
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
    const isOpen = (p: PassengerParty) =>
      p.status === "waiting" || p.status === "cleared" || p.status === "boarding";
    let partyIds = input.partyIds ?? [];
    let seats = input.seats ?? 0;
    let parties = state.parties;

    if (partyIds.length > 0) {
      // Seats come from riders still waiting, so resending a group can't double count.
      const requested = new Set(partyIds);
      const boarding = state.parties.filter((p) => requested.has(p.id) && isOpen(p));
      if (boarding.length === 0) throw new Error("Those riders are no longer waiting");
      partyIds = boarding.map((p) => p.id);
      seats = boarding.reduce((n, p) => n + p.partySize, 0);
    } else {
      const candidates = state.parties
        .filter(
          (p) =>
            p.stopId === input.stopId &&
            isOpen(p) &&
            (!p.vehicleId || p.vehicleId === input.vehicleId) &&
            (!input.destinationId || p.destinationId === input.destinationId),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (!seats) {
        partyIds = candidates.map((c) => c.id);
        seats = candidates.reduce((n, c) => n + c.partySize, 0);
      } else {
        // Driver-logged group: their head count is what boarded. Waiting requests
        // for the same trip that fit inside it are picked up; the rest are walk-ups.
        seats = Math.floor(seats);
        const picked: string[] = [];
        let walkUps = seats;
        for (const c of candidates) {
          if (c.partySize > walkUps) continue;
          picked.push(c.id);
          walkUps -= c.partySize;
        }
        if (walkUps > 0 && input.destinationId) {
          const manual: PassengerParty = {
            id: randomUUID(),
            stopId: input.stopId,
            destinationId: input.destinationId,
            partySize: walkUps,
            status: "boarding",
            vehicleId: input.vehicleId,
            clearanceId: null,
            createdAt: now,
            updatedAt: now,
          };
          parties = [...state.parties, manual];
          picked.push(manual.id);
        }
        partyIds = picked;
      }
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
    const vehicle = state.vehicles[idx];
    const toDest = input.destinationId
      ? state.parties.filter(
          (p) =>
            p.vehicleId === input.vehicleId &&
            p.status === "onboard" &&
            p.destinationId === input.destinationId,
        )
      : [];
    const drop = toDest.length
      ? toDest.reduce((n, p) => n + p.partySize, 0)
      : Math.max(0, Math.floor(input.seats));
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
    const adjusted = state.parties.map((p) => {
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
      stopId:
        input.destinationId ??
        vehicle.currentStopId ??
        state.stops[0]?.id ??
        "food-trucks-war-room",
      destinationId:
        input.destinationId ??
        vehicle.currentStopId ??
        state.stops[0]?.id ??
        "food-trucks-war-room",
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

/** Clears riders and fleet but keeps the admin-managed stop list. */
export async function resetDemo(): Promise<AppState> {
  return withWrite(async (current) => {
    const state = emptyState(current.stops);
    await persist(state);
    return state;
  });
}

export type StopInput = {
  name?: string;
  shortCode?: string;
  description?: string;
  lat?: number;
  lng?: number;
  service?: StopService | null;
  arrivalRadiusM?: number | null;
};

const SERVICES: StopService[] = ["onsite", "offsite", "both"];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "stop"
  );
}

function initials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const code =
    words.length > 1
      ? words.map((w) => w[0]).join("")
      : (words[0] ?? "ST").slice(0, 2);
  return code.toUpperCase().slice(0, 4);
}

function applyStopInput(base: Stop, input: StopInput): Stop {
  const next: Stop = { ...base };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Stop name is required");
    next.name = name.slice(0, 60);
  }
  if (input.shortCode !== undefined) {
    const code = input.shortCode.trim().toUpperCase().replace(/\s+/g, "");
    next.shortCode = (code || initials(next.name)).slice(0, 4);
  }
  if (input.description !== undefined) {
    next.description = input.description.trim().slice(0, 140);
  }
  if (input.lat !== undefined) {
    if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90) {
      throw new Error("Latitude must be between -90 and 90");
    }
    next.lat = input.lat;
  }
  if (input.lng !== undefined) {
    if (!Number.isFinite(input.lng) || Math.abs(input.lng) > 180) {
      throw new Error("Longitude must be between -180 and 180");
    }
    next.lng = input.lng;
  }
  if (input.service !== undefined) {
    if (input.service === null) delete next.service;
    else if (SERVICES.includes(input.service)) next.service = input.service;
    else throw new Error("Unknown service type");
  }
  if (input.arrivalRadiusM !== undefined) {
    if (input.arrivalRadiusM === null) delete next.arrivalRadiusM;
    else if (
      Number.isFinite(input.arrivalRadiusM) &&
      input.arrivalRadiusM >= 10 &&
      input.arrivalRadiusM <= 1000
    ) {
      next.arrivalRadiusM = Math.round(input.arrivalRadiusM);
    } else throw new Error("Arrival radius must be 10–1000 m");
  }
  return next;
}

export async function createStop(input: StopInput): Promise<Stop> {
  return withWrite(async (state) => {
    if (input.lat === undefined || input.lng === undefined) {
      throw new Error("Latitude and longitude are required");
    }
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("Stop name is required");
    let id = slugify(name);
    const taken = new Set(state.stops.map((s) => s.id));
    for (let n = 2; taken.has(id); n++) id = `${slugify(name)}-${n}`;
    const stop = applyStopInput(
      { id, name: name || "Stop", shortCode: "", lat: 0, lng: 0, description: "" },
      { shortCode: "", ...input },
    );
    const next: AppState = {
      ...state,
      stops: [...state.stops, stop],
      updatedAt: new Date().toISOString(),
    };
    await persist(refreshGroundControl(next));
    return stop;
  });
}

export async function updateStop(id: string, input: StopInput): Promise<Stop | null> {
  return withWrite(async (state) => {
    const idx = state.stops.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const stop = applyStopInput(state.stops[idx], input);
    const stops = [...state.stops];
    stops[idx] = stop;
    const next = refreshGroundControl({
      ...state,
      stops,
      updatedAt: new Date().toISOString(),
    });
    await persist(next);
    return stop;
  });
}

export async function deleteStop(id: string): Promise<boolean> {
  return withWrite(async (state) => {
    if (!state.stops.some((s) => s.id === id)) return false;
    const openRiders = state.parties.filter(
      (p) =>
        (p.stopId === id || p.destinationId === id) &&
        ["waiting", "cleared", "boarding", "onboard"].includes(p.status),
    ).length;
    if (openRiders > 0) {
      throw new Error(
        `${openRiders} active ride${openRiders === 1 ? "" : "s"} use this stop — finish or cancel them first`,
      );
    }
    if (state.stops.length <= 2) {
      throw new Error("Keep at least two stops so riders have somewhere to go");
    }
    const vehicles = state.vehicles.map((v) => ({
      ...v,
      headingStopId: v.headingStopId === id ? null : v.headingStopId,
      currentStopId: v.currentStopId === id ? null : v.currentStopId,
    }));
    const next = refreshGroundControl({
      ...state,
      stops: state.stops.filter((s) => s.id !== id),
      vehicles,
      updatedAt: new Date().toISOString(),
    });
    await persist(next);
    return true;
  });
}

/** Restore the stop list from the MEM shuttle sheet defaults. */
export async function restoreDefaultStops(): Promise<Stop[]> {
  return withWrite(async (state) => {
    const stops = DEFAULT_STOPS.map((s) => ({ ...s }));
    const next = pruneOrphanParties({
      ...state,
      stops,
      updatedAt: new Date().toISOString(),
    });
    await persist(refreshGroundControl(next));
    return stops;
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
