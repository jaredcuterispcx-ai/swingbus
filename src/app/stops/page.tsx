"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/use-app-state";

export default function StopsPage() {
  const { state, loading, error } = useAppState(10000);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <main className="sb-shell !max-w-[900px]">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-soft/80">
          ← Swing Bus
        </Link>
        <span className="text-xs font-medium tracking-wide text-leaf uppercase">
          Print & post
        </span>
      </div>

      <header className="sb-rise mb-6">
        <h1 className="sb-brand text-4xl">Stop QR codes</h1>
        <p className="mt-2 max-w-xl text-ink-soft/85">
          Tape one at each curb. Passengers scan on personal phones and join the
          queue — no app install.
        </p>
      </header>

      {loading && <p className="text-sm text-ink-soft/70">Loading stops…</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(state?.stops ?? []).map((stop, i) => {
          const url = origin ? `${origin}/passenger/${stop.id}` : "";
          return (
            <article
              key={stop.id}
              className={`sb-panel sb-rise flex flex-col items-center text-center sb-rise-delay-${Math.min(i, 3)}`}
            >
              <p className="text-xs font-semibold tracking-[0.18em] text-leaf uppercase">
                {stop.shortCode}
              </p>
              <h2 className="sb-brand mt-1 text-2xl">{stop.name}</h2>
              <p className="mt-1 mb-4 text-xs text-ink-soft/70">{stop.description}</p>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                {url ? (
                  <QRCodeSVG value={url} size={148} bgColor="#ffffff" fgColor="#0c1f1a" />
                ) : (
                  <div className="h-[148px] w-[148px] animate-pulse rounded bg-mist/40" />
                )}
              </div>
              <p className="mt-3 break-all font-mono text-[10px] text-ink-soft/60">
                {url || "…"}
              </p>
              <Link
                href={`/passenger/${stop.id}`}
                className="sb-btn sb-btn-ghost mt-3 w-full text-sm"
              >
                Open passenger link
              </Link>
            </article>
          );
        })}
      </div>
    </main>
  );
}
