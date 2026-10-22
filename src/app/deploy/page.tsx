import Link from "next/link";

export default function DeployPage() {
  return (
    <main className="sb-shell !max-w-[720px]">
      <div className="mb-6">
        <Link href="/" className="text-sm text-ink-soft/80">
          ← Swing Bus
        </Link>
      </div>
      <header className="sb-rise mb-6">
        <h1 className="sb-brand text-4xl">Phone access</h1>
        <p className="mt-2 text-ink-soft/85">
          Run Swing Bus on an xAI-internal / Tailscale host, then Funnel it so
          personal phones do not need Tailscale.
        </p>
      </header>

      <section className="sb-panel sb-rise space-y-3 text-sm leading-relaxed text-ink-soft/90">
        <p className="font-semibold text-ink">On any internal host</p>
        <pre className="overflow-x-auto rounded-xl bg-ink px-3 py-3 text-xs text-foam">
{`npm ci && npm run build && npm start
# or: docker compose up --build

tailscale funnel 43127    # Docker image: port 3000
# → https://<device>.<tailnet>.ts.net`}
        </pre>
        <p>
          Open that URL on a personal phone (cellular OK). Print QRs from{" "}
          <Link href="/stops" className="underline decoration-leaf/50">
            /stops
          </Link>{" "}
          while using the Funnel hostname so codes point at the public origin.
        </p>
        <p>
          Use <code className="rounded bg-mist/40 px-1">tailscale serve</code>{" "}
          only for corp laptops already on Tailscale — it will not reach personal
          phones.
        </p>
        <p className="text-xs text-ink-soft/60">
          Full options (k8s ingress, Cloudflare Tunnel, infra ask): see DEPLOY.md
          in the repo.
        </p>
      </section>
    </main>
  );
}
