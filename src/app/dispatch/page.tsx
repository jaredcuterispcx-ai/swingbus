"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppHeader } from "@/components/app-header";
import { stopName, useAppState, type VehicleWithSeats } from "@/lib/use-app-state";

export default function GroundControlPage() {
  const { state, loading, error, refresh } = useAppState(2000);

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

  return (
    <main className="sb-shell !max-w-[860px]">
      <AppHeader badge="Control" />

      <header className="sb-rise mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="sb-brand text-4xl tracking-tight">Live network</h1>
          <p className="mt-2 max-w-lg text-ink-soft">
            Fleet seat tape · stand demand · auto clearances. Nearest vehicle
            with free seats gets the hold.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="sb-btn sb-btn-ghost text-sm">
            Edit stops
          </Link>
          <button type="button" className="sb-btn sb-btn-accent text-sm" onClick={seedDemo}>
            Seed scenario
          </button>
          <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={resetDemo}>
            Reset
          </button>
        </div>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading board…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="sb-panel sb-rise mb-4">
        <h2 className="sb-brand text-2xl">Fleet seat tape</h2>
        {fleet.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">
            No vehicles on duty. A driver opens Driver mode and goes on callsign.
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
                    {v.status}
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

      <div className="grid gap-4 md:grid-cols-2">
        <section className="sb-panel sb-rise sb-rise-delay-1">
          <h2 className="sb-brand text-2xl">Stands</h2>
          {stands.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">All stands clear.</p>
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
                  <p className="mt-1 text-xs text-ink-soft/80">
                    {open
                      .map(
                        (p) =>
                          `${p.partySize}→${stopName(state, p.destinationId)} (${p.status})`,
                      )
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sb-panel sb-rise sb-rise-delay-2">
          <h2 className="sb-brand text-2xl">Clearances</h2>
          {clearances.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">
              No clearances. Need waiting passengers and a vehicle with GPS + free
              seats.
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
        <h2 className="sb-brand text-2xl">Recent movements</h2>
        {(state?.events.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">No board/alight events yet.</p>
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
