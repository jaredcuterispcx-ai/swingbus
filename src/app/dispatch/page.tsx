"use client";

import Link from "next/link";
import { useMemo } from "react";
import { stopName, useAppState } from "@/lib/use-app-state";

export default function DispatchPage() {
  const { state, loading, error, refresh } = useAppState(2000);

  const waitingByStop = useMemo(() => {
    if (!state) return [];
    return state.stops
      .map((stop) => {
        const waiting = state.requests.filter(
          (r) =>
            r.stopId === stop.id &&
            (r.status === "waiting" || r.status === "assigned"),
        );
        const people = waiting.reduce((n, r) => n + r.partySize, 0);
        return { stop, people, waiting };
      })
      .filter((row) => row.people > 0)
      .sort((a, b) => b.people - a.people);
  }, [state]);

  const activeDrivers = state?.drivers.filter((d) => d.active) ?? [];

  async function resetDemo() {
    await fetch("/api/state", { method: "DELETE" });
    await refresh();
  }

  return (
    <main className="sb-shell !max-w-[720px]">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-soft/80">
          ← Swing Bus
        </Link>
        <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-leaf uppercase">
          <span className="sb-live-dot" /> Live board
        </span>
      </div>

      <header className="sb-rise mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="sb-brand text-4xl">Dispatch</h1>
          <p className="mt-2 max-w-md text-ink-soft/85">
            Auto-routing replaces the radio desk — nearest shuttle with free
            seats gets the longest-waiting demand first.
          </p>
        </div>
        <button type="button" className="sb-btn sb-btn-ghost text-sm" onClick={resetDemo}>
          Reset demo
        </button>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading board…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="sb-panel sb-rise">
          <h2 className="sb-brand text-2xl">People by stop</h2>
          {waitingByStop.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">All clear — no queues.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {waitingByStop.map(({ stop, people, waiting }) => (
                <li
                  key={stop.id}
                  className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{stop.name}</span>
                    <span className="sb-brand text-2xl">{people}</span>
                  </div>
                  <p className="text-xs text-ink-soft/70">
                    {waiting
                      .map(
                        (r) =>
                          `${r.partySize} → ${stopName(state, r.destinationId)}${
                            r.status === "assigned" ? " (assigned)" : ""
                          }`,
                      )
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sb-panel sb-rise sb-rise-delay-1">
          <h2 className="sb-brand text-2xl">Route suggestions</h2>
          {(state?.suggestions.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-ink-soft/75">
              No assignments yet. Need waiting passengers and an active driver
              with GPS.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {state!.suggestions.map((s) => (
                <li
                  key={`${s.driverId}-${s.stopId}-${s.requestIds.join("-")}`}
                  className="rounded-xl border border-[var(--line)] bg-leaf/10 px-3 py-2"
                >
                  <p className="font-semibold">
                    {s.driverLabel} → {s.stopName}
                  </p>
                  <p className="text-xs text-ink-soft/80">
                    {s.waitingPeople} pax · ~{s.estimatedMinutes} min · {s.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="sb-panel sb-rise sb-rise-delay-2 mt-4">
        <h2 className="sb-brand text-2xl">Active shuttles</h2>
        {activeDrivers.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">
            No drivers on duty. Open Driver mode on a phone to start.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {activeDrivers.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
              >
                <p className="font-semibold">{d.label}</p>
                <p className="text-xs text-ink-soft/75">
                  {d.onboard}/{d.capacity} onboard
                  {d.lat != null
                    ? ` · ${d.lat.toFixed(4)}, ${d.lng!.toFixed(4)}`
                    : " · no GPS yet"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sb-panel sb-rise sb-rise-delay-3 mt-4">
        <h2 className="sb-brand text-2xl">Recent pickups</h2>
        {(state?.pickups.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-soft/75">No pickups logged yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {state!.pickups.slice(0, 8).map((p) => {
              const driver = state!.drivers.find((d) => d.id === p.driverId);
              return (
                <li key={p.id} className="text-sm text-ink-soft/90">
                  <span className="font-medium text-ink">
                    {driver?.label ?? "Shuttle"}
                  </span>{" "}
                  took {p.partySize} from {stopName(state, p.stopId)} →{" "}
                  {stopName(state, p.destinationId)}{" "}
                  <span className="text-xs opacity-60">
                    {new Date(p.createdAt).toLocaleTimeString()}
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
