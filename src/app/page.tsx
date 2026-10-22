"use client";

import Link from "next/link";
import { useAppState } from "@/lib/use-app-state";

export default function HomePage() {
  const { state, loading } = useAppState(8000);

  return (
    <main className="sb-shell">
      <section className="sb-hero sb-rise mb-5">
        <div className="relative z-[1]">
          <div className="mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/xsi-mark.svg"
              alt="XSI"
              width={48}
              height={48}
              className="rounded-[14px]"
            />
            <div>
              <p className="sb-chip">XSI · mobility</p>
              <p className="sb-brand text-2xl leading-none tracking-tight">XSI</p>
            </div>
          </div>

          <h1 className="sb-brand text-[2.75rem] leading-[0.95] tracking-tight sm:text-5xl">
            Swing Bus
          </h1>
          <p className="mt-3 max-w-[20rem] text-[0.98rem] leading-relaxed text-ink-soft">
            Pick your stop, set your destination, see which shuttle is coming
            next.
          </p>
        </div>
      </section>

      <section className="sb-rise sb-rise-delay-1 mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="sb-brand text-lg">Where are you?</h2>
          <Link href="/stops" className="font-mono text-[11px] text-leaf uppercase">
            Scan QR
          </Link>
        </div>
        {loading && (
          <p className="text-sm text-ink-soft">Loading stops…</p>
        )}
        <div className="grid gap-2">
          {(state?.stops ?? []).map((stop) => (
            <Link
              key={stop.id}
              href={`/passenger/${stop.id}`}
              className="sb-mode-row"
            >
              <div>
                <p className="sb-chip mb-0.5">{stop.shortCode}</p>
                <p className="sb-brand text-xl">{stop.name}</p>
                <p className="text-sm text-ink-soft">{stop.description}</p>
              </div>
              <span className="text-leaf">→</span>
            </Link>
          ))}
        </div>
      </section>

      <Link
        href="/driver"
        className="sb-btn sb-btn-ghost sb-rise sb-rise-delay-2 w-full"
      >
        I&apos;m driving
      </Link>

      <p className="mt-5 text-center font-mono text-[11px] tracking-wide text-ink-soft/60 uppercase">
        <Link href="/dispatch">Ground control</Link>
      </p>
    </main>
  );
}
