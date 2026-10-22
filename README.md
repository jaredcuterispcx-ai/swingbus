# Swing Bus

Mobile-first shuttle dispatch for **XSI** employees and drivers. Passengers scan a stop QR, request a ride with party size and destination. Drivers label their shuttle, share GPS, and log pickups. A greedy dispatcher keeps people-per-stop counts and routes the nearest shuttle with free seats — no human radio desk required.

## Modes

| Mode | Path | Who |
|------|------|-----|
| Passenger | `/passenger` or `/passenger/[stopId]` | Employees on personal phones |
| Driver | `/driver` | Shuttle drivers |
| Dispatch board | `/dispatch` | Ops / anyone watching the system |
| Stop QR sheet | `/stops` | Print and tape at each curb |

## Quick start (local / Cursor)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

Production-style:

```bash
npm run build
npm start
```

State persists in `data/store.json` (created automatically). Use **Reset demo** on the dispatch board to clear queues.

## Proof-of-concept flow

1. Open `/stops` and open a passenger link (or scan a QR once hosted).
2. Request a ride with party size + destination.
3. On another phone/browser, open `/driver`, label a shuttle, allow GPS.
4. Watch `/dispatch` assign the nearest driver; confirm the pickup in driver mode.

## Deploy: internal host, personal phones (no Tailscale on the phone)

**Recommended POC path for xAI-style Tailscale networks: Tailscale Funnel.**

- Run Swing Bus on a machine that **is** on the xAI internal / Tailscale network (office mini PC, internal VM, or bastion).
- Expose it to the **public internet** with Funnel so personal phones do **not** need Tailscale installed:

```bash
npm run build && npm start
# on the same host (Funnel must be enabled in the Tailscale admin console):
tailscale funnel 43127
```

Share the printed `https://<device>.<tailnet>.ts.net` URL. Put that origin into stop QR codes (`/stops` generates QRs from the current hostname).

| Goal | Tool |
|------|------|
| Only people on Tailscale | `tailscale serve 43127` |
| Anyone with the link (personal phones, no Tailscale) | `tailscale funnel 43127` |

Longer-term: same Docker image behind an internal Kubernetes Service plus a **public ingress / gateway** approved by xAI networking (or keep Funnel on a tagged production node). See `DEPLOY.md` for Dockerfile, compose, and architecture notes.

> This Cursor cloud session can run the POC for you to click through. It cannot join your corp Tailscale or provision xAI cluster ingress — that step is on your network/admin side using Funnel or an approved public gateway.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- File-backed store (`data/store.json`) — fine for POC; swap for Postgres later
- Client GPS via browser Geolocation API
- Dispatch: wait-time × demand scoring + nearest driver with capacity (haversine)

## API sketch

- `GET /api/state` — full snapshot + live suggestions
- `POST /api/requests` — passenger queue join
- `POST /api/drivers` / `PATCH /api/drivers` — register, GPS, on/off duty
- `POST /api/pickups` — confirm pickup or drop-off
- `GET /api/dispatch` — board-focused snapshot
