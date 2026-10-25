"use client";

import { useMemo } from "react";
import { distanceMeters } from "@/lib/geo";
import type { Stop } from "@/lib/types";

const CLUSTER_M = 2500;

type MapVehicle = {
  id: string;
  lat: number | null;
  lng: number | null;
  highlight?: boolean;
  /** Not heard from lately: the position may be old. */
  faded?: boolean;
};

const W = 400;
const H = 220;
const PAD = 28;

/**
 * Schematic map: stops and shuttles projected onto a flat plane.
 * No tiles, so it works offline and on restricted networks.
 */
export function MiniMap({
  stops,
  vehicles = [],
  pickupId,
  destinationId,
  height = 200,
}: {
  stops: Stop[];
  vehicles?: MapVehicle[];
  pickupId?: string | null;
  destinationId?: string | null;
  height?: number;
}) {
  const focusIds = [pickupId, destinationId].filter(Boolean) as string[];
  const view = useMemo(() => {
    const all = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    if (all.length === 0) return null;
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const center = { lat: median(all.map((p) => p.lat)), lng: median(all.map((p) => p.lng)) };
    // Frame the main cluster; far-off lots (e.g. a mall miles away) would
    // otherwise squash every campus stop into one corner. Trip endpoints
    // are always kept in frame.
    const framed = stops
      .filter((s) => focusIds.includes(s.id) || distanceMeters(center, s) <= CLUSTER_M)
      .map((s) => ({ lat: s.lat, lng: s.lng }));
    const pts = framed.length ? framed : all;
    const kx = Math.cos((center.lat * Math.PI) / 180);
    const xs = pts.map((p) => p.lng * kx);
    const ys = pts.map((p) => p.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 0.002);
    const spanY = Math.max(maxY - minY, 0.002);
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    const edge = 10;
    return (lat: number, lng: number) => ({
      x: Math.min(W - edge, Math.max(edge, offX + (lng * kx - minX) * scale)),
      y: Math.min(H - edge, Math.max(edge, H - (offY + (lat - minY) * scale))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, focusIds.join("|")]);

  if (!view) {
    return <div className="rounded-xl bg-foam" style={{ height }} />;
  }

  const pickup = stops.find((s) => s.id === pickupId);
  const dest = stops.find((s) => s.id === destinationId);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="block w-full rounded-xl bg-[var(--map-bg)]"
      style={{ height }}
      role="img"
      aria-label="Shuttle map"
    >
      <defs>
        <pattern id="sb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--map-grid)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#sb-grid)" />

      {pickup && dest && (() => {
        const a = view(pickup.lat, pickup.lng);
        const b = view(dest.lat, dest.lng);
        return (
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        );
      })()}

      {stops.map((s) => {
        if (s.id === pickupId || s.id === destinationId) return null;
        const p = view(s.lat, s.lng);
        return (
          <circle key={s.id} cx={p.x} cy={p.y} r="4" fill="var(--map-stop)" stroke="var(--map-halo)" strokeWidth="1.5" />
        );
      })}

      {dest && (() => {
        const p = view(dest.lat, dest.lng);
        return (
          <rect x={p.x - 7} y={p.y - 7} width="14" height="14" fill="var(--ink)" stroke="var(--map-halo)" strokeWidth="2" />
        );
      })()}

      {pickup && (() => {
        const p = view(pickup.lat, pickup.lng);
        return (
          <g>
            <circle cx={p.x} cy={p.y} r="9" fill="var(--ink)" />
            <circle cx={p.x} cy={p.y} r="3.5" fill="var(--map-halo)" />
          </g>
        );
      })()}

      {vehicles.map((v) => {
        if (v.lat == null || v.lng == null) return null;
        const p = view(v.lat, v.lng);
        const r = v.highlight ? 13 : 11;
        // Faded still keeps 3:1 against the map (WCAG non-text contrast).
        return (
          <g key={v.id} transform={`translate(${p.x} ${p.y})`} opacity={v.faded ? 0.5 : 1}>
            <circle r={r} fill="var(--night)" stroke={v.highlight ? "var(--volt)" : "var(--on-night)"} strokeWidth="2.5" />
            <path
              d="M1.2 -7.5 -4.6 0.8h3.9l-1 6.7 6.3-8.4H0.7l0.5-7.6Z"
              fill="var(--volt)"
            />
          </g>
        );
      })}
    </svg>
  );
}
