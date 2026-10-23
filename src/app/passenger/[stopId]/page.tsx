"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BoltGlyph, BoltMark } from "@/components/brand";
import { ChevronIcon, PinIcon, TripDots, UsersIcon } from "@/components/icons";
import { MiniMap } from "@/components/mini-map";
import type { PublicRide } from "@/lib/feed";
import { etaToStop, shuttlesForStop } from "@/lib/fleet";
import { stopAt } from "@/lib/geo";
import { EXPIRE_AFTER_MS, MAX_PARTY } from "@/lib/lifecycle";
import { stopName, useAppState } from "@/lib/use-app-state";

/** A rider who comes back later than this just gets a fresh request form. */
const OUTCOME_MS = 15 * 60_000;

/**
 * Rides whose outcome the rider has closed. The feed keeps returning the phone's
 * latest ride, so this keeps "Arrived" from coming back while the app stays open.
 */
const dismissed = new Set<string>();

/** Ended in a way the rider should be told about (they cancelled the rest themselves). */
function worthTelling(ride: PublicRide, now: number) {
  const told = ride.status === "delivered" || (ride.status === "cancelled" && ride.cancelReason);
  return Boolean(told) && now - Date.parse(ride.updatedAt) < OUTCOME_MS;
}

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

  /** Server clock, so the outcome window doesn't depend on the phone's. */
  const now = state ? Date.parse(state.updatedAt) : 0;
  const ride = state?.ride;
  const myParty = ride && ride.stopId === stopId && !dismissed.has(ride.id) ? ride : undefined;
  const waiting = Boolean(
    myParty &&
      (myParty.status === "waiting" || myParty.status === "cleared" || myParty.status === "boarding"),
  );
  const riding = myParty?.status === "onboard";
  const ended = myParty && worthTelling(myParty, now) ? myParty : null;

  const fleet = useMemo(
    () => (state && stopId ? shuttlesForStop(state, stopId) : []),
    [state, stopId],
  );
  const mine = waiting ? fleet.find((row) => row.vehicle.id === myParty?.vehicleId) : undefined;
  const next = mine ?? fleet.find((row) => row.vehicle.presence !== "lost") ?? null;
  const maxRiders = state?.maxPartySize ?? MAX_PARTY;
  const riders = Math.min(partySize, maxRiders);

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, destinationId, partySize: riders }),
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

  function requestAgain(r: PublicRide) {
    dismissed.add(r.id);
    setDestinationId(r.destinationId);
    setPartySize(r.partySize);
  }

  const activeVehicles = (state?.vehicles ?? [])
    .filter((v) => v.active)
    .map((v) => ({
      ...v,
      highlight: v.id === next?.vehicle.id,
      faded: v.presence !== "live",
    }));

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

  if (ended) {
    const arrived = ended.status === "delivered";
    const callsign = state?.vehicles.find((v) => v.id === ended.vehicleId)?.callsign ?? "The shuttle";
    return (
      <main className="sb-shell">
        <AppHeader />
        <section className="sb-rise pt-4">
          {arrived ? (
            <BoltMark size={56} />
          ) : (
            <span className="sb-icon-btn size-14">
              <PinIcon size={24} />
            </span>
          )}
          <p className="sb-brand mt-5 text-3xl">
            {arrived ? "Arrived" : ended.cancelReason === "no_show" ? "Missed pickup" : "Request expired"}
          </p>
          <p className="mt-0.5 truncate text-ink-soft">
            {arrived
              ? stopName(state, ended.destinationId)
              : ended.cancelReason === "no_show"
                ? `${callsign} couldn't find you`
                : `No pickup in ${EXPIRE_AFTER_MS / 60_000} min`}
          </p>
          <TripCard
            from={stop.name}
            to={stopName(state, ended.destinationId)}
            riders={ended.partySize}
          />
          {arrived ? (
            <Link
              href="/"
              className="sb-btn sb-btn-primary sb-btn-lg mt-6 w-full"
              onClick={() => dismissed.add(ended.id)}
            >
              Done
            </Link>
          ) : (
            <button
              type="button"
              className="sb-btn sb-btn-primary sb-btn-lg mt-6 w-full"
              onClick={() => requestAgain(ended)}
            >
              Request again
            </button>
          )}
        </section>
      </main>
    );
  }

  if (riding && myParty) {
    const shuttle = state?.vehicles.find((v) => v.id === myParty.vehicleId);
    const eta = state && shuttle ? etaToStop(state.stops, shuttle, myParty.destinationId) : null;
    const there =
      state &&
      shuttle?.lat != null &&
      shuttle.lng != null &&
      shuttle.presence !== "lost" &&
      stopAt(state.stops, { lat: shuttle.lat, lng: shuttle.lng })?.id === myParty.destinationId;
    const to = stopName(state, myParty.destinationId);
    return (
      <main className="sb-shell">
        <AppHeader />
        <MiniMap
          stops={state?.stops ?? []}
          vehicles={shuttle ? [{ ...shuttle, highlight: true }] : []}
          pickupId={stopId}
          destinationId={myParty.destinationId}
          height={220}
        />

        <section className="sb-rise -mt-4 relative rounded-2xl bg-white px-1 pt-5">
          <p className="sb-brand truncate text-3xl">On {shuttle?.callsign ?? "board"}</p>
          <p className="mt-0.5 truncate text-ink-soft">
            {there ? `At ${to}` : eta != null ? `To ${to} · ${eta} min` : `To ${to}`}
          </p>
          <TripCard from={stop.name} to={to} riders={myParty.partySize} />
        </section>
      </main>
    );
  }

  if (waiting && myParty) {
    const cleared = myParty.status === "cleared" || myParty.status === "boarding";
    const tooBig = myParty.status === "waiting" && myParty.partySize > maxRiders;
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
          {tooBig ? (
            <div>
              <p className="sb-brand text-3xl">Too many riders</p>
              <p className="mt-0.5 truncate text-ink-soft">Shuttles online seat up to {maxRiders}</p>
            </div>
          ) : next ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="sb-brand text-3xl">
                  {next.etaMinutes != null ? `${next.etaMinutes} min` : "On the way"}
                </p>
                <p className="mt-0.5 truncate text-ink-soft">
                  {next.vehicle.presence === "stale"
                    ? `Last seen ${next.vehicle.lastSeenMin} min ago`
                    : cleared
                      ? `${next.vehicle.callsign} is coming`
                      : `${next.vehicle.callsign} is closest`}
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

          <TripCard
            from={stop.name}
            to={stopName(state, myParty.destinationId)}
            riders={myParty.partySize}
          />

          {fleet.length > 1 && (
            <>
              <h2 className="sb-brand mt-6 mb-1 text-lg">All shuttles</h2>
              <ul>
                {fleet.map((row) => (
                  <li
                    key={row.vehicle.id}
                    className={`sb-row cursor-default ${row.vehicle.presence === "lost" ? "opacity-50" : ""}`}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black">
                      <BoltGlyph size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.vehicle.callsign}</span>
                      <span className="block truncate text-sm text-ink-soft">
                        {row.vehicle.presence !== "live"
                          ? `Last seen ${row.vehicle.lastSeenMin} min ago`
                          : row.comingHere
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
                disabled={riders <= 1}
                onClick={() => setPartySize(Math.max(1, riders - 1))}
              >
                −
              </button>
              <span className="sb-brand w-10 text-center text-2xl tabular-nums">{riders}</span>
              <button
                type="button"
                aria-label="More riders"
                className="sb-icon-btn text-xl font-semibold"
                disabled={riders >= maxRiders}
                onClick={() => setPartySize(Math.min(maxRiders, riders + 1))}
              >
                +
              </button>
            </div>
          </div>
          {riders >= maxRiders && maxRiders < MAX_PARTY && (
            <p className="mt-2 text-right text-sm text-ink-soft">Max {maxRiders} per shuttle</p>
          )}

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

function TripCard({ from, to, riders }: { from: string; to: string; riders: number }) {
  return (
    <div className="mt-5 flex gap-3 rounded-xl bg-foam p-3.5">
      <TripDots />
      <div className="min-w-0 flex-1 space-y-4">
        <p className="truncate font-semibold">{from}</p>
        <p className="truncate font-semibold">{to}</p>
      </div>
      <span className="flex items-center gap-1 self-center text-sm font-semibold">
        <UsersIcon size={16} />
        {riders}
      </span>
    </div>
  );
}
