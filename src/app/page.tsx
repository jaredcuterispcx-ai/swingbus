import Link from "next/link";

export default function HomePage() {
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
            Request a seat. Track the shuttle. Dispatch like a live network —
            electrical precision, zero radio desk.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/passenger" className="sb-btn sb-btn-accent">
              Ride
            </Link>
            <Link href="/driver" className="sb-btn sb-btn-primary">
              Drive
            </Link>
          </div>
        </div>
      </section>

      <nav className="grid gap-2.5">
        <Link href="/passenger" className="sb-mode-row sb-rise sb-rise-delay-1">
          <div>
            <p className="sb-chip mb-1">01</p>
            <h2 className="sb-brand text-xl">Passenger</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Scan a stand · set seats · destination
            </p>
          </div>
          <span className="text-leaf">→</span>
        </Link>

        <Link href="/driver" className="sb-mode-row sb-rise sb-rise-delay-2">
          <div>
            <p className="sb-chip mb-1">02</p>
            <h2 className="sb-brand text-xl">Driver</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Callsign · GPS · board against seat tape
            </p>
          </div>
          <span className="text-leaf">→</span>
        </Link>

        <Link href="/dispatch" className="sb-mode-row sb-rise sb-rise-delay-3">
          <div>
            <p className="sb-chip mb-1">03</p>
            <h2 className="sb-brand text-xl">Ground control</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Fleet capacity · clearances · live board
            </p>
          </div>
          <span className="text-leaf">→</span>
        </Link>
      </nav>

      <p className="sb-rise sb-rise-delay-3 mt-7 text-center font-mono text-[11px] tracking-wide text-ink-soft/70 uppercase">
        <Link href="/stops" className="text-leaf">
          Stand QR
        </Link>
        <span className="mx-2 opacity-40">·</span>
        <Link href="/deploy">Deploy</Link>
      </p>
    </main>
  );
}
