"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { PinIcon, UsersIcon } from "@/components/icons";
import { ClosedStopsNote } from "@/components/service-hours";
import { SignOutButton } from "@/components/sign-out";
import { randomElectricCallsign } from "@/lib/callsigns";
import { formatDistance, stopsByDistance } from "@/lib/geo";
import { HEARTBEAT_MS } from "@/lib/lifecycle";
import { statusOf } from "@/lib/service-hours";
import { serviceLabel } from "@/lib/stops";
import type { ShuttleService } from "@/lib/types";
import type { VehicleWithSeats } from "@/lib/use-app-state";
import { stopName, useStaffState } from "@/lib/use-app-state";

const VEHICLE_KEY = "swingbus.vehicleId";
const SHUTTLE_SERVICES: ShuttleService[] = ["onsite", "offsite"];

type PickupGroup = {
  id: string;
  pax: number;
  destinationId: string;
  partyIds?: string[];
};

export default function DriverPage() {
  const { state, loading, error, refresh } = useStaffState(2500);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState("");
  const [capacity, setCapacity] = useState(14);
  const [service, setService] = useState<ShuttleService>("onsite");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pickupStopId, setPickupStopId] = useState("");
  const [destId, setDestId] = useState("");
  const [pax, setPax] = useState(1);
  const [groups, setGroups] = useState<PickupGroup[]>([]);
  const [confirmOffline, setConfirmOffline] = useState(false);
  /** Suggested group waiting on a second tap to be marked as a no-show. */
  const [noShowKey, setNoShowKey] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    null,
  );
  /** Last stop we auto-selected for; a manual pick sticks until the next arrival. */
  const lastArrivalRef = useRef<string | null>(null);
  const lastPushRef = useRef<{ at: number; stopId: string | null }>({ at: 0, stopId: null });
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null);
  const callsignSeeded = useRef(false);
  const stopsRef = useRef(state?.stops ?? []);
  stopsRef.current = state?.stops ?? stopsRef.current;

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!noShowKey) return;
    const t = setTimeout(() => setNoShowKey(null), 4000);
    return () => clearTimeout(t);
  }, [noShowKey]);

  useEffect(() => {
    const saved = localStorage.getItem(VEHICLE_KEY);
    if (saved) setVehicleId(saved);
  }, []);

  const vehicle: VehicleWithSeats | undefined = state?.vehicles.find(
    (v) => v.id === vehicleId,
  );
  const online = Boolean(vehicle?.active);

  // iOS stops location updates when the screen locks, and the shuttle drops off the map.
  useEffect(() => {
    if (!online || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) void next.release();
        else lock = next;
      } catch {
        // Not allowed right now (low battery, or the page is hidden); retried on the next visit.
      }
    };
    void acquire();
    // The browser drops the lock whenever the page is hidden.
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [online]);

  useEffect(() => {
    if (!state || vehicle || callsignSeeded.current) return;
    callsignSeeded.current = true;
    setCallsign(randomElectricCallsign(state.vehicles));
  }, [state, vehicle]);

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

  const onboard = useMemo(() => {
    if (!state || !vehicleId) return [];
    const byDest = new Map<string, number>();
    for (const p of state.parties) {
      if (p.vehicleId !== vehicleId || p.status !== "onboard") continue;
      byDest.set(p.destinationId, (byDest.get(p.destinationId) ?? 0) + p.partySize);
    }
    return [...byDest.entries()].map(([destinationId, pax]) => ({ destinationId, pax }));
  }, [state, vehicleId]);
  const dropHere = atStop ? onboard.find((g) => g.destinationId === atStop.id) : undefined;
  const onboardPax = onboard.reduce((n, g) => n + g.pax, 0);

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
    const onFix = (p: GeolocationPosition) => {
      setGeoError(null);
      const fix = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
      };
      setPos(fix);
      lastFixRef.current = fix;
      // Phones can emit several fixes a second; only report every 5s
      // unless the driver just entered or left a stop.
      const here =
        stopsByDistance(stopsRef.current, fix).find((d) => d.atStop)?.stop.id ?? null;
      const now = Date.now();
      const last = lastPushRef.current;
      if (now - last.at < 5000 && here === last.stopId) return;
      lastPushRef.current = { at: now, stopId: here };
      void pushLocation(fix.lat, fix.lng);
    };
    const watchId = navigator.geolocation.watchPosition(
      onFix,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) lastFixRef.current = null;
        setGeoError(err.message || "Location unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    // A parked phone stops sending fixes; check in with the last one so ground
    // control doesn't take a waiting shuttle for a lost one.
    const checkIn = () => {
      const fix = lastFixRef.current;
      if (!fix || document.visibilityState !== "visible") return;
      if (Date.now() - lastPushRef.current.at < HEARTBEAT_MS) return;
      lastPushRef.current = { ...lastPushRef.current, at: Date.now() };
      void pushLocation(fix.lat, fix.lng);
    };
    const timer = setInterval(checkIn, 5_000);
    document.addEventListener("visibilitychange", checkIn);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkIn);
    };
  }, [vehicleId, pushLocation]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign, capacity, service }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      localStorage.setItem(VEHICLE_KEY, data.id);
      setVehicleId(data.id);
      setStatus(`${data.callsign} is online`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function goOffline(dropOff = false) {
    if (!vehicleId) return;
    setConfirmOffline(false);
    const res = await fetch("/api/vehicles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "active", vehicleId, active: false, dropOff }),
    });
    if (!res.ok) {
      // Riders boarded after this screen last refreshed: ask first.
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "Failed");
      await refresh();
      setConfirmOffline(true);
      return;
    }
    forgetShuttle();
    await refresh();
  }

  function forgetShuttle() {
    localStorage.removeItem(VEHICLE_KEY);
    setVehicleId(null);
    setGroups([]);
  }

  async function goOnline() {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "active", vehicleId, active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus(`${data.callsign} is online`);
      if (pos) await pushLocation(pos.lat, pos.lng);
      else await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markNoShow(s: { destinationId: string; partyIds: string[] }) {
    if (!vehicleId || !pickupStopId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "no_show",
          vehicleId,
          stopId: pickupStopId,
          partyIds: s.partyIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus(`No-show · ${data.seats} to ${stopName(state, s.destinationId)}`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
      await refresh();
    } finally {
      setNoShowKey(null);
      setBusy(false);
    }
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
      // App requests go first so a walk-up group for the same stop can't claim them.
      const ordered = [
        ...groups.filter((g) => g.partyIds?.length),
        ...groups.filter((g) => !g.partyIds?.length),
      ];
      for (const g of ordered) {
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
        setGroups((prev) => prev.filter((x) => x.id !== g.id));
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

  async function doAlight(group: { destinationId: string; pax: number }) {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "alight",
          vehicleId,
          destinationId: group.destinationId,
          seats: group.pax,
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
      <AppHeader
        right={
          vehicle?.active ? (
            <button
              type="button"
              className="sb-pill"
              onClick={() => (onboardPax > 0 ? setConfirmOffline(true) : void goOffline())}
            >
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

            <div className="mt-5 grid w-full grid-cols-2 gap-2" role="group" aria-label="Service">
              {SHUTTLE_SERVICES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={service === s}
                  className={`sb-seg ${service === s ? "sb-seg-on" : ""}`}
                  onClick={() => setService(s)}
                >
                  {serviceLabel(s)}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={busy || !callsign.trim()}
              className="mt-10 flex size-32 items-center justify-center rounded-full bg-night text-3xl font-extrabold tracking-tight text-on-night shadow-[0_0_0_10px_var(--volt)] transition active:scale-95 disabled:opacity-40"
            >
              {busy ? "…" : "GO"}
            </button>

            <div className="mt-10">
              <SignOutButton />
            </div>
          </form>
        )
      ) : !vehicle.active ? (
        <div className="sb-rise space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-foam px-4 py-3.5">
            <span className="min-w-0 truncate font-semibold">{vehicle.callsign}</span>
            <span className="text-sm font-semibold text-ink-soft">Offline</span>
          </div>
          <button
            type="button"
            className="sb-btn sb-btn-primary sb-btn-lg w-full"
            disabled={busy}
            onClick={() => void goOnline()}
          >
            Go online
          </button>
          <button type="button" className="sb-btn sb-btn-ghost w-full" onClick={forgetShuttle}>
            New shuttle
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="sb-rise sb-night rounded-xl px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                <span className="sb-live-dot shrink-0" />
                <span className="truncate">{vehicle.callsign}</span>
                <span className="shrink-0 text-sm font-medium text-on-night/70">
                  {serviceLabel(vehicle.service)}
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                <UsersIcon size={16} />
                {vehicle.seats.occupied}/{vehicle.seats.capacity}
              </span>
            </div>
            <p className="mt-1 pl-5 text-xs text-on-night/60">Keep this screen open</p>
          </div>

          {confirmOffline && onboardPax > 0 && (
            <div className="sb-rise space-y-2 rounded-xl bg-foam p-3">
              <p className="px-1 py-1 font-semibold">{onboardPax} still on board</p>
              <button
                type="button"
                className="sb-btn sb-btn-primary w-full"
                disabled={busy}
                onClick={() => void goOffline(true)}
              >
                Drop off and go offline
              </button>
              <button
                type="button"
                className="sb-btn sb-btn-ghost w-full bg-raised"
                onClick={() => setConfirmOffline(false)}
              >
                Keep driving
              </button>
            </div>
          )}

          {geoError ? (
            <p className="rounded-xl bg-amber-soft px-3.5 py-3 text-sm font-medium text-amber">
              Turn on location so riders can see you
            </p>
          ) : pos && (atStop || nearest) ? (
            <div
              className={`flex items-center gap-3 rounded-xl p-3.5 ${
                atStop ? "bg-volt text-on-volt" : "bg-foam"
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

          {dropHere && (
            <button
              type="button"
              className="sb-btn sb-btn-primary sb-btn-lg w-full"
              disabled={busy}
              onClick={() => void doAlight(dropHere)}
            >
              Drop off {dropHere.pax}
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
                const key = s.partyIds.join("-");
                const confirming = noShowKey === key;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 border-b border-[var(--line)] last:border-b-0"
                  >
                    <button
                      type="button"
                      className="sb-row min-w-0 flex-1 border-b-0"
                      disabled={added}
                      onClick={() => addSuggested(s)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-volt font-bold text-on-volt tabular-nums">
                        {s.pax}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {stopName(state, s.destinationId)}
                      </span>
                      <span className="sb-pill">{added ? "Added" : "Add"}</span>
                    </button>
                    {!added && (
                      <button
                        type="button"
                        className={`sb-btn shrink-0 px-3 text-sm ${confirming ? "sb-btn-primary" : "sb-btn-ghost"}`}
                        disabled={busy}
                        onClick={() => (confirming ? void markNoShow(s) : setNoShowKey(key))}
                      >
                        {confirming ? "Confirm" : "No-show"}
                      </button>
                    )}
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
                  className="sb-select min-w-0 flex-1 bg-raised font-semibold"
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
                className="sb-btn sb-btn-ghost w-full bg-raised"
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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-strong font-bold text-on-strong tabular-nums">
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

          {onboard.length > 0 && groups.length === 0 && (
            <div>
              <span className="sb-label">On board</span>
              <ul>
                {onboard.map((g) => (
                  <li key={g.destinationId} className="sb-row cursor-default">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-strong font-bold text-on-strong tabular-nums">
                      {g.pax}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {stopName(state, g.destinationId)}
                    </span>
                    <button
                      type="button"
                      className="sb-btn sb-btn-ghost shrink-0"
                      disabled={busy}
                      onClick={() => void doAlight(g)}
                    >
                      Drop off
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {status && (
        <p
          role="status"
          className="sb-rise mt-4 rounded-xl bg-strong px-4 py-3 text-sm font-medium text-on-strong"
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
  const btn = `sb-icon-btn text-xl font-semibold ${onGray ? "bg-raised" : ""}`;
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
