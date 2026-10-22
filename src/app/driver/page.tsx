"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { randomElectricCallsign } from "@/lib/callsigns";
import type { VehicleWithSeats } from "@/lib/use-app-state";
import { stopName, useAppState } from "@/lib/use-app-state";

const VEHICLE_KEY = "swingbus.vehicleId";

export default function DriverPage() {
  const { state, loading, error, refresh } = useAppState(2500);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState("");
  const [capacity, setCapacity] = useState(14);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [standId, setStandId] = useState("");
  const [destId, setDestId] = useState("");
  const [manualSeats, setManualSeats] = useState(1);

  useEffect(() => {
    const saved = localStorage.getItem(VEHICLE_KEY);
    if (saved) setVehicleId(saved);
  }, []);

  // Default to a random electricity-themed callsign not already on duty.
  useEffect(() => {
    if (vehicleId || !state || callsign) return;
    setCallsign(randomElectricCallsign(state.vehicles));
  }, [state, vehicleId, callsign]);

  function reshuffleCallsign() {
    setCallsign(randomElectricCallsign(state?.vehicles ?? []));
    setStatus(null);
  }

  const vehicle: VehicleWithSeats | undefined = state?.vehicles.find(
    (v) => v.id === vehicleId,
  );

  const myClearances = useMemo(
    () =>
      (state?.clearances ?? []).filter(
        (c) =>
          c.vehicleId === vehicleId &&
          (c.status === "issued" ||
            c.status === "accepted" ||
            c.status === "boarding"),
      ),
    [state, vehicleId],
  );

  useEffect(() => {
    if (vehicle && !standId && myClearances[0]) {
      setStandId(myClearances[0].stopId);
    }
  }, [vehicle, standId, myClearances]);

  const queuedHere = useMemo(() => {
    if (!state || !vehicleId || !standId) return [];
    return state.parties.filter(
      (p) =>
        p.stopId === standId &&
        (p.status === "waiting" ||
          p.status === "cleared" ||
          p.status === "boarding") &&
        (!p.vehicleId || p.vehicleId === vehicleId),
    );
  }, [state, vehicleId, standId]);

  const pushLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!vehicleId) return;
      await fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "location",
          vehicleId,
          lat,
          lng,
        }),
      });
      await refresh();
    },
    [vehicleId, refresh],
  );

  useEffect(() => {
    if (!vehicleId || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        void pushLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => setGeoError(err.message || "Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [vehicleId, pushLocation]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign, capacity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      localStorage.setItem(VEHICLE_KEY, data.id);
      setVehicleId(data.id);
      setStatus(
        `${data.callsign} on duty · ${data.seats?.available ?? data.capacity} seats free`,
      );
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus(msg);
      if (/already on duty/i.test(msg)) {
        setCallsign(randomElectricCallsign(state?.vehicles ?? []));
      }
    } finally {
      setBusy(false);
    }
  }

  async function goOffline() {
    if (!vehicleId) return;
    await fetch("/api/vehicles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "active", vehicleId, active: false }),
    });
    localStorage.removeItem(VEHICLE_KEY);
    setVehicleId(null);
    await refresh();
  }

  async function accept(clearanceId: string) {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept_clearance",
          vehicleId,
          clearanceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus(`Clearance accepted · enroute to ${data.stopName}`);
      setStandId(data.stopId);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function board(partyIds?: string[]) {
    if (!vehicleId || !standId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          stopId: standId,
          destinationId: destId || undefined,
          partyIds,
          seats: partyIds?.length ? undefined : manualSeats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Board failed");
      const seats = data.ledger;
      setStatus(
        `Boarded ${data.event.seats} · ${seats.available} free · ${seats.occupied}/${seats.capacity} onboard`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doAlight() {
    if (!vehicleId || !vehicle) return;
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "alight",
          vehicleId,
          seats: Math.max(1, vehicle.seats.occupied),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Alight failed");
      setStatus(
        `Alighted · ${data.ledger.available} seats free on ${data.vehicle.callsign}`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sb-shell">
      <AppHeader badge="Driver" />

      <header className="sb-rise mb-5">
        <h1 className="sb-brand text-4xl tracking-tight">Go online</h1>
        <p className="mt-2 text-ink-soft">
          Publish callsign and capacity. Clearances hold seats; boarding converts
          holds into occupied — live seat tape, always.
        </p>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!vehicleId || !vehicle ? (
        <form onSubmit={register} className="sb-panel sb-rise space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Callsign
            </span>
            <div className="flex gap-2">
              <input
                className="sb-input font-mono"
                required
                placeholder="Volt"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
              />
              <button
                type="button"
                className="sb-btn sb-btn-ghost shrink-0 px-4"
                onClick={reshuffleCallsign}
                title="Roll another callsign"
              >
                ↻
              </button>
            </div>
            <p className="text-xs text-ink-soft">
              Random electrical name — must be unique while on duty.
            </p>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Seat capacity
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
                  Seat tape · {vehicle.status}
                </p>
                <h2 className="sb-brand text-3xl">{vehicle.callsign}</h2>
                <p className="sb-brand mt-2 text-4xl tabular-nums">
                  {vehicle.seats.available}
                  <span className="ml-2 text-lg font-sans font-medium text-ink-soft/70">
                    free
                  </span>
                </p>
                <p className="mt-1 text-sm text-ink-soft/80">
                  {vehicle.seats.reserved} held by clearances ·{" "}
                  {vehicle.seats.occupied}/{vehicle.seats.capacity} onboard
                </p>
              </div>
              <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={goOffline}>
                End
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist/50">
              <div
                className="h-full bg-amber"
                style={{
                  width: `${(vehicle.seats.occupied / vehicle.seats.capacity) * 100}%`,
                }}
              />
            </div>
            {geoError && (
              <p className="mt-3 text-sm text-amber">
                Location: {geoError}. Allow GPS so ground control can route you.
              </p>
            )}
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-1">
            <h3 className="sb-brand text-xl">Your clearances</h3>
            {myClearances.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft/75">
                No active clearance — keep GPS on and wait for stand demand.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {myClearances.map((c) => {
                  const parties = (state?.parties ?? []).filter((p) =>
                    c.partyIds.includes(p.id),
                  );
                  return (
                    <li
                      key={c.id}
                      className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2"
                    >
                      <p className="font-semibold">
                        {c.stopName} · hold {c.seatsReserved} seats
                      </p>
                      <p className="text-xs text-ink-soft/75">
                        ~{c.etaMinutes} min · {c.destinationSummary} · {c.status}
                      </p>
                      {parties.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-[var(--line)] pt-2 text-xs text-ink-soft/80">
                          {parties.map((p) => (
                            <li key={p.id}>
                              {p.partySize} seats → {stopName(state, p.destinationId)}
                              {p.note ? ` · ${p.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.status === "issued" && (
                          <button
                            type="button"
                            className="sb-btn sb-btn-accent text-sm"
                            disabled={busy}
                            onClick={() => void accept(c.id)}
                          >
                            Accept clearance
                          </button>
                        )}
                        <button
                          type="button"
                          className="sb-btn sb-btn-ghost text-sm"
                          onClick={() => {
                            setStandId(c.stopId);
                            const firstDest = parties[0]?.destinationId;
                            if (firstDest) setDestId(firstDest);
                          }}
                        >
                          Set stand
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-2 space-y-3">
            <h3 className="sb-brand text-xl">Board at stand</h3>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Stand
              </span>
              <select
                className="sb-select"
                value={standId}
                onChange={(e) => setStandId(e.target.value)}
              >
                <option value="">Select stand</option>
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
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
              >
                <option value="">Any / select</option>
                {(state?.stops ?? [])
                  .filter((s) => s.id !== standId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>

            {queuedHere.length > 0 && (
              <div className="rounded-xl bg-leaf/10 px-3 py-2 text-sm">
                <p className="font-medium text-leaf">
                  {queuedHere.reduce((n, p) => n + p.partySize, 0)} seats queued
                  here for you
                </p>
                <button
                  type="button"
                  className="sb-btn sb-btn-accent mt-2 w-full"
                  disabled={busy}
                  onClick={() => {
                    const ids = destId
                      ? queuedHere
                          .filter((p) => p.destinationId === destId)
                          .map((p) => p.id)
                      : queuedHere.map((p) => p.id);
                    if (!ids.length) {
                      setStatus("No parties for that destination at this stand.");
                      return;
                    }
                    void board(ids);
                  }}
                >
                  Board queued parties
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <label className="block flex-1 space-y-1.5">
                <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Manual seat count
                </span>
                <input
                  className="sb-input"
                  type="number"
                  min={1}
                  max={40}
                  value={manualSeats}
                  onChange={(e) => setManualSeats(Number(e.target.value) || 1)}
                />
              </label>
              <button
                type="button"
                className="sb-btn sb-btn-primary"
                disabled={busy || !standId}
                onClick={() => void board()}
              >
                Board
              </button>
            </div>

            <button
              type="button"
              className="sb-btn sb-btn-ghost w-full"
              disabled={busy || !vehicle.seats.occupied}
              onClick={() => void doAlight()}
            >
              Alight all onboard ({vehicle.seats.occupied})
            </button>
          </section>
        </div>
      )}

      {status && (
        <p className="sb-rise mt-4 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink-soft">
          {status}
        </p>
      )}

      {standId && (
        <p className="mt-2 text-center text-xs text-ink-soft/50">
          Stand {stopName(state, standId)}
        </p>
      )}
    </main>
  );
}
