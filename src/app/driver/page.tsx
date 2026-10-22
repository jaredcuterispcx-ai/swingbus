"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { randomElectricCallsign } from "@/lib/callsigns";
import type { VehicleWithSeats } from "@/lib/use-app-state";
import { stopName, useAppState } from "@/lib/use-app-state";

const VEHICLE_KEY = "swingbus.vehicleId";

type PickupGroup = {
  id: string;
  pax: number;
  destinationId: string;
  partyIds?: string[];
};

export default function DriverPage() {
  const { state, loading, error, refresh } = useAppState(2500);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState("");
  const [capacity, setCapacity] = useState(14);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pickupStopId, setPickupStopId] = useState("");
  const [destId, setDestId] = useState("");
  const [pax, setPax] = useState(1);
  const [groups, setGroups] = useState<PickupGroup[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(VEHICLE_KEY);
    if (saved) setVehicleId(saved);
  }, []);

  useEffect(() => {
    if (vehicleId || !state || callsign) return;
    setCallsign(randomElectricCallsign(state.vehicles));
  }, [state, vehicleId, callsign]);

  const vehicle: VehicleWithSeats | undefined = state?.vehicles.find(
    (v) => v.id === vehicleId,
  );

  useEffect(() => {
    setGroups([]);
  }, [pickupStopId]);

  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== pickupStopId),
    [state, pickupStopId],
  );

  const suggestedGroups = useMemo(() => {
    if (!state || !vehicleId || !pickupStopId) return [];
    const byDest = new Map<string, { pax: number; partyIds: string[] }>();
    for (const p of state.parties) {
      if (
        p.stopId !== pickupStopId ||
        (p.status !== "waiting" &&
          p.status !== "cleared" &&
          p.status !== "boarding")
      ) {
        continue;
      }
      if (p.vehicleId && p.vehicleId !== vehicleId) continue;
      const cur = byDest.get(p.destinationId) ?? { pax: 0, partyIds: [] };
      cur.pax += p.partySize;
      cur.partyIds.push(p.id);
      byDest.set(p.destinationId, cur);
    }
    return [...byDest.entries()].map(([destinationId, g]) => ({
      destinationId,
      pax: g.pax,
      partyIds: g.partyIds,
    }));
  }, [state, vehicleId, pickupStopId]);

  const draftPax = groups.reduce((n, g) => n + g.pax, 0);
  const room = vehicle ? vehicle.capacity - vehicle.seats.occupied : 0;

  const pushLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!vehicleId) return;
      await fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "location", vehicleId, lat, lng }),
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
      setStatus(`${data.callsign} online — allow location for tracking`);
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
    setGroups([]);
    await refresh();
  }

  async function setHeading(headingStopId: string) {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "heading",
          vehicleId,
          headingStopId: headingStopId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus(
        headingStopId
          ? `Heading to ${stopName(state, headingStopId)}`
          : "Destination cleared",
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function addGroup() {
    if (!pickupStopId || !destId || pax < 1) return;
    if (draftPax + pax > room) {
      setStatus(`Only ${Math.max(0, room - draftPax)} seats left`);
      return;
    }
    setGroups((prev) => {
      const idx = prev.findIndex(
        (g) => g.destinationId === destId && !g.partyIds?.length,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], pax: next[idx].pax + pax };
        return next;
      }
      return [
        ...prev,
        { id: crypto.randomUUID(), pax, destinationId: destId },
      ];
    });
    setPax(1);
    setStatus(null);
  }

  function addSuggested(s: {
    destinationId: string;
    pax: number;
    partyIds: string[];
  }) {
    if (groups.some((g) => g.partyIds?.some((id) => s.partyIds.includes(id)))) {
      return;
    }
    if (draftPax + s.pax > room) {
      setStatus(`Only ${Math.max(0, room - draftPax)} seats left`);
      return;
    }
    setGroups((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        pax: s.pax,
        destinationId: s.destinationId,
        partyIds: s.partyIds,
      },
    ]);
    setDestId(s.destinationId);
  }

  async function confirmPickup() {
    if (!vehicleId || !pickupStopId || groups.length === 0) return;
    setBusy(true);
    try {
      let boarded = 0;
      let lastLedger = vehicle?.seats;
      for (const g of groups) {
        const res = await fetch("/api/board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleId,
            stopId: pickupStopId,
            destinationId: g.destinationId,
            partyIds: g.partyIds,
            seats: g.pax,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Board failed");
        boarded += data.event.seats;
        lastLedger = data.ledger;
      }
      // After pickup, bus is often heading toward the first group's destination
      if (groups[0]?.destinationId) {
        await fetch("/api/vehicles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "heading",
            vehicleId,
            headingStopId: groups[0].destinationId,
          }),
        });
      }
      setGroups([]);
      setStatus(
        `Picked up ${boarded} · ${lastLedger?.occupied}/${lastLedger?.capacity} onboard`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
      await refresh();
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
      if (!res.ok) throw new Error(data.error || "Drop-off failed");
      setStatus(`${data.ledger.available} seats free`);
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
        <h1 className="sb-brand text-4xl tracking-tight">Drive</h1>
        <p className="mt-2 text-ink-soft">
          Start a session, share GPS, set where you&apos;re headed, then log who
          you pick up at each stop.
        </p>
      </header>

      {loading && <p className="text-sm text-ink-soft">Loading…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!vehicleId || !vehicle ? (
        <form onSubmit={register} className="sb-panel sb-rise space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Shuttle name
            </span>
            <div className="flex gap-2">
              <input
                className="sb-input font-mono"
                required
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
              />
              <button
                type="button"
                className="sb-btn sb-btn-ghost shrink-0 px-4"
                onClick={() =>
                  setCallsign(randomElectricCallsign(state?.vehicles ?? []))
                }
              >
                ↻
              </button>
            </div>
            <p className="text-xs text-ink-soft">
              Autogenerated — edit anytime before you go online.
            </p>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Seats
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
          <button type="submit" className="sb-btn sb-btn-accent w-full" disabled={busy}>
            {busy ? "Starting…" : "Start session"}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <section className="sb-panel sb-rise">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sb-chip">Live</p>
                <h2 className="sb-brand text-2xl">{vehicle.callsign}</h2>
                <p className="mt-1 font-mono text-sm text-ink-soft">
                  <span className="text-leaf">{vehicle.seats.available}</span> free
                  · {vehicle.seats.occupied}/{vehicle.seats.capacity} onboard
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {vehicle.lastLocationAt
                    ? `GPS ${new Date(vehicle.lastLocationAt).toLocaleTimeString()}`
                    : "Waiting for phone location…"}
                </p>
              </div>
              <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={goOffline}>
                End
              </button>
            </div>
            {geoError && (
              <p className="mt-2 text-xs text-amber">
                Location: {geoError}. Enable GPS so passengers see your ETA.
              </p>
            )}
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-1 space-y-3">
            <h3 className="sb-brand text-xl">Heading to</h3>
            <p className="text-sm text-ink-soft">
              Set your destination so waiting passengers know where you&apos;re
              going.
            </p>
            <select
              className="sb-select"
              value={vehicle.headingStopId ?? ""}
              onChange={(e) => void setHeading(e.target.value)}
              disabled={busy}
            >
              <option value="">Select destination</option>
              {(state?.stops ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-2 space-y-4">
            <div>
              <h3 className="sb-brand text-xl">Pickup</h3>
              <p className="mt-1 text-sm text-ink-soft">
                At this stop, log each group: passenger count + where they want
                to go.
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Stop
              </span>
              <select
                className="sb-select"
                value={pickupStopId}
                onChange={(e) => setPickupStopId(e.target.value)}
              >
                <option value="">Where are you picking up?</option>
                {(state?.stops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {pickupStopId && suggestedGroups.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  App requests here
                </p>
                {suggestedGroups.map((s) => (
                  <button
                    key={s.partyIds.join("-")}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-leaf/30 bg-leaf/5 px-3 py-2.5 text-left"
                    onClick={() => addSuggested(s)}
                  >
                    <span className="text-sm">
                      <strong className="text-leaf">{s.pax}</strong>
                      <span className="text-ink-soft"> → </span>
                      {stopName(state, s.destinationId)}
                    </span>
                    <span className="text-xs font-semibold text-leaf">+ Add</span>
                  </button>
                ))}
              </div>
            )}

            {pickupStopId && (
              <div className="space-y-3 rounded-xl border border-[var(--line)] bg-black/20 p-3">
                <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Who did you pick up?
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="sb-btn sb-btn-ghost px-4"
                    onClick={() => setPax((n) => Math.max(1, n - 1))}
                  >
                    −
                  </button>
                  <div className="sb-brand flex-1 text-center text-3xl tabular-nums">
                    {pax}
                  </div>
                  <button
                    type="button"
                    className="sb-btn sb-btn-ghost px-4"
                    onClick={() => setPax((n) => Math.min(room || 40, n + 1))}
                  >
                    +
                  </button>
                </div>
                <select
                  className="sb-select"
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                >
                  <option value="">Their destination</option>
                  {destinations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sb-btn sb-btn-accent w-full"
                  disabled={!destId || busy}
                  onClick={addGroup}
                >
                  Add group
                </button>
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-xs text-ink-soft">
                  {draftPax} pax · {groups.length} group
                  {groups.length === 1 ? "" : "s"}
                </p>
                <ul className="space-y-2">
                  {groups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2.5"
                    >
                      <p className="text-sm">
                        <span className="sb-brand text-lg text-leaf">{g.pax}</span>
                        <span className="text-ink-soft"> → </span>
                        {stopName(state, g.destinationId)}
                      </p>
                      <button
                        type="button"
                        className="text-xs text-ink-soft underline"
                        onClick={() =>
                          setGroups((prev) => prev.filter((x) => x.id !== g.id))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="sb-btn sb-btn-primary w-full"
                  disabled={busy}
                  onClick={() => void confirmPickup()}
                >
                  {busy ? "Saving…" : `Confirm pickup · ${draftPax} pax`}
                </button>
              </div>
            )}

            <button
              type="button"
              className="sb-btn sb-btn-ghost w-full"
              disabled={busy || !vehicle.seats.occupied}
              onClick={() => void doAlight()}
            >
              Drop off onboard ({vehicle.seats.occupied})
            </button>
          </section>
        </div>
      )}

      {status && (
        <p className="sb-rise mt-4 rounded-xl border border-[var(--line)] bg-surface px-3 py-2 text-sm text-ink-soft">
          {status}
        </p>
      )}
    </main>
  );
}
