"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BoltGlyph, Wordmark } from "@/components/brand";
import { ChevronIcon, PinIcon, SearchIcon } from "@/components/icons";
import { MiniMap } from "@/components/mini-map";
import { nextShuttleForStop } from "@/lib/fleet";
import { opensLabel, statusOf } from "@/lib/service-hours";
import { useAppState } from "@/lib/use-app-state";

export default function HomePage() {
  const { state, loading, error } = useAppState(8000);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    return state.stops
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.shortCode.toLowerCase() === q)
      .map((stop) => ({ stop, next: nextShuttleForStop(state, stop.id) }));
  }, [state, query]);
  const offered = rows.filter(({ stop }) => statusOf(state, stop.id).open);
  const closed = rows.filter(({ stop }) => !statusOf(state, stop.id).open);

  const online = state?.vehicles.filter((v) => v.active && v.presence !== "lost").length ?? 0;

  return (
    <main className="sb-shell">
      <header className="mb-4 flex min-h-12 items-center justify-between">
        <Wordmark size={30} />
        <Link href="/driver" className="sb-pill">
          Drive
        </Link>
      </header>

      <div className="relative mb-5">
        <MiniMap
          stops={state?.stops ?? []}
          vehicles={(state?.vehicles ?? [])
            .filter((v) => v.active)
            .map((v) => ({ ...v, faded: v.presence !== "live" }))}
          height={190}
        />
        <span className="sb-pill sb-pill-dark absolute bottom-3 left-3 text-xs">
          <BoltGlyph size={12} />
          {online} online
        </span>
      </div>

      <h1 className="sb-brand mb-3 text-3xl">Where are you?</h1>

      <label className="relative mb-2 block">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
          <SearchIcon />
        </span>
        <input
          className="sb-input pl-11"
          placeholder="Search stops"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
      </label>

      {loading && <p className="py-4 text-sm text-ink-soft">Loading…</p>}
      {error && <p className="py-4 text-sm text-danger">{error}</p>}

      <ul>
        {offered.map(({ stop, next }) => (
          <li key={stop.id}>
            <Link href={`/passenger/${stop.id}`} className="sb-row">
              <span className="sb-icon-btn size-10">
                <PinIcon />
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{stop.name}</span>
              {next?.etaMinutes != null && (
                <span className="text-sm font-semibold tabular-nums">{next.etaMinutes} min</span>
              )}
              <span className="text-ink-soft">
                <ChevronIcon />
              </span>
            </Link>
          </li>
        ))}
        {closed.map(({ stop }) => (
          <li key={stop.id}>
            <div className="sb-row sb-row-off" aria-disabled="true">
              <span className="sb-icon-btn size-10">
                <PinIcon />
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{stop.name}</span>
              <span className="shrink-0 text-sm font-semibold">
                {opensLabel(statusOf(state, stop.id))}
              </span>
            </div>
          </li>
        ))}
        {state && rows.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-soft">No stops match “{query}”</li>
        )}
      </ul>

      <nav className="mt-6 flex justify-center gap-4 text-xs font-medium text-ink-soft">
        <Link href="/dispatch" className="px-2 py-2">
          Ground control
        </Link>
        <Link href="/admin" className="px-2 py-2">
          Admin
        </Link>
      </nav>
    </main>
  );
}
