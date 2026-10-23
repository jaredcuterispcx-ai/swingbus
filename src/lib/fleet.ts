import { haversineKm } from "./dispatch";
import type { PublicState, PublicVehicle } from "./feed";
import type { Stop } from "./types";

const AVG_SHUTTLE_KMH = 22;

function stopById(stops: Stop[], id: string | null | undefined) {
  if (!id) return null;
  return stops.find((s) => s.id === id) ?? null;
}

function vehiclePosition(vehicle: PublicVehicle, stops: Stop[]) {
  if (vehicle.lat != null && vehicle.lng != null) {
    return { lat: vehicle.lat, lng: vehicle.lng };
  }
  const stand = stopById(stops, vehicle.currentStopId);
  if (stand) return { lat: stand.lat, lng: stand.lng };
  return null;
}

export type ShuttleArrival = {
  vehicle: PublicVehicle;
  seatsFree: number;
  etaMinutes: number | null;
  headingName: string | null;
  comingHere: boolean;
  reason: string;
};

type Fleet = Pick<PublicState, "stops" | "vehicles" | "clearances">;

/** Minutes for a shuttle to reach a stop from where it was last seen; null once it's out of contact. */
export function etaToStop(stops: Stop[], vehicle: PublicVehicle, stopId: string): number | null {
  const stop = stopById(stops, stopId);
  const pos = vehiclePosition(vehicle, stops);
  if (!stop || !pos || vehicle.presence === "lost") return null;
  const km = haversineKm(pos, stop);
  return Math.max(1, Math.round((km / AVG_SHUTTLE_KMH) * 60));
}

/** All active shuttles ranked for a passenger waiting at `stopId`. */
export function shuttlesForStop(
  state: Fleet,
  stopId: string,
): ShuttleArrival[] {
  const stop = stopById(state.stops, stopId);
  if (!stop) return [];

  const comingIds = new Set(
    state.clearances
      .filter(
        (c) =>
          c.stopId === stopId &&
          (c.status === "issued" ||
            c.status === "accepted" ||
            c.status === "boarding"),
      )
      .map((c) => c.vehicleId),
  );

  const rows: ShuttleArrival[] = state.vehicles
    .filter((v) => v.active)
    .map((v) => {
      const etaMinutes = etaToStop(state.stops, v, stopId);
      const comingHere = comingIds.has(v.id);
      const heading = stopById(state.stops, v.headingStopId);
      let reason = "On the network";
      if (v.presence === "lost") reason = "Out of contact";
      else if (comingHere) reason = "Cleared to your stop";
      else if (v.headingStopId === stopId) reason = "Heading your way";
      else if (heading) reason = `Heading to ${heading.name}`;
      else if (etaMinutes != null) reason = "Nearest by GPS";

      return {
        vehicle: v,
        seatsFree: v.seats.available,
        etaMinutes,
        headingName: heading?.name ?? null,
        comingHere,
        reason,
      };
    });

  rows.sort((a, b) => {
    const aLost = a.vehicle.presence === "lost";
    if (aLost !== (b.vehicle.presence === "lost")) return aLost ? 1 : -1;
    if (a.comingHere !== b.comingHere) return a.comingHere ? -1 : 1;
    const ae = a.etaMinutes ?? 999;
    const be = b.etaMinutes ?? 999;
    if (ae !== be) return ae - be;
    return b.seatsFree - a.seatsFree;
  });

  return rows;
}

/** The shuttle a rider at `stopId` can expect next; never one that's out of contact. */
export function nextShuttleForStop(state: Fleet, stopId: string) {
  return shuttlesForStop(state, stopId).find((row) => row.vehicle.presence !== "lost") ?? null;
}
