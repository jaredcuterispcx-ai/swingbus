import type { Stop } from "./types";

/** Within this distance a vehicle counts as "at" a stop unless the stop overrides it. */
export const DEFAULT_ARRIVAL_RADIUS_M = 75;

const EARTH_M = 6_371_000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

export function arrivalRadius(stop: Stop): number {
  return stop.arrivalRadiusM && stop.arrivalRadiusM > 0
    ? stop.arrivalRadiusM
    : DEFAULT_ARRIVAL_RADIUS_M;
}

export type StopDistance = { stop: Stop; meters: number; atStop: boolean };

export function stopsByDistance(
  stops: Stop[],
  pos: { lat: number; lng: number },
): StopDistance[] {
  return stops
    .map((stop) => {
      const meters = distanceMeters(pos, stop);
      return { stop, meters, atStop: meters <= arrivalRadius(stop) };
    })
    .sort((a, b) => a.meters - b.meters);
}

/** The closest stop whose arrival radius contains `pos`, if any. */
export function stopAt(
  stops: Stop[],
  pos: { lat: number; lng: number },
): Stop | null {
  return stopsByDistance(stops, pos).find((d) => d.atStop)?.stop ?? null;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
