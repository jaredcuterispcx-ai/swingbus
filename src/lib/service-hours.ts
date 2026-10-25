import type { ShuttleService, Stop, StopId, StopService } from "./types";

/**
 * Service hours from the MEM shuttle sheet, as Memphis wall-clock times.
 * Evaluated in this zone whatever timezone the server or phone is set to.
 */
export const SERVICE_TIME_ZONE = "America/Chicago";

/** Daily window in 24 h "HH:MM"; `end` is exclusive. */
export type ServiceWindow = { start: string; end: string };

/** `null` runs around the clock. */
export const SERVICE_HOURS: Record<ShuttleService, readonly ServiceWindow[] | null> = {
  onsite: null,
  offsite: [
    { start: "05:00", end: "10:00" },
    { start: "17:00", end: "22:00" },
  ],
};

export type StopServiceStatus = {
  open: boolean;
  /** Next opening (ISO) while closed. */
  opensAt: string | null;
  /** End of the current window (ISO) while open with limited hours. */
  closesAt: string | null;
};

const ALWAYS_OPEN: StopServiceStatus = { open: true, opensAt: null, closesAt: null };

/** "both" stops get onsite and offsite shuttles; untagged stops count as onsite. */
function servicesFor(service: StopService | undefined): ShuttleService[] {
  if (service === "offsite") return ["offsite"];
  if (service === "both") return ["onsite", "offsite"];
  return ["onsite"];
}

export function servesStop(service: ShuttleService, stop: Pick<Stop, "service">): boolean {
  return servicesFor(stop.service).includes(service);
}

/**
 * The shuttle service a trip needs, or null when either will do. A trip to or
 * from an offsite-only lot needs the offsite shuttle even when its other end is
 * an onsite-only stop, so nobody is left without a shuttle; any other trip
 * touching an onsite-only stop needs the onsite shuttle.
 */
export function tripService(
  pickup: Pick<Stop, "service">,
  destination: Pick<Stop, "service">,
): ShuttleService | null {
  const ends = [servicesFor(pickup.service), servicesFor(destination.service)];
  for (const service of ["offsite", "onsite"] as const) {
    if (ends.some((s) => s.length === 1 && s[0] === service)) return service;
  }
  return null;
}

/** Whether ground control may clear a shuttle on `service` for this trip. */
export function runsTrip(
  service: ShuttleService,
  pickup: Pick<Stop, "service">,
  destination: Pick<Stop, "service">,
): boolean {
  const needed = tripService(pickup, destination);
  return needed === null || needed === service;
}

/** Daily windows a stop is served in, or null when it is served around the clock. */
export function stopWindows(stop: Pick<Stop, "service">): readonly ServiceWindow[] | null {
  const lists = servicesFor(stop.service).map((s) => SERVICE_HOURS[s]);
  if (lists.some((list) => list === null)) return null;
  return lists.flatMap((list) => list ?? []);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

let wallFormat: Intl.DateTimeFormat | null = null;

function wallClock(t: number): WallClock {
  wallFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SERVICE_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const out: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of wallFormat.formatToParts(t)) {
    if (part.type in out) out[part.type as keyof WallClock] = Number(part.value);
  }
  out.hour %= 24;
  return out;
}

/** Memphis UTC offset in ms at instant `t` (−5 h in summer, −6 h in winter). */
function offsetAt(t: number): number {
  const w = wallClock(t);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Instant of a Memphis wall-clock time; `day` and `minute` may overflow. */
function memphisTime(year: number, month: number, day: number, minute: number): number {
  const wall = Date.UTC(year, month - 1, day, 0, minute);
  // Re-check the offset at the first guess so DST changes overnight land right.
  return wall - offsetAt(wall - offsetAt(wall));
}

export function serviceStatus(
  stop: Pick<Stop, "service">,
  now: Date = new Date(),
): StopServiceStatus {
  const windows = stopWindows(stop);
  if (!windows) return ALWAYS_OPEN;
  const t = now.getTime();
  const today = wallClock(t);
  // Yesterday through tomorrow covers the current window and the next opening.
  const spans: [number, number][] = [];
  for (const day of [today.day - 1, today.day, today.day + 1]) {
    for (const w of windows) {
      spans.push([
        memphisTime(today.year, today.month, day, minutesOf(w.start)),
        memphisTime(today.year, today.month, day, minutesOf(w.end)),
      ]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of spans) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const current = merged.find(([start, end]) => start <= t && t < end);
  if (current) {
    return { open: true, opensAt: null, closesAt: new Date(current[1]).toISOString() };
  }
  const next = merged.find(([start]) => start > t);
  return {
    open: false,
    opensAt: next ? new Date(next[0]).toISOString() : null,
    closesAt: null,
  };
}

export function serviceStatusByStop(
  stops: Stop[],
  now: Date = new Date(),
): Record<StopId, StopServiceStatus> {
  return Object.fromEntries(stops.map((s) => [s.id, serviceStatus(s, now)]));
}

/** Throws when a rider asks for a stop outside its service hours. */
export function assertInService(stop: Pick<Stop, "name" | "service">, now: Date = new Date()) {
  const status = serviceStatus(stop, now);
  if (status.open) return;
  throw new Error(
    status.opensAt
      ? `${stop.name} is closed until ${clockLabel(status.opensAt)}`
      : `${stop.name} is closed`,
  );
}

/** Status as sent by `GET /api/state`; a stop missing from it counts as open. */
export function statusOf(
  state: { serviceStatus?: Record<StopId, StopServiceStatus> } | null | undefined,
  stopId: StopId,
): StopServiceStatus {
  return state?.serviceStatus?.[stopId] ?? ALWAYS_OPEN;
}

function formatMinutes(total: number, withPeriod = true): string {
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const time = m ? `${h24 % 12 || 12}:${String(m).padStart(2, "0")}` : String(h24 % 12 || 12);
  return withPeriod ? `${time} ${h24 < 12 ? "AM" : "PM"}` : time;
}

/** "5 PM", "5:30 AM" in Memphis time. */
export function clockLabel(at: string | number | Date): string {
  const w = wallClock(new Date(at).getTime());
  return formatMinutes(w.hour * 60 + w.minute);
}

/** "5–10 AM", "10 AM–2 PM". */
export function windowLabel(w: ServiceWindow): string {
  const start = minutesOf(w.start);
  const end = minutesOf(w.end);
  const pm = (minutes: number) => minutes % 1440 >= 720;
  return `${formatMinutes(start, pm(start) !== pm(end))}–${formatMinutes(end)}`;
}

/** "24/7" or "5–10 AM · 5–10 PM". */
export function hoursLabel(stop: Pick<Stop, "service">): string {
  const windows = stopWindows(stop);
  if (!windows) return "24/7";
  return windows.map(windowLabel).join(" · ") || "Closed";
}

/** "Opens 5 PM" for a closed stop. */
export function opensLabel(status: StopServiceStatus): string {
  return status.opensAt ? `Opens ${clockLabel(status.opensAt)}` : "Closed";
}
