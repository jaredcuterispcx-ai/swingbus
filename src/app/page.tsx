import Link from "next/link";

export default function HomePage() {
  return (
    <main className="sb-shell">
      <header className="sb-rise mb-8 pt-6">
        <p className="mb-2 text-sm font-medium tracking-[0.18em] text-leaf uppercase">
          XSI campus transit
        </p>
        <h1 className="sb-brand text-5xl leading-[0.95] text-ink sm:text-6xl">
          Swing Bus
        </h1>
        <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed text-ink-soft/90">
          Replace radio dispatch with live stop demand, GPS-aware shuttles, and
          automatic pickup routing — from anyone&apos;s phone.
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
                Scan a stop QR, set party size and destination. We queue you for
                the next efficient shuttle.
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
              <h2 className="sb-brand text-2xl">Driver</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft/85">
                Label your shuttle, share live location, follow dispatch
                suggestions, and log who you pick up.
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
              <h2 className="sb-brand text-2xl">Dispatch board</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft/85">
                Live people-per-stop counts and intelligent route suggestions —
                no human dispatcher required.
              </p>
            </div>
            <span className="mt-1 text-leaf">→</span>
          </div>
        </Link>
      </div>

      <p className="sb-rise sb-rise-delay-3 mt-8 text-center text-sm text-ink-soft/70">
        Printable stop QR codes live on{" "}
        <Link href="/stops" className="underline decoration-leaf/50 underline-offset-2">
          /stops
        </Link>
        .
      </p>
    </main>
  );
}
