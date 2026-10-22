# Swing Bus — deployment guide

Next.js 15 app for xAI employees. Goals:

1. **Lasting home** runs on **xAI internal infrastructure** (not a random public PaaS).
2. **Personal phones** must reach it **without Tailscale**.
3. Ship a **POC ASAP**, then migrate to the lasting home.

Artifacts in this repo: `Dockerfile` (standalone), `docker-compose.yml`, `next.config.ts` (`output: "standalone"`).

---

## What we found in this environment

This Cursor cloud agent has **no xAI prod kubeconfig, registry push credentials, or DNS admin**. Skills under `~/.cursor/skills-*` cover Cursor/BDK hosting only — not mouseion / int-x.ai app deploy.

The agent egress allowlist **does** mention patterns that match an xAI-like corp network (useful as naming/architecture clues, not as deploy access):

| Pattern | Likely meaning |
| --- | --- |
| `*.svc.int-x.ai` (e.g. `grafana.svc.int-x.ai`) | Internal service DNS on the corp cluster |
| `*.mouseion.dev`, `artifact-registry.mouseion.dev`, `*.gcp.mouseion.dev` | GCP / “mouseion” platform + artifact registry |
| `*.teachx.ai`, `*.xai-edu.com` | Product / education public-ish hostnames |
| `auth.x.ai`, `accounts.x.ai`, `*.okta.com` | Employee identity |
| `tunnel.cloudproxy.app`, `*.cloudflare.com` | Cloudflare Tunnel path is network-plausible |
| `*.tailscale.com` | Tailscale exists for corp devices — **not** for personal phones in this design |

Treat the table as **hints for where to ask infra**, not as proof of an existing Swing Bus service.

---

## Recommended architecture (target)

```
Personal phone (cellular / home Wi‑Fi)
        │  HTTPS to public hostname (no Tailscale)
        ▼
Public edge (corp ingress or Cloudflare Tunnel hostname)
        │  TLS + optional employee SSO (Okta / auth.x.ai)
        ▼
Internal network (mouseion / int-x.ai / cluster)
        │
        ▼
Swing Bus pod/container  ←── image from internal registry
        (this Dockerfile, port 3000)
```

**Core idea:** the **process** lives on internal infra; a **controlled public URL** is the phone path. Do not require Tailscale on personal devices.

---

## Options ranked (xAI-like corp network)

### 1) Internal k8s + public ingress / gateway (best lasting home)

- Build/push image to the corp registry (e.g. mouseion artifact registry).
- Deploy Deployment + Service on the internal cluster (`*.svc.int-x.ai`-style mesh).
- Expose via the **approved public ingress** (hostname under something employees already trust: `*.teachx.ai`, a dedicated `swing-bus.…` name, or whatever platform eng assigns).
- Optional: put Okta / `auth.x.ai` in front for employee-only access; allowlist or SSO so personal phones work after login.
- QR codes on shuttle signage → `https://<public-hostname>/`.

**Pros:** Matches “hosted from internal network,” durable, observable next to `grafana.svc.int-x.ai`-class services.  
**Cons:** Needs platform/SRE: namespace, registry auth, ingress, certs, DNS. **This agent cannot do those steps.**

### 2) Cloudflare Tunnel (`cloudflared`) from an internal host (best POC→prod bridge)

- Run the container on an **internal** VM/pod (docker compose or k8s).
- Run `cloudflared` on that same network path; map a Cloudflare hostname → `http://localhost:3000` (or the Service).
- Phones hit the Cloudflare hostname over the public internet; traffic lands inside the corp network. No Tailscale on the phone.
- Later: keep the same public hostname and move the origin from a VM to k8s.

**Pros:** Fast, no inbound firewall holes, phones work immediately, still “runs inside.”  
**Cons:** Needs a Cloudflare account/zone the company owns (or an approved tunnel token from infra). Agent cannot mint corp tunnel credentials.

### 3) Reverse proxy + optional SSO on an existing edge

- Same container; nginx/Envoy/oauth2-proxy (or corp API gateway) terminates TLS and optionally enforces Okta.
- Useful if Swing Bus must sit behind the same SSO as other employee web tools.

**Pros:** Familiar security model.  
**Cons:** Still needs an approved public VIP/hostname from networking.

### 4) Public PaaS only (Vercel, etc.) — **not** the lasting home

- Fine for a throwaway screenshot demo; **conflicts** with constraint (1) as the long-term home.
- If used at all, treat as temporary and plan cutover to (1) or (2).

### 5) Tailscale-only / `*.svc.int-x.ai` only — **rejects phone constraint**

- Great for laptops on corp VPN/tailnet; **fails** “personal phones not on Tailscale.”
- Keep internal DNS for operators; do not make it the only URL you print on a QR code.

---

## POC today (ASAP) vs lasting home

### A. POC today — Cursor cloud agent / temporary public tunnel

Use when you need a URL on phones **this afternoon**.

1. In this workspace:
   ```bash
   npm ci
   npm run build
   npm run start
   # or: docker compose up --build
   ```
2. Expose port 3000 with a **temporary** public tunnel from a machine that can reach the process:
   - Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`) → `*.trycloudflare.com`
   - or another approved ephemeral tunnel
3. Put that HTTPS URL in a QR code; open on a personal phone (no Tailscale).

**Limits:** Cursor cloud VMs are ephemeral, egress-restricted, and **not** xAI prod. This path proves UX only. Do not treat the tunnel URL as the employee-facing production host.

### B. Lasting home — xAI internal

1. Hand platform/SRE: this `Dockerfile`, desired hostname, SSO yes/no, expected load.
2. They: registry push, deploy, public ingress or approved `cloudflared` token, DNS, certs.
3. You: point QR codes at the stable public hostname; keep `*.svc.int-x.ai` as the internal-only name if useful for debugging.

**Suggested ask to infra (copy/paste):**

> We need a small Next.js (standalone Docker) app “Swing Bus” running on internal compute (mouseion / int-x.ai cluster preferred), with a **stable HTTPS URL reachable from personal phones without Tailscale**. Prefer corp public ingress or Cloudflare Tunnel to the internal Service. Optional Okta/`auth.x.ai` gate. Image build is in-repo (`Dockerfile`).

---

## Build & run (local / internal host)

```bash
# Docker (preferred parity with prod)
docker compose up --build

# Or native
npm ci
npm run build
npm run start   # listens on 3000; standalone output used by the image
```

Image entrypoint: `node server.js` (Next standalone), `HOSTNAME=0.0.0.0`, `PORT=3000`.

**Build blocker (app code, not deploy files):** as of this writing, `npm run build` fails typechecking in `src/lib/dispatch.ts` (`Property 'remaining' does not exist on type 'never'`). The Dockerfile/`output: "standalone"` path is correct once that app-side error is fixed; do not paper over it in the Docker layer.

---

## What this Cursor agent CANNOT do

| Need | Status |
| --- | --- |
| Push to `artifact-registry.mouseion.dev` (or any corp registry) | No credentials |
| `kubectl` apply to prod / int-x.ai cluster | No kubeconfig |
| Create `*.svc.int-x.ai` or teachx/public DNS | No DNS admin |
| Mint Cloudflare Tunnel tokens / Okta app | No corp IdP/CF admin |
| Guarantee Cursor cloud URL stays up | Ephemeral VM |
| Replace platform review / security sign-off | Human / infra |

## What the user / infra team must do

1. Choose option **1** (k8s + ingress) or **2** (cloudflared) as lasting home.
2. Provision hostname + TLS (+ optional SSO).
3. CI: build this Dockerfile → push internal registry → roll Deployment.
4. Replace POC tunnel URLs on QR codes with the stable public hostname.

---

## Security notes (phones + employee app)

- Prefer SSO (Okta / `auth.x.ai`) if the app shows employee-only data; anonymous public is only for truly non-sensitive POC content.
- Do not embed secrets in the image; use platform env/secrets.
- Personal phones will traverse the public internet to the edge — TLS is mandatory.
- Tailscale remains fine for **operators**; it is not the phone access path.

---

## Quick decision

| If you need… | Do this |
| --- | --- |
| Demo on phones today | `docker compose up --build` + temporary Cloudflare quick tunnel; QR → that URL |
| Employee-facing lasting URL | Infra: internal deploy + public ingress **or** approved cloudflared; QR → stable hostname |
| Debug from corp laptop only | Internal Service DNS is enough — but that alone fails the phone requirement |
