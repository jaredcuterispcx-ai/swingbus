"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { stopName, useAppState } from "@/lib/use-app-state";

export default function PassengerStopPage() {
  const params = useParams<{ stopId: string }>();
  const stopId = params.stopId;
  const { state, loading, error, refresh } = useAppState(4000);
  const [destinationId, setDestinationId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const stop = state?.stops.find((s) => s.id === stopId);
  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== stopId),
    [state, stopId],
  );

  const demand = useMemo(() => {
    if (!state) return { seats: 0, parties: 0 };
    const list = state.parties.filter(
      (p) =>
        p.stopId === stopId &&
        (p.status === "waiting" ||
          p.status === "cleared" ||
          p.status === "boarding"),
    );
    return {
      seats: list.reduce((n, p) => n + p.partySize, 0),
      parties: list.length,
    };
  }, [state, stopId]);

  const clearance = state?.clearances.find(
    (c) =>
      c.stopId === stopId &&
      (c.status === "issued" ||
        c.status === "accepted" ||
        c.status === "boarding"),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, destinationId, partySize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessage(
        data.status === "cleared"
          ? `Seats held — party of ${partySize} to ${stopName(state, destinationId)}. Watch for your shuttle.`
          : `Queued — party of ${partySize} to ${stopName(state, destinationId)}.`,
      );
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="sb-shell">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/passenger" className="text-sm text-ink-soft/80">
          ← Passenger
        </Link>
        <span className="text-xs font-medium tracking-wide text-leaf uppercase">
          Stand check-in
        </span>
      </div>

      {loading && <p className="text-sm text-ink-soft/70">Loading stand…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !stop && (
        <div className="sb-panel">
          <h1 className="sb-brand text-3xl">Unknown stand</h1>
          <p className="mt-2 text-sm text-ink-soft/85">
            This QR doesn&apos;t match a Swing Bus stand.
          </p>
          <Link href="/passenger" className="sb-btn sb-btn-primary mt-4 inline-flex">
            Choose stand
          </Link>
        </div>
      )}

      {stop && (
        <>
          <header className="sb-rise mb-5">
            <p className="text-sm font-medium tracking-[0.16em] text-leaf uppercase">
              Stand {stop.shortCode}
            </p>
            <h1 className="sb-brand mt-1 text-4xl">{stop.name}</h1>
            <p className="mt-2 text-sm text-ink-soft/85">{stop.description}</p>
          </header>

          <div className="sb-panel sb-rise sb-rise-delay-1 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Seat demand
              </p>
              <p className="sb-brand text-3xl">
                {demand.seats}
                <span className="ml-2 text-base font-sans font-medium text-ink-soft/70">
                  seats · {demand.parties} parties
                </span>
              </p>
            </div>
            {clearance ? (
              <div className="max-w-[45%] text-right text-xs leading-snug text-leaf">
                {clearance.vehicleCallsign} holding {clearance.seatsReserved} · ~
                {clearance.etaMinutes} min
              </div>
            ) : (
              <div className="text-xs text-ink-soft/60">Awaiting clearance</div>
            )}
          </div>

          <form
            onSubmit={submit}
            className="sb-panel sb-rise sb-rise-delay-2 space-y-4"
          >
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
                How many seats?
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
            {message && (
              <p className="rounded-xl bg-leaf/10 px-3 py-2 text-sm text-leaf">
                {message}
              </p>
            )}

            <button
              type="submit"
              className="sb-btn sb-btn-accent w-full"
              disabled={submitting || !destinationId}
            >
              {submitting ? "Queuing…" : "Request seats"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
