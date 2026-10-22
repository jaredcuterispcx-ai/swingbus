/** Electricity / AI themed shuttle callsigns for XSI Swing Bus. */
export const ELECTRIC_CALLSIGNS = [
  "Volt-1",
  "Volt-2",
  "Amp-3",
  "Amp-7",
  "Spark-4",
  "Spark-9",
  "Ion-5",
  "Ion-8",
  "Arc-2",
  "Arc-6",
  "Pulse-1",
  "Pulse-3",
  "Circuit-7",
  "Circuit-4",
  "Flux-5",
  "Flux-2",
  "Grid-9",
  "Grid-1",
  "Tesla-3",
  "Tesla-6",
  "Quark-8",
  "Quark-2",
  "Photon-4",
  "Photon-7",
  "Nova-1",
  "Nova-5",
  "Relay-3",
  "Relay-9",
  "Coil-2",
  "Coil-8",
  "Surge-6",
  "Surge-1",
  "Phase-4",
  "Phase-7",
  "Current-5",
  "Current-3",
  "Beacon-AI",
  "Node-AI",
  "Vector-X",
  "Signal-X",
] as const;

export function normalizeCallsign(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

export function takenCallsigns(
  vehicles: { callsign: string; active?: boolean }[],
  opts?: { activeOnly?: boolean },
): Set<string> {
  const activeOnly = opts?.activeOnly ?? true;
  const set = new Set<string>();
  for (const v of vehicles) {
    if (activeOnly && v.active === false) continue;
    set.add(normalizeCallsign(v.callsign).toLowerCase());
  }
  return set;
}

/** Pick a random electricity-themed callsign not already in use. */
export function randomElectricCallsign(
  vehicles: { callsign: string; active?: boolean }[] = [],
): string {
  const taken = takenCallsigns(vehicles);
  const free = ELECTRIC_CALLSIGNS.filter(
    (c) => !taken.has(c.toLowerCase()),
  );
  const pool = free.length > 0 ? free : [...ELECTRIC_CALLSIGNS];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (free.length > 0) return pick;

  // All themed names taken — append a short suffix.
  let n = 1;
  while (taken.has(`${pick}-${n}`.toLowerCase()) && n < 999) n += 1;
  return `${pick}-${n}`;
}
