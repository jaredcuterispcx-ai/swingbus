# Deploying swingbus

swingbus runs as one container built from the `Dockerfile` (env vars and examples: README → Production). This file is the host-agnostic contract. The xAI hosting plan (cluster, hostname, secrets, DNS) is kept outside this public repo, so don't add host-specific config here.

## Runtime contract

Keep these identical in this image and in the production deploy image:

| | |
|---|---|
| Command | `node server.js` (Next.js standalone) as a non-root user (uid 1000 in this image) |
| Listen | `HOSTNAME=0.0.0.0`, `PORT=3000`. Kubernetes overwrites `HOSTNAME` with the pod name, so set `HOSTNAME=0.0.0.0` in the pod env |
| Data | `DATA_DIR=/data`: a persistent volume mounted as a directory, writable by the container user (`fsGroup` on Kubernetes). It holds `store.json` and its daily copies. Never mount `store.json` on its own: writes rename a temp file over it |
| Health | `GET /api/health`: 200 or 503, read-only. Point readiness and liveness probes at it |
| Secrets | `DRIVER_PASSWORD`, `ADMIN_PASSWORD`, `AUTH_SECRET` from the platform's secret store, never baked into the image. Production refuses to start without them |
| Optional | `PUBLIC_URL`, the address printed QR codes point to; `BACKUP_DAYS`, daily copies to keep (default 14, `0` turns them off) |
| Runtime | Node 22 |

## Rules for any host

- **Exactly one process.** State is one file behind an in-process write lock, so a second process on the same data loses writes. That rules out horizontal scaling (keep one replica, replaced stop-then-start: Kubernetes `strategy: Recreate`), serverless platforms, and multi-process managers.
- **Public HTTPS.** Passengers open it from QR codes on their own phones, and browsers allow driver GPS only over HTTPS. Terminate TLS at the edge and forward `X-Forwarded-Proto` and `X-Forwarded-Host`, so session cookies are marked `Secure` and QR codes use the public address.
- **No Tailscale Funnel or ad-hoc tunnels.** Expose it only through the platform's approved ingress.
- **No outbound network.** Fonts are bundled and the map is an SVG, so all egress except DNS can be denied.
- **Keep Next.js patched.** The driver and admin password gates live in middleware.
- **Snapshot the volume** if the platform can. The app's daily copies (`store.json.YYYY-MM-DD`, newest `BACKUP_DAYS`) sit on the same volume, so they cover a bad edit or an accidental "Restore defaults" but not a lost volume.

## Local and smoke runs

```bash
docker build -t swingbus .
docker run --rm -p 3000:3000 -v swingbus-data:/data \
  -e DRIVER_PASSWORD=… -e ADMIN_PASSWORD=… -e AUTH_SECRET="$(openssl rand -hex 32)" swingbus
curl http://localhost:3000/api/health

docker compose up --build   # same image; secrets from your shell or a gitignored .env
```
