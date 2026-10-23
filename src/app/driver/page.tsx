"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { PinIcon, UsersIcon } from "@/components/icons";
import { ClosedStopsNote } from "@/components/service-hours";
import { SignOutButton } from "@/components/sign-out";
import { randomElectricCallsign } from "@/lib/callsigns";
import { formatDistance, stopsByDistance } from "@/lib/geo";
import { statusOf } from "@/lib/service-hours";
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
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    null,
  );
  /** Last stop we auto-selected for; a manual pick sticks until the next arrival. */
  const lastArrivalRef = useRef<string | null>(null);
  const lastPushRef = useRef<{ at: number; stopId: string | null }>({ at: 0, stopId: null });
  const stopsRef = useRef(state?.stops ?? []);
  stopsRef.current = state?.stops ?? stopsRef.current;

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

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

  const nearby = useMemo(
    () => (state && pos ? stopsByDistance(state.stops, pos) : []),
    [state, pos],
  );
  const atStop = nearby.find((d) => d.atStop)?.stop ?? null;
  const nearest = nearby[0] ?? null;
  const distanceTo = useCallback(
    (id: string) => nearby.find((d) => d.stop.id === id)?.meters,
    [nearby],
  );

  /** Stops ordered nearest-first once GPS is available, otherwise as configured. */
  const stopOptions = useMemo(
    () => (nearby.length ? nearby.map((d) => d.stop) : (state?.stops ?? [])),
    [nearby, state],
  );

  const optionLabel = (s: { id: string; name: string }) => {
    const m = distanceTo(s.id);
    const label = m == null ? s.name : `${s.name} · ${formatDistance(m)}`;
    return statusOf(state, s.id).open ? label : `${label} · Closed`;
  };

  useEffect(() => {
    const id = atStop?.id ?? null;
    if (id === lastArrivalRef.current) return;
    lastArrivalRef.current = id;
    if (!id) return;
    setPickupStopId((cur) => (cur === id || groups.length > 0 ? cur : id));
  }, [atStop, groups.length]);

  const destinations = useMemo(
    () => stopOptions.filter((s) => s.id !== pickupStopId),
    [stopOptions, pickupStopId],
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
      (p) => {
        setGeoError(null);
        const fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        setPos(fix);
        // Phones can emit several fixes a second; only report every 5s
        // unless the driver just entered or left a stop.
        const here =
          stopsByDistance(stopsRef.current, fix).find((d) => d.atStop)?.stop.id ?? null;
        const now = Date.now();
        const last = lastPushRef.current;
        if (now - last.at < 5000 && here === last.stopId) return;
        lastPushRef.current = { at: now, stopId: here };
        void pushLocation(fix.lat, fix.lng);
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
      setStatus(`${data.callsign} is online`);
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
        `Picked up ${boarded} · ${lastLedger?.occupied}/${lastLedger?.capacity}`,
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

  const showArrival =
    atStop && vehicle?.headingStopId === atStop.id && (vehicle?.seats.occupied ?? 0) > 0;

  return (
    <main className="sb-shell">
      <AppHeader
        right={
          vehicle ? (
            <button type="button" className="sb-pill" onClick={() => void goOffline()}>
              Go offline
            </button>
          ) : undefined
        }
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!vehicleId || !vehicle ? (
        loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-foam" />
        ) : (
          <form onSubmit={register} className="sb-rise flex flex-col items-center">
            <h1 className="sb-brand w-full text-3xl">Drive</h1>

            <label className="mt-5 block w-full space-y-1.5">
              <span className="sb-label">Shuttle</span>
              <div className="flex gap-2">
                <input
                  className="sb-input font-semibold"
                  required
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  autoCapitalize="words"
                  autoCorrect="off"
                />
                <button
                  type="button"
                  aria-label="New name"
                  className="sb-btn sb-btn-ghost shrink-0 px-4"
                  onClick={() => setCallsign(randomElectricCallsign(state?.vehicles ?? []))}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
                  </svg>
                </button>
              </div>
            </label>

            <div className="mt-5 flex w-full items-center justify-between">
              <span className="font-semibold">Seats</span>
              <Stepper value={capacity} min={4} max={40} onChange={setCapacity} />
            </div>

            <button
              type="submit"
              disabled={busy || !callsign.trim()}
              className="mt-10 flex size-32 items-center justify-center rounded-full bg-black text-3xl font-extrabold tracking-tight text-white shadow-[0_0_0_10px_var(--volt)] transition active:scale-95 disabled:opacity-40"
            >
              {busy ? "…" : "GO"}
            </button>

            <div className="mt-10">
              <SignOutButton />
            </div>
          </form>
        )
      ) : (
        <div className="space-y-4">
          <div className="sb-rise flex items-center justify-between rounded-xl bg-black px-4 py-3.5 text-white">
            <span className="flex min-w-0 items-center gap-2.5 font-semibold">
              <span className="sb-live-dot shrink-0" />
              <span className="truncate">{vehicle.callsign}</span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
              <UsersIcon size={16} />
              {vehicle.seats.occupied}/{vehicle.seats.capacity}
            </span>
          </div>

          {geoError ? (
            <p className="rounded-xl bg-amber-soft px-3.5 py-3 text-sm font-medium text-amber">
              Turn on location so riders can see you
            </p>
          ) : pos && (atStop || nearest) ? (
            <div
              className={`flex items-center gap-3 rounded-xl p-3.5 ${
                atStop ? "bg-volt" : "bg-foam"
              }`}
            >
              <PinIcon />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {(atStop ?? nearest?.stop)?.name}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {atStop ? "Here" : nearest ? formatDistance(nearest.meters) : ""}
              </span>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Finding GPS…</p>
          )}

          <ClosedStopsNote state={state} />

          {showArrival && (
            <button
              type="button"
              className="sb-btn sb-btn-primary sb-btn-lg w-full"
              disabled={busy}
              onClick={() => void doAlight()}
            >
              Drop off {vehicle.seats.occupied}
            </button>
          )}

          <label className="block space-y-1.5">
            <span className="sb-label">Heading to</span>
            <select
              className="sb-select font-semibold"
              value={vehicle.headingStopId ?? ""}
              onChange={(e) => void setHeading(e.target.value)}
              disabled={busy}
            >
              <option value="">Not set</option>
              {stopOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="sb-label">Pickup at</span>
            <select
              className="sb-select font-semibold"
              value={pickupStopId}
              onChange={(e) => setPickupStopId(e.target.value)}
            >
              <option value="">Choose stop</option>
              {stopOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>

          {pickupStopId && suggestedGroups.length > 0 && (
            <ul>
              {suggestedGroups.map((s) => {
                const added = groups.some((g) =>
                  g.partyIds?.some((id) => s.partyIds.includes(id)),
                );
                return (
                  <li key={s.partyIds.join("-")}>
                    <button
                      type="button"
                      className="sb-row"
                      disabled={added}
                      onClick={() => addSuggested(s)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-volt font-bold tabular-nums">
                        {s.pax}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {stopName(state, s.destinationId)}
                      </span>
                      <span className="sb-pill">{added ? "Added" : "Add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pickupStopId && (
            <div className="space-y-2 rounded-xl bg-foam p-3">
              <div className="flex items-center gap-2">
                <Stepper value={pax} min={1} max={Math.max(1, room || 40)} onChange={setPax} onGray />
                <select
                  className="sb-select min-w-0 flex-1 bg-white font-semibold"
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                  aria-label="Their destination"
                >
                  <option value="">Going to…</option>
                  {destinations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {optionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="sb-btn sb-btn-ghost w-full bg-white"
                disabled={!destId || busy}
                onClick={addGroup}
              >
                Add riders
              </button>
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <ul>
                {groups.map((g) => (
                  <li key={g.id} className="sb-row cursor-default">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black font-bold text-white tabular-nums">
                      {g.pax}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {stopName(state, g.destinationId)}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove"
                      className="sb-icon-btn size-9"
                      onClick={() => setGroups((prev) => prev.filter((x) => x.id !== g.id))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <div className="sb-sticky-cta">
                <button
                  type="button"
                  className="sb-btn sb-btn-primary sb-btn-lg w-full"
                  disabled={busy}
                  onClick={() => void confirmPickup()}
                >
                  {busy ? "Saving…" : `Pick up ${draftPax}`}
                </button>
              </div>
            </div>
          )}

          {!showArrival && vehicle.seats.occupied > 0 && groups.length === 0 && (
            <button
              type="button"
              className="sb-btn sb-btn-ghost w-full"
              disabled={busy}
              onClick={() => void doAlight()}
            >
              Drop off {vehicle.seats.occupied}
            </button>
          )}
        </div>
      )}

      {status && (
        <p
          role="status"
          className="sb-rise mt-4 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
        >
          {status}
        </p>
      )}
    </main>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  onGray = false,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onGray?: boolean;
}) {
  const btn = `sb-icon-btn text-xl font-semibold ${onGray ? "bg-white" : ""}`;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="Decrease"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="sb-brand w-9 text-center text-xl tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
