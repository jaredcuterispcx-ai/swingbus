"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppState, SeatLedger, Vehicle } from "./types";

export type VehicleWithSeats = Vehicle & { seats: SeatLedger };

export type ClientState = Omit<AppState, "vehicles"> & {
  vehicles: VehicleWithSeats[];
  activeClearances?: AppState["clearances"];
};

export function useAppState(pollMs = 3000) {
  const [state, setState] = useState<ClientState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load swingbus state");
      const data = (await res.json()) as ClientState;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { state, error, loading, refresh };
}

export function stopName(
  state: ClientState | null,
  id: string | null | undefined,
) {
  if (!state || !id) return "—";
  return state.stops.find((s) => s.id === id)?.name ?? id;
}

export function vehicleById(state: ClientState | null, id: string | null) {
  if (!state || !id) return null;
  return state.vehicles.find((v) => v.id === id) ?? null;
}
