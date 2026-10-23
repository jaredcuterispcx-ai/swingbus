import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function DeployPage() {
  return (
    <main className="sb-shell !max-w-[720px]">
      <AppHeader title="Phone access" />
      <header className="sb-rise mb-6">
        <p className="mt-2 text-ink-soft">
          Run on an xAI Tailscale host, Funnel it — personal phones need no
          Tailscale app.
        </p>
      </header>

      <section className="sb-panel sb-rise space-y-3 text-sm leading-relaxed text-ink-soft">
        <p className="font-semibold text-ink">On any internal host</p>
        <pre className="overflow-x-auto rounded-xl bg-black/50 px-3 py-3 font-mono text-xs text-leaf">
{`npm ci && npm run build && npm start
./scripts/expose-funnel.sh 43127
# → https://<device>.<tailnet>.ts.net`}
        </pre>
        <p>
          Print QRs from{" "}
          <Link href="/stops" className="text-leaf">
            /stops
          </Link>{" "}
          on that Funnel hostname.
        </p>
        <p className="text-xs text-ink-soft/60">
          Full options: DEPLOY.md in the repo.
        </p>
      </section>
    </main>
  );
}
