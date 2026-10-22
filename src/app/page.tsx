import Link from "next/link";

export default function HomePage() {
  return (
    <main className="sb-shell">
      <header className="sb-rise mb-8 pt-6">
        <p className="mb-2 text-sm font-medium tracking-[0.18em] text-leaf uppercase">
          XSI ground transport
        </p>
        <h1 className="sb-brand text-5xl leading-[0.95] text-ink sm:text-6xl">
          Swing Bus
        </h1>
        <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed text-ink-soft/90">
          Airport-style ground control for campus shuttles — seat demand at every
          stand, live vehicle seat tape, automatic clearances. No radio desk.
        </p>
      </header>

      <div className="grid gap-3">
        <Link
          href="/passenger"
          className="sb-panel sb-rise sb-rise-delay-1 block transition hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="sb-brand text-2xl">Passenger</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft/85">
                Scan a stand QR, request seats by party size and destination.
              </p>
            </div>
            <span className="mt-1 text-leaf">→</span>
          </div>
        </Link>

        <Link
          href="/driver"
          className="sb-panel sb-rise sb-rise-delay-2 block transition hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="sb-brand text-2xl">Driver / vehicle</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft/85">
                Publish callsign + capacity, share GPS, accept clearances, board
                and alight against the seat ledger.
              </p>
            </div>
            <span className="mt-1 text-leaf">→</span>
          </div>
        </Link>

        <Link
          href="/dispatch"
          className="sb-panel sb-rise sb-rise-delay-3 block transition hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="sb-brand text-2xl">Ground control</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft/85">
                Fleet seat tape, stand demand, and issued clearances — like a
                tower for buses.
              </p>
            </div>
            <span className="mt-1 text-leaf">→</span>
          </div>
        </Link>
      </div>

      <p className="sb-rise sb-rise-delay-3 mt-8 text-center text-sm text-ink-soft/70">
        Printable stand QRs on{" "}
        <Link href="/stops" className="underline decoration-leaf/50 underline-offset-2">
          /stops
        </Link>
        . Phone access without Tailscale:{" "}
        <Link href="/deploy" className="underline decoration-leaf/50 underline-offset-2">
          Funnel deploy
        </Link>
        .
      </p>
    </main>
  );
}
