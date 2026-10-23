import { haversineKm } from "./dispatch";
import type { PublicState, PublicVehicle } from "./feed";
import { runsTrip, servesStop } from "./service-hours";
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

/**
 * Active shuttles that could take a rider from `stopId`, ranked: those that run
 * the trip once the destination is known, otherwise those that serve the stop.
 */
export function shuttlesForStop(
  state: Fleet,
  stopId: string,
  destinationId?: string | null,
): ShuttleArrival[] {
  const stop = stopById(state.stops, stopId);
  if (!stop) return [];
  const destination = stopById(state.stops, destinationId);

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
    .filter(
      (v) =>
        v.active &&
        (comingIds.has(v.id) ||
          (destination
            ? runsTrip(v.service, stop, destination)
            : servesStop(v.service, stop))),
    )
    .map((v) => {
      const pos = vehiclePosition(v, state.stops);
      let etaMinutes: number | null = null;
      if (pos) {
        const km = haversineKm(pos, stop);
        etaMinutes = Math.max(1, Math.round((km / AVG_SHUTTLE_KMH) * 60));
      }
      const comingHere = comingIds.has(v.id);
      const heading = stopById(state.stops, v.headingStopId);
      let reason = "On the network";
      if (comingHere) reason = "Cleared to your stop";
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
    if (a.comingHere !== b.comingHere) return a.comingHere ? -1 : 1;
    const ae = a.etaMinutes ?? 999;
    const be = b.etaMinutes ?? 999;
    if (ae !== be) return ae - be;
    return b.seatsFree - a.seatsFree;
  });

  return rows;
}

export function nextShuttleForStop(state: Fleet, stopId: string) {
  return shuttlesForStop(state, stopId)[0] ?? null;
}
