"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Driver } from "@/lib/types";
import { stopName, useAppState } from "@/lib/use-app-state";

const DRIVER_KEY = "swingbus.driverId";

export default function DriverPage() {
  const { state, loading, error, refresh } = useAppState(2500);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState(14);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pickupStopId, setPickupStopId] = useState("");
  const [pickupDestId, setPickupDestId] = useState("");
  const [manualParty, setManualParty] = useState(1);

  useEffect(() => {
    const saved = localStorage.getItem(DRIVER_KEY);
    if (saved) setDriverId(saved);
  }, []);

  const driver: Driver | undefined = state?.drivers.find((d) => d.id === driverId);

  useEffect(() => {
    if (driver && !pickupStopId && state?.suggestions) {
      const mine = state.suggestions.find((s) => s.driverId === driver.id);
      if (mine) setPickupStopId(mine.stopId);
    }
  }, [driver, pickupStopId, state?.suggestions]);

  const mySuggestions = useMemo(
    () => (state?.suggestions ?? []).filter((s) => s.driverId === driverId),
    [state, driverId],
  );

  const assignedAtStop = useMemo(() => {
    if (!state || !driverId || !pickupStopId) return [];
    return state.requests.filter(
      (r) =>
        r.stopId === pickupStopId &&
        (r.status === "waiting" || r.status === "assigned") &&
        (!r.assignedDriverId || r.assignedDriverId === driverId),
    );
  }, [state, driverId, pickupStopId]);

  const pushLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!driverId) return;
      await fetch("/api/drivers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "location",
          driverId,
          lat,
          lng,
        }),
      });
      await refresh();
    },
    [driverId, refresh],
  );

  useEffect(() => {
    if (!driverId || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        void pushLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeoError(err.message || "Location unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverId, pushLocation]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, capacity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      localStorage.setItem(DRIVER_KEY, data.id);
      setDriverId(data.id);
      setStatus(`Shuttle ${data.label} is live.`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function goOffline() {
    if (!driverId) return;
    await fetch("/api/drivers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "active", driverId, active: false }),
    });
    localStorage.removeItem(DRIVER_KEY);
    setDriverId(null);
    await refresh();
  }

  async function confirmPickup(requestIds?: string[]) {
    if (!driverId || !pickupStopId || !pickupDestId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          stopId: pickupStopId,
          destinationId: pickupDestId,
          requestIds,
          partySize: requestIds?.length ? undefined : manualParty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pickup failed");
      setStatus(`Pickup logged · ${data.partySize} onboard from ${stopName(state, pickupStopId)}.`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDropoff() {
    if (!driverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dropoff",
          driverId,
          partySize: Math.max(1, driver?.onboard ?? 1),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Dropoff failed");
      }
      setStatus("Seats freed after drop-off.");
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sb-shell">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-soft/80">
          ← Swing Bus
        </Link>
        <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-amber uppercase">
          <span className="sb-live-dot" style={{ background: "var(--amber-soft)" }} /> Driver
        </span>
      </div>

      <header className="sb-rise mb-5">
        <h1 className="sb-brand text-4xl">Shuttle seat</h1>
        <p className="mt-2 text-ink-soft/85">
          Label your bus, keep GPS on, and confirm each pickup so dispatch stays
          honest.
        </p>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!driverId || !driver ? (
        <form onSubmit={register} className="sb-panel sb-rise space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Shuttle label
            </span>
            <input
              className="sb-input"
              required
              placeholder="e.g. Shuttle 3 / Green"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Capacity
            </span>
            <input
              className="sb-input"
              type="number"
              min={4}
              max={40}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value) || 14)}
            />
          </label>
          <button type="submit" className="sb-btn sb-btn-primary w-full" disabled={busy}>
            {busy ? "Starting…" : "Go on duty"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <section className="sb-panel sb-rise">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  On duty
                </p>
                <h2 className="sb-brand text-3xl">{driver.label}</h2>
                <p className="mt-1 text-sm text-ink-soft/80">
                  {driver.onboard}/{driver.capacity} seats filled
                  {driver.lastLocationAt
                    ? ` · GPS ${new Date(driver.lastLocationAt).toLocaleTimeString()}`
                    : " · waiting for GPS"}
                </p>
              </div>
              <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={goOffline}>
                End
              </button>
            </div>
            {geoError && (
              <p className="mt-3 text-sm text-amber">
                Location: {geoError}. Allow location for better routing.
              </p>
            )}
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-1">
            <h3 className="sb-brand text-xl">Your assignments</h3>
            {mySuggestions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft/75">
                No active suggestion — cruise or wait for demand.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mySuggestions.map((s) => (
                  <li
                    key={`${s.stopId}-${s.requestIds.join(",")}`}
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2"
                  >
                    <p className="font-semibold">
                      Pick up {s.waitingPeople} at {s.stopName}
                    </p>
                    <p className="text-xs text-ink-soft/75">
                      ~{s.estimatedMinutes} min · {s.reason}
                    </p>
                    <button
                      type="button"
                      className="sb-btn sb-btn-ghost mt-2 text-sm"
                      onClick={() => setPickupStopId(s.stopId)}
                    >
                      Use this stop
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-2 space-y-3">
            <h3 className="sb-brand text-xl">Log a pickup</h3>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Stop
              </span>
              <select
                className="sb-select"
                value={pickupStopId}
                onChange={(e) => setPickupStopId(e.target.value)}
              >
                <option value="">Select stop</option>
                {(state?.stops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Destination for this group
              </span>
              <select
                className="sb-select"
                value={pickupDestId}
                onChange={(e) => setPickupDestId(e.target.value)}
              >
                <option value="">Select destination</option>
                {(state?.stops ?? [])
                  .filter((s) => s.id !== pickupStopId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>

            {assignedAtStop.length > 0 && (
              <div className="rounded-xl bg-leaf/10 px-3 py-2 text-sm">
                <p className="font-medium text-leaf">
                  {assignedAtStop.reduce((n, r) => n + r.partySize, 0)} queued here
                  for you
                </p>
                <button
                  type="button"
                  className="sb-btn sb-btn-accent mt-2 w-full"
                  disabled={busy || !pickupDestId}
                  onClick={() => {
                    const ids = assignedAtStop
                      .filter((r) => r.destinationId === pickupDestId)
                      .map((r) => r.id);
                    if (ids.length === 0) {
                      setStatus(
                        "No queued parties for that destination — use manual headcount or pick another destination.",
                      );
                      return;
                    }
                    void confirmPickup(ids);
                  }}
                >
                  Confirm queued pickups
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <label className="block flex-1 space-y-1.5">
                <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Or manual headcount
                </span>
                <input
                  className="sb-input"
                  type="number"
                  min={1}
                  max={40}
                  value={manualParty}
                  onChange={(e) => setManualParty(Number(e.target.value) || 1)}
                />
              </label>
              <button
                type="button"
                className="sb-btn sb-btn-primary"
                disabled={busy || !pickupStopId || !pickupDestId}
                onClick={() => void confirmPickup()}
              >
                Log
              </button>
            </div>

            <button
              type="button"
              className="sb-btn sb-btn-ghost w-full"
              disabled={busy || !driver.onboard}
              onClick={() => void doDropoff()}
            >
              Drop off onboard passengers
            </button>
          </section>
        </div>
      )}

      {status && (
        <p className="sb-rise mt-4 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink-soft">
          {status}
        </p>
      )}
    </main>
  );
}
