"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicState, StaffState } from "./feed";
import type { Stop } from "./types";

export type { PublicState, StaffParty, StaffState, VehicleWithSeats } from "./feed";

const asPublic = (data: PublicState) => data;

/** A lapsed session gets the passenger feed back, which the staff pages can't run on. */
const asStaff = (data: PublicState) => ("parties" in data ? (data as StaffState) : null);

function usePolledState<T>(pollMs: number, accept: (data: PublicState) => T | null) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load swingbus state");
      const data = accept((await res.json()) as PublicState);
      if (!data) throw new Error("Signed out. Reload to sign in again.");
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [accept]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { state, error, loading, refresh };
}

/** Passenger screens: the public feed (staff get the full state, which is a superset). */
export function useAppState(pollMs = 3000) {
  return usePolledState(pollMs, asPublic);
}

/** Driver and ground control screens: the full state, which needs a driver or admin session. */
export function useStaffState(pollMs = 3000) {
  return usePolledState(pollMs, asStaff);
}

export function stopName(
  state: { stops: Stop[] } | null,
  id: string | null | undefined,
) {
  if (!state || !id) return "—";
  return state.stops.find((s) => s.id === id)?.name ?? id;
}

export function vehicleById<V extends { id: string }>(
  state: { vehicles: V[] } | null,
  id: string | null,
) {
  if (!state || !id) return null;
  return state.vehicles.find((v) => v.id === id) ?? null;
}
