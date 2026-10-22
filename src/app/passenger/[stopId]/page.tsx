"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { nextShuttleForStop, shuttlesForStop } from "@/lib/fleet";
import { stopName, useAppState } from "@/lib/use-app-state";

const PARTY_KEY = "swingbus.partyId";

export default function PassengerStopPage() {
  const params = useParams<{ stopId: string }>();
  const stopId = params.stopId;
  const { state, loading, error, refresh } = useAppState(2500);
  const [destinationId, setDestinationId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(PARTY_KEY);
    if (saved) setPartyId(saved);
  }, []);

  const stop = state?.stops.find((s) => s.id === stopId);
  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== stopId),
    [state, stopId],
  );

  const myParty = state?.parties.find(
    (p) =>
      p.id === partyId &&
      (p.status === "waiting" ||
        p.status === "cleared" ||
        p.status === "boarding"),
  );

  const waiting = Boolean(myParty && myParty.stopId === stopId);

  const fleet = useMemo(
    () => (state && stopId ? shuttlesForStop(state, stopId) : []),
    [state, stopId],
  );
  const next = useMemo(
    () => (state && stopId ? nextShuttleForStop(state, stopId) : null),
    [state, stopId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, destinationId, partySize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      localStorage.setItem(PARTY_KEY, data.id);
      setPartyId(data.id);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelWait() {
    if (!partyId) return;
    await fetch("/api/parties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id: partyId }),
    });
    localStorage.removeItem(PARTY_KEY);
    setPartyId(null);
    await refresh();
  }

  return (
    <main className="sb-shell">
      <AppHeader backHref="/" backLabel="Home" badge="Ride" />

      {loading && <p className="text-sm text-ink-soft">Loading…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !stop && (
        <div className="sb-panel">
          <h1 className="sb-brand text-3xl">Unknown stop</h1>
          <Link href="/" className="sb-btn sb-btn-primary mt-4 inline-flex">
            Pick a stop
          </Link>
        </div>
      )}

      {stop && !waiting && (
        <>
          <header className="sb-rise mb-5">
            <p className="sb-chip">Pickup · {stop.shortCode}</p>
            <h1 className="sb-brand mt-1 text-4xl tracking-tight">{stop.name}</h1>
            <p className="mt-2 text-sm text-ink-soft">{stop.description}</p>
          </header>

          <form onSubmit={submit} className="sb-panel sb-rise space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Destination
              </span>
              <select
                className="sb-select"
                required
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
              >
                <option value="">Where are you going?</option>
                {destinations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Passengers
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="sb-btn sb-btn-ghost px-4"
                  onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <div className="sb-brand flex-1 text-center text-3xl">{partySize}</div>
                <button
                  type="button"
                  className="sb-btn sb-btn-ghost px-4"
                  onClick={() => setPartySize((n) => Math.min(12, n + 1))}
                >
                  +
                </button>
              </div>
            </label>

            {formError && <p className="text-sm text-danger">{formError}</p>}

            <button
              type="submit"
              className="sb-btn sb-btn-accent w-full"
              disabled={submitting || !destinationId}
            >
              {submitting ? "Requesting…" : "Request ride"}
            </button>
          </form>
        </>
      )}

      {stop && waiting && myParty && (
        <div className="space-y-3">
          <section className="sb-panel sb-rise">
            <p className="sb-chip">Waiting at {stop.shortCode}</p>
            <h1 className="sb-brand mt-1 text-3xl tracking-tight">
              {myParty.partySize} → {stopName(state, myParty.destinationId)}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              {myParty.status === "cleared"
                ? "A shuttle has been cleared to you."
                : "You’re in the queue."}
            </p>
            {next && (
              <div className="mt-4 rounded-xl border border-leaf/35 bg-leaf/10 px-3 py-3">
                <p className="text-xs font-semibold tracking-wide text-leaf uppercase">
                  Next to you
                </p>
                <p className="sb-brand text-2xl">{next.vehicle.callsign}</p>
                <p className="text-sm text-ink-soft">
                  {next.etaMinutes != null
                    ? `~${next.etaMinutes} min`
                    : "ETA pending"}
                  {" · "}
                  {next.seatsFree} seats free
                  {" · "}
                  {next.reason}
                </p>
              </div>
            )}
            <button
              type="button"
              className="sb-btn sb-btn-ghost mt-3 w-full text-sm"
              onClick={() => void cancelWait()}
            >
              Cancel request
            </button>
          </section>

          <section className="sb-panel sb-rise sb-rise-delay-1">
            <h2 className="sb-brand text-xl">All shuttles</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Live fleet — which is coming to {stop.name}
            </p>
            {fleet.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                No shuttles online yet. Stay here — the board updates live.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {fleet.map((row, i) => (
                  <li
                    key={row.vehicle.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      row.comingHere || i === 0
                        ? "border-leaf/40 bg-leaf/10"
                        : "border-[var(--line)]"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="sb-brand text-lg">{row.vehicle.callsign}</p>
                      <p className="font-mono text-sm text-leaf">
                        {row.etaMinutes != null
                          ? `~${row.etaMinutes} min`
                          : "—"}
                      </p>
                    </div>
                    <p className="text-xs text-ink-soft">
                      {row.seatsFree} free
                      {row.headingName ? ` · → ${row.headingName}` : ""}
                      {" · "}
                      {row.reason}
                      {i === 0 ? " · next" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
