"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { stopName, useAppState } from "@/lib/use-app-state";

export default function PassengerHomePage() {
  const { state, loading, error } = useAppState(5000);
  const [stopId, setStopId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== stopId),
    [state, stopId],
  );

  const waitingHere = useMemo(() => {
    if (!state || !stopId) return 0;
    return state.parties
      .filter(
        (p) =>
          p.stopId === stopId &&
          (p.status === "waiting" ||
            p.status === "cleared" ||
            p.status === "boarding"),
      )
      .reduce((n, p) => n + p.partySize, 0);
  }, [state, stopId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, destinationId, partySize, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      const cleared =
        data.status === "cleared"
          ? " Ground control already held seats on a shuttle."
          : " You're in the stand queue.";
      setResult(
        `Party of ${partySize} → ${stopName(state, destinationId)}.${cleared}`,
      );
      setNote("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="sb-shell">
      <AppHeader badge="Passenger" />

      <header className="sb-rise mb-6">
        <h1 className="sb-brand text-4xl tracking-tight">Where to?</h1>
        <p className="mt-2 text-ink-soft">
          Scan a stand QR or pick below. Seats get held on the next shuttle —
          Uber-simple, XSI-smart.
        </p>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading stands…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="sb-panel sb-rise sb-rise-delay-1 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
            You are at
          </span>
          <select
            className="sb-select"
            required
            value={stopId}
            onChange={(e) => {
              setStopId(e.target.value);
              if (e.target.value === destinationId) setDestinationId("");
            }}
          >
            <option value="">Select stand</option>
            {(state?.stops ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {stopId ? (
          <p className="text-sm text-ink-soft/80">
            Seats demanded here now:{" "}
            <strong className="text-ink">{waitingHere}</strong>
          </p>
        ) : null}

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
            Going to
          </span>
          <select
            className="sb-select"
            required
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            disabled={!stopId}
          >
            <option value="">Select destination</option>
            {destinations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
            Party size (seats needed)
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="sb-btn sb-btn-ghost px-4"
              onClick={() => setPartySize((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <input
              className="sb-input text-center text-lg font-semibold"
              type="number"
              min={1}
              max={12}
              value={partySize}
              onChange={(e) =>
                setPartySize(Math.min(12, Math.max(1, Number(e.target.value) || 1)))
              }
            />
            <button
              type="button"
              className="sb-btn sb-btn-ghost px-4"
              onClick={() => setPartySize((n) => Math.min(12, n + 1))}
            >
              +
            </button>
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
            Note (optional)
          </span>
          <input
            className="sb-input"
            value={note}
            maxLength={120}
            placeholder="e.g. two with luggage"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {formError && <p className="text-sm text-danger">{formError}</p>}
        {result && (
          <p className="rounded-xl bg-leaf/10 px-3 py-2 text-sm text-leaf">{result}</p>
        )}

        <button
          type="submit"
          className="sb-btn sb-btn-accent w-full"
          disabled={submitting || !stopId || !destinationId}
        >
          {submitting ? "Queuing…" : "Request seats"}
        </button>
      </form>

      <div className="sb-rise sb-rise-delay-2 mt-4">
        <Link href="/stops" className="sb-btn sb-btn-ghost w-full">
          Open stand QR codes
        </Link>
      </div>
    </main>
  );
}
