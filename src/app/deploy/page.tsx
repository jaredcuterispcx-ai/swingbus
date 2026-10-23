import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function DeployPage() {
  return (
    <main className="sb-shell">
      <AppHeader title="Phone access" />
      <section className="sb-panel sb-rise space-y-3 text-sm leading-relaxed text-ink-soft">
        <p>
          Phones open swingbus at its public{" "}
          <span className="font-semibold text-ink">https://</span> address. Driver GPS
          needs HTTPS.
        </p>
        <p>
          Print stop QR codes from{" "}
          <Link href="/stops" className="font-semibold text-ink underline">
            /stops
          </Link>{" "}
          on that address, or set{" "}
          <span className="font-mono text-xs text-ink">PUBLIC_URL</span>.
        </p>
        <p className="text-xs text-ink-soft/60">Hosting notes: DEPLOY.md in the repo.</p>
      </section>
    </main>
  );
}
