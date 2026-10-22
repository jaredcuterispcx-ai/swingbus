"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppState } from "./types";

export function useAppState(pollMs = 3000) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load Swing Bus state");
      const data = (await res.json()) as AppState;
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
  state: AppState | null,
  id: string | null | undefined,
) {
  if (!state || !id) return "—";
  return state.stops.find((s) => s.id === id)?.name ?? id;
}
