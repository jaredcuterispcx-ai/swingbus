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
  const [standId, setStandId] = useState("");
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

  // Changing stop clears the draft pickup list.
  useEffect(() => {
    setGroups([]);
  }, [standId]);

  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== standId),
    [state, standId],
  );

  const suggestedGroups = useMemo(() => {
    if (!state || !vehicleId || !standId) return [];
    const byDest = new Map<string, { pax: number; partyIds: string[] }>();
    for (const p of state.parties) {
      if (
        p.stopId !== standId ||
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
  }, [state, vehicleId, standId]);

  const draftPax = groups.reduce((n, g) => n + g.pax, 0);
  const room = vehicle
    ? vehicle.capacity - vehicle.seats.occupied
    : 0;

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
    setGroups([]);
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
      setStatus(`Enroute to ${data.stopName}`);
      setStandId(data.stopId);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function addGroup() {
    if (!standId || !destId || pax < 1) return;
    if (draftPax + pax > room) {
      setStatus(`Only ${room - draftPax} seats left on the bus`);
      return;
    }
    // Merge into existing draft group for same destination.
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
        {
          id: crypto.randomUUID(),
          pax,
          destinationId: destId,
        },
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
      setStatus(`Only ${room - draftPax} seats left on the bus`);
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
    setStatus(null);
  }

  function removeGroup(id: string) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  async function confirmPickup() {
    if (!vehicleId || !standId || groups.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      let boarded = 0;
      let lastLedger = vehicle?.seats;
      for (const g of groups) {
        const res = await fetch("/api/board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleId,
            stopId: standId,
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
      setGroups([]);
      setStatus(
        `Picked up ${boarded} pax · ${lastLedger?.available ?? "—"} free · ${lastLedger?.occupied ?? "—"}/${lastLedger?.capacity ?? "—"} onboard`,
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
      if (!res.ok) throw new Error(data.error || "Alight failed");
      setStatus(`${data.ledger.available} seats free after drop-off`);
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
          At each stop, add every group: how many people, where they&apos;re
          going — then confirm pickup.
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
        <div className="space-y-3">
          <section className="sb-panel sb-rise">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sb-chip mb-1">{vehicle.status}</p>
                <h2 className="sb-brand text-2xl">{vehicle.callsign}</h2>
                <p className="mt-1 font-mono text-sm text-ink-soft">
                  <span className="text-leaf">{vehicle.seats.available}</span> free
                  · {vehicle.seats.reserved} held · {vehicle.seats.occupied}/
                  {vehicle.seats.capacity} on
                </p>
              </div>
              <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={goOffline}>
                End
              </button>
            </div>
            {geoError && (
              <p className="mt-2 text-xs text-amber">GPS: {geoError}</p>
            )}
          </section>

          {myClearances.length > 0 && (
            <section className="sb-panel sb-rise sb-rise-delay-1 space-y-2">
              <h3 className="sb-brand text-lg">Next stops</h3>
              {myClearances.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2"
                >
                  <div>
                    <p className="font-semibold">{c.stopName}</p>
                    <p className="text-xs text-ink-soft">
                      {c.seatsReserved} held · {c.destinationSummary}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {c.status === "issued" && (
                      <button
                        type="button"
                        className="sb-btn sb-btn-accent px-3 text-sm"
                        disabled={busy}
                        onClick={() => void accept(c.id)}
                      >
                        Accept
                      </button>
                    )}
                    <button
                      type="button"
                      className="sb-btn sb-btn-ghost px-3 text-sm"
                      onClick={() => setStandId(c.stopId)}
                    >
                      Pick up
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="sb-panel sb-rise sb-rise-delay-2 space-y-4">
            <div>
              <h3 className="sb-brand text-xl">Pickup</h3>
              <p className="mt-1 text-sm text-ink-soft">
                One stop · many groups · each group is pax + destination
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Stop
              </span>
              <select
                className="sb-select"
                value={standId}
                onChange={(e) => setStandId(e.target.value)}
              >
                <option value="">Where are you?</option>
                {(state?.stops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {standId && suggestedGroups.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Waiting here
                </p>
                {suggestedGroups.map((s) => (
                  <button
                    key={s.partyIds.join("-")}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-leaf/30 bg-leaf/5 px-3 py-2.5 text-left"
                    onClick={() => addSuggested(s)}
                    disabled={busy}
                  >
                    <span className="text-sm">
                      <strong className="text-leaf">{s.pax}</strong>
                      <span className="text-ink-soft"> pax → </span>
                      {stopName(state, s.destinationId)}
                    </span>
                    <span className="text-xs font-semibold text-leaf">+ Add</span>
                  </button>
                ))}
              </div>
            )}

            {standId && (
              <div className="space-y-3 rounded-xl border border-[var(--line)] bg-black/20 p-3">
                <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  Add group
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
                  <option value="">Destination</option>
                  {destinations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sb-btn sb-btn-accent w-full"
                  disabled={!destId || pax < 1 || busy}
                  onClick={addGroup}
                >
                  Add group
                </button>
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                    This pickup
                  </p>
                  <p className="font-mono text-xs text-ink-soft">
                    {draftPax} pax · {groups.length} group
                    {groups.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ul className="space-y-2">
                  {groups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5"
                    >
                      <p className="text-sm">
                        <span className="sb-brand text-lg text-leaf">{g.pax}</span>
                        <span className="text-ink-soft"> → </span>
                        {stopName(state, g.destinationId)}
                      </p>
                      <button
                        type="button"
                        className="text-xs text-ink-soft underline"
                        onClick={() => removeGroup(g.id)}
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
                  {busy ? "Boarding…" : `Confirm pickup · ${draftPax} pax`}
                </button>
              </div>
            )}

            <button
              type="button"
              className="sb-btn sb-btn-ghost w-full"
              disabled={busy || !vehicle.seats.occupied}
              onClick={() => void doAlight()}
            >
              Drop off all onboard ({vehicle.seats.occupied})
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
