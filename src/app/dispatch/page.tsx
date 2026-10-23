"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { MiniMap } from "@/components/mini-map";
import { ServiceHoursPanel } from "@/components/service-hours";
import { SignOutButton } from "@/components/sign-out";
import { serviceLabel } from "@/lib/stops";
import {
  stopName,
  useStaffState,
  type StaffParty,
  type VehicleWithSeats,
} from "@/lib/use-app-state";

export default function GroundControlPage() {
  const { state, loading, error, refresh } = useStaffState(2000);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const stands = useMemo(() => {
    if (!state) return [];
    return state.stops
      .map((stop) => {
        const open = state.parties.filter(
          (p) =>
            p.stopId === stop.id &&
            (p.status === "waiting" ||
              p.status === "cleared" ||
              p.status === "boarding"),
        );
        const waitingSeats = open
          .filter((p) => p.status === "waiting")
          .reduce((n, p) => n + p.partySize, 0);
        const clearedSeats = open
          .filter((p) => p.status === "cleared" || p.status === "boarding")
          .reduce((n, p) => n + p.partySize, 0);
        return { stop, open, waitingSeats, clearedSeats };
      })
      .filter((s) => s.waitingSeats + s.clearedSeats > 0)
      .sort(
        (a, b) =>
          b.waitingSeats + b.clearedSeats - (a.waitingSeats + a.clearedSeats),
      );
  }, [state]);

  const fleet: VehicleWithSeats[] =
    state?.vehicles.filter((v) => v.active) ?? [];
  const clearances =
    state?.activeClearances ??
    state?.clearances.filter(
      (c) =>
        c.status === "issued" ||
        c.status === "accepted" ||
        c.status === "boarding",
    ) ??
    [];

  async function resetDemo() {
    await fetch("/api/state", { method: "DELETE" });
    await refresh();
  }

  async function seedDemo() {
    await fetch("/api/demo/seed", { method: "POST" });
    await refresh();
  }

  async function cancelRide(p: StaffParty) {
    const trip = `${p.partySize} from ${stopName(state, p.stopId)} to ${stopName(state, p.destinationId)}`;
    if (!confirm(`Cancel ${trip}?`)) return;
    const res = await fetch("/api/parties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    setCancelError(res.ok ? null : data.error || "Couldn't cancel that ride");
    await refresh();
  }

  return (
    <main className="sb-shell !max-w-[860px]">
      <AppHeader title="Ground control" />

      <header className="sb-rise mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="sb-btn sb-btn-ghost text-sm">
            Edit stops
          </Link>
          <button type="button" className="sb-btn sb-btn-accent text-sm" onClick={seedDemo}>
            Demo data
          </button>
          <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={resetDemo}>
            Reset
          </button>
          <SignOutButton className="sb-btn sb-btn-ghost text-sm" />
        </div>
      </header>

      <div className="mb-4">
        <MiniMap
          stops={state?.stops ?? []}
          vehicles={fleet}
          height={260}
        />
      </div>

      {loading && <p className="text-sm text-ink-soft/70">Loading board…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="sb-panel sb-rise mb-4">
        <h2 className="sb-brand text-2xl">Fleet</h2>
        {fleet.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">
            No shuttles online
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fleet.map((v) => (
              <article
                key={v.id}
                className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{v.callsign}</h3>
                  <span className="text-xs uppercase tracking-wide text-leaf">
                    {serviceLabel(v.service)} · {v.status}
                  </span>
                </div>
                <p className="sb-brand mt-1 text-3xl tabular-nums text-ink">
                  {v.seats.available}
                  <span className="ml-2 text-base font-sans font-medium text-ink-soft/70">
                    seats free
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-soft/75">
                  {v.seats.reserved} held · {v.seats.occupied}/{v.seats.capacity}{" "}
                  onboard
                  {v.lat != null
                    ? ` · ${v.lat.toFixed(4)}, ${v.lng!.toFixed(4)}`
                    : " · no GPS"}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist/50">
                  <div
                    className="h-full bg-leaf"
                    style={{
                      width: `${Math.min(100, (v.seats.occupied / v.seats.capacity) * 100)}%`,
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ServiceHoursPanel state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="sb-panel sb-rise sb-rise-delay-1">
          <h2 className="sb-brand text-2xl">Waiting</h2>
          {cancelError && <p className="mt-2 text-sm text-danger">{cancelError}</p>}
          {stands.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">No one waiting</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stands.map(({ stop, open, waitingSeats, clearedSeats }) => (
                <li
                  key={stop.id}
                  className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {stop.shortCode} · {stop.name}
                    </span>
                    <span className="sb-brand text-2xl">
                      {waitingSeats + clearedSeats}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft/70">
                    {waitingSeats} waiting · {clearedSeats} cleared
                  </p>
                  <ul className="mt-1 space-y-1">
                    {open.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-sm break-words text-ink-soft/80">
                          {p.partySize} → {stopName(state, p.destinationId)} ({p.status})
                        </span>
                        {(p.status === "waiting" || p.status === "cleared") && (
                          <button
                            type="button"
                            className="sb-btn sb-btn-ghost shrink-0 px-3 text-sm"
                            onClick={() => void cancelRide(p)}
                          >
                            Cancel
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sb-panel sb-rise sb-rise-delay-2">
          <h2 className="sb-brand text-2xl">Clearances</h2>
          {clearances.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">
              None right now
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {clearances.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-[var(--line)] bg-leaf/10 px-3 py-2"
                >
                  <p className="font-semibold">
                    {c.vehicleCallsign} → {c.stopName}
                  </p>
                  <p className="text-xs text-ink-soft/80">
                    Hold {c.seatsReserved} seats · ETA ~{c.etaMinutes} min ·{" "}
                    {c.status}
                  </p>
                  <p className="text-xs text-ink-soft/70">{c.destinationSummary}</p>
                  <p className="mt-1 text-[11px] text-leaf">{c.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="sb-panel sb-rise sb-rise-delay-3 mt-4">
        <h2 className="sb-brand text-2xl">Recent</h2>
        {(state?.events.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">Nothing yet</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {state!.events.slice(0, 10).map((e) => {
              const v = state!.vehicles.find((x) => x.id === e.vehicleId);
              return (
                <li key={e.id} className="text-sm text-ink-soft/90">
                  <span className="font-medium text-ink">
                    {v?.callsign ?? "Vehicle"}
                  </span>{" "}
                  {e.kind === "board" ? "boarded" : "alighted"} {e.seats} @{" "}
                  {stopName(state, e.stopId)}
                  {e.kind === "board" ? (
                    <>
                      {" "}
                      → {stopName(state, e.destinationId)}
                    </>
                  ) : null}{" "}
                  <span className="text-xs opacity-60">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
