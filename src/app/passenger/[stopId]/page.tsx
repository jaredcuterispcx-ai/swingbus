"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BoltGlyph } from "@/components/brand";
import { ChevronIcon, PinIcon, TripDots, UsersIcon } from "@/components/icons";
import { MiniMap } from "@/components/mini-map";
import { shuttlesForStop } from "@/lib/fleet";
import { stopName, useAppState } from "@/lib/use-app-state";

export default function PassengerStopPage() {
  const params = useParams<{ stopId: string }>();
  const stopId = params.stopId;
  const { state, loading, error, refresh } = useAppState(2500);
  const [destinationId, setDestinationId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const stop = state?.stops.find((s) => s.id === stopId);
  const destinations = useMemo(
    () => (state?.stops ?? []).filter((s) => s.id !== stopId),
    [state, stopId],
  );

  const ride = state?.ride;
  const myParty =
    ride && (ride.status === "waiting" || ride.status === "cleared" || ride.status === "boarding")
      ? ride
      : undefined;
  const waiting = Boolean(myParty && myParty.stopId === stopId);

  const fleet = useMemo(
    () => (state && stopId ? shuttlesForStop(state, stopId) : []),
    [state, stopId],
  );
  const mine = waiting ? fleet.find((row) => row.vehicle.id === myParty?.vehicleId) : undefined;
  const next = mine ?? fleet[0] ?? null;

  async function submit() {
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
      await refresh();
      setDestinationId("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelWait() {
    if (!myParty) return;
    await fetch("/api/parties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id: myParty.id }),
    });
    setDestinationId("");
    await refresh();
  }

  const activeVehicles = (state?.vehicles ?? [])
    .filter((v) => v.active)
    .map((v) => ({ ...v, highlight: v.id === next?.vehicle.id }));

  if (loading) {
    return (
      <main className="sb-shell">
        <AppHeader />
        <div className="h-48 animate-pulse rounded-xl bg-foam" />
      </main>
    );
  }

  if (!stop) {
    return (
      <main className="sb-shell">
        <AppHeader />
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <>
            <h1 className="sb-brand text-3xl">Stop not found</h1>
            <Link href="/" className="sb-btn sb-btn-primary mt-5 w-full">
              Choose a stop
            </Link>
          </>
        )}
      </main>
    );
  }

  if (waiting && myParty) {
    const cleared = myParty.status === "cleared" || myParty.status === "boarding";
    return (
      <main className="sb-shell">
        <AppHeader />
        <MiniMap
          stops={state?.stops ?? []}
          vehicles={activeVehicles}
          pickupId={stopId}
          destinationId={myParty.destinationId}
          height={220}
        />

        <section className="sb-rise -mt-4 relative rounded-2xl bg-white px-1 pt-5">
          {next ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="sb-brand text-3xl">
                  {next.etaMinutes != null ? `${next.etaMinutes} min` : "On the way"}
                </p>
                <p className="mt-0.5 truncate text-ink-soft">
                  {cleared ? `${next.vehicle.callsign} is coming` : `${next.vehicle.callsign} is closest`}
                </p>
              </div>
              <span className="sb-pill sb-pill-dark shrink-0">
                <BoltGlyph size={14} />
                {next.vehicle.callsign}
              </span>
            </div>
          ) : (
            <div>
              <p className="sb-brand text-3xl">Waiting</p>
              <p className="mt-0.5 text-ink-soft">No shuttles online yet</p>
            </div>
          )}

          <div className="mt-5 flex gap-3 rounded-xl bg-foam p-3.5">
            <TripDots />
            <div className="min-w-0 flex-1 space-y-4">
              <p className="truncate font-semibold">{stop.name}</p>
              <p className="truncate font-semibold">{stopName(state, myParty.destinationId)}</p>
            </div>
            <span className="flex items-center gap-1 self-center text-sm font-semibold">
              <UsersIcon size={16} />
              {myParty.partySize}
            </span>
          </div>

          {fleet.length > 1 && (
            <>
              <h2 className="sb-brand mt-6 mb-1 text-lg">All shuttles</h2>
              <ul>
                {fleet.map((row) => (
                  <li key={row.vehicle.id} className="sb-row cursor-default">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black">
                      <BoltGlyph size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.vehicle.callsign}</span>
                      <span className="block truncate text-sm text-ink-soft">
                        {row.comingHere
                          ? "Coming here"
                          : row.headingName
                            ? `→ ${row.headingName}`
                            : `${row.seatsFree} seats`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {row.etaMinutes != null ? `${row.etaMinutes} min` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            type="button"
            className="sb-btn sb-btn-ghost mt-6 w-full"
            onClick={() => void cancelWait()}
          >
            Cancel ride
          </button>
        </section>
      </main>
    );
  }

  const dest = destinations.find((d) => d.id === destinationId);

  return (
    <main className="sb-shell flex flex-col">
      <AppHeader />

      <div className="mb-4 flex gap-3 rounded-xl bg-foam p-3.5">
        <TripDots />
        <div className="min-w-0 flex-1 space-y-4">
          <p className="truncate font-semibold">{stop.name}</p>
          {dest ? (
            <button
              type="button"
              className="block w-full truncate text-left font-semibold"
              onClick={() => setDestinationId("")}
            >
              {dest.name}
            </button>
          ) : (
            <p className="font-semibold text-ink-soft">Where to?</p>
          )}
        </div>
      </div>

      {!dest ? (
        <ul className="sb-rise">
          {destinations.map((s) => (
            <li key={s.id}>
              <button type="button" className="sb-row" onClick={() => setDestinationId(s.id)}>
                <span className="sb-icon-btn size-10">
                  <PinIcon />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                <span className="text-ink-soft">
                  <ChevronIcon />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sb-rise flex flex-1 flex-col">
          <MiniMap
            stops={state?.stops ?? []}
            vehicles={activeVehicles}
            pickupId={stopId}
            destinationId={destinationId}
            height={200}
          />
          <div className="mt-5 flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold">
              <UsersIcon /> Riders
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Fewer riders"
                className="sb-icon-btn text-xl font-semibold"
                disabled={partySize <= 1}
                onClick={() => setPartySize((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <span className="sb-brand w-10 text-center text-2xl tabular-nums">{partySize}</span>
              <button
                type="button"
                aria-label="More riders"
                className="sb-icon-btn text-xl font-semibold"
                disabled={partySize >= 12}
                onClick={() => setPartySize((n) => Math.min(12, n + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="sb-sticky-cta mt-auto">
            {next?.etaMinutes != null && (
              <p className="mb-2 text-center text-sm font-medium text-ink-soft">
                Next shuttle in {next.etaMinutes} min
              </p>
            )}
            {formError && <p className="mb-2 text-center text-sm text-danger">{formError}</p>}
            <button
              type="button"
              className="sb-btn sb-btn-primary sb-btn-lg w-full"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Requesting…" : "Request swingbus"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
