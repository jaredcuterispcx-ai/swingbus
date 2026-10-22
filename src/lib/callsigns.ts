/** Electricity / AI themed base callsigns (no numbers — enumerate only when taken). */
export const ELECTRIC_BASES = [
  "Volt",
  "Amp",
  "Spark",
  "Ion",
  "Arc",
  "Pulse",
  "Circuit",
  "Flux",
  "Grid",
  "Tesla",
  "Quark",
  "Photon",
  "Nova",
  "Relay",
  "Coil",
  "Surge",
  "Phase",
  "Current",
  "Beacon",
  "Node",
  "Vector",
  "Signal",
  "Watt",
  "Ohm",
  "Plasma",
  "Electron",
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

/** Use bare name; only append -2, -3, … if that callsign is already on duty. */
export function allocateCallsign(
  base: string,
  vehicles: { callsign: string; active?: boolean }[] = [],
): string {
  const root = normalizeCallsign(base).replace(/-\d+$/, "") || "Volt";
  const taken = takenCallsigns(vehicles);
  if (!taken.has(root.toLowerCase())) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`.toLowerCase()) && n < 999) n += 1;
  return `${root}-${n}`;
}

/** Random electrical base; enumerates only when that name is taken. */
export function randomElectricCallsign(
  vehicles: { callsign: string; active?: boolean }[] = [],
): string {
  const taken = takenCallsigns(vehicles);
  const free = ELECTRIC_BASES.filter((b) => !taken.has(b.toLowerCase()));
  const base =
    free.length > 0
      ? free[Math.floor(Math.random() * free.length)]
      : ELECTRIC_BASES[Math.floor(Math.random() * ELECTRIC_BASES.length)];
  return allocateCallsign(base, vehicles);
}
