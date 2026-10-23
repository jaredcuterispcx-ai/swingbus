# swingbus

Airport-style **ground control** for XSI / MEM campus shuttles (Macroharder + offsite lots). Passengers request **seats** at a stand; vehicles publish **capacity**; the board holds seats via **clearances** and routes the nearest bus with free capacity — like a tower for buses.

Stops start from the MEM shuttle sheet (`src/lib/stops.ts`) and are then managed at `/admin`: rename, move (including "use my current location" while standing at the curb), add, or delete stops. Edits persist in `store.json` under `DATA_DIR` (default `./data`).

## Passwords

| Area | Dev default (`npm run dev` only) | Env var |
|------|------------------|--------------|
| `/driver` (+ driver APIs) | `swingbus-driver` | `DRIVER_PASSWORD` |
| `/dispatch`, `/admin` (+ stop/demo APIs) | `swingbus-admin` | `ADMIN_PASSWORD` |
| Session signing | derived | `AUTH_SECRET` |

The repo is public, so these defaults are too: production refuses to start without all three env vars (see [Production](#production)). The admin password also opens the driver page. Sessions are signed, http-only cookies that last 30 days; changing either password or `AUTH_SECRET` signs everyone out. Passenger pages and `GET /api/state` stay public.

Drivers' phones snap to a stop when they're inside its arrival radius (75 m by default, adjustable per stop in admin); the pickup stop auto-fills and stop lists sort nearest-first.

See [docs/GROUND-CONTROL.md](docs/GROUND-CONTROL.md) for the seat ledger and lifecycles.

## Modes

| Mode | Path |
|------|------|
| Passenger | `/passenger`, `/passenger/[stopId]` |
| Driver / vehicle | `/driver` |
| Ground control | `/dispatch` |
| Stand QR sheet | `/stops` |
| Stop admin | `/admin` |
| Phone deploy cheat-sheet | `/deploy` |

## Seat math (drivers)

```
available = capacity − occupied − reserved
```

- **occupied** — onboard now  
- **reserved** — held by issued clearances not yet boarded  
- **available** — what ground control may still assign  

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:43127
```

## Production

The `Dockerfile` builds the Next.js standalone server (Node 24, multi-stage) and runs it as uid 1000 (`node`), listening on `$PORT`.

```bash
docker build -t swingbus .
docker run -d --name swingbus -p 3000:3000 -v swingbus-data:/data \
  -e DRIVER_PASSWORD='…' -e ADMIN_PASSWORD='…' -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e PUBLIC_URL=https://swingbus.example.com \
  swingbus
curl http://localhost:3000/api/health   # {"status":"ok",...}
```

| Env var | Default | Notes |
|---------|---------|-------|
| `DRIVER_PASSWORD` | `swingbus-driver` in dev | **Required in production.** |
| `ADMIN_PASSWORD` | `swingbus-admin` in dev | **Required in production.** Must differ from the driver password. |
| `AUTH_SECRET` | derived in dev | **Required in production**, 32+ characters (`openssl rand -base64 32`). Signs session cookies. |
| `PUBLIC_URL` | unset | Optional. Address printed QR codes point to, e.g. `https://swingbus.example.com`. Unset: the address ground control was opened at (`X-Forwarded-Host` / `X-Forwarded-Proto` first). Localhost is never used. |
| `DATA_DIR` | `/data` in the image, `./data` otherwise | Directory that holds `store.json`. |
| `PORT` | `3000` in the image | The image always binds `0.0.0.0`. |

Production means any `next build` output: `npm start`, `node server.js`, the image. It exits at boot with `Refusing to start in production: …` unless the three secrets are set and the passwords aren't the public defaults; sign-in and sessions are refused as well. Only `npm run dev` uses the defaults.

**Volume.** Mount persistent storage at `/data` (or wherever `DATA_DIR` points), writable by uid 1000. `store.json` holds stops (including admin edits), riders, and shuttles. Each write goes to a temp file that is then renamed over `store.json`, so a crash mid-write leaves the previous version intact. A missing file starts from the built-in stops. An unreadable file is never overwritten: requests fail and `/api/health` returns 503 until it's repaired or moved aside (moving it aside reseeds the built-in stops). State is a single file: run one instance, and stop the old one before starting its replacement.

**Health.** `GET /api/health` (public) returns 200 `{"status":"ok",…}` when the store loads, `DATA_DIR` is writable and the secrets are set; otherwise 503. The image's `HEALTHCHECK` uses it.

**Without Docker** (same rules; port 43127, data in `./data` unless `DATA_DIR` is set):

```bash
npm ci && npm run build
DRIVER_PASSWORD='…' ADMIN_PASSWORD='…' AUTH_SECRET='…' npm start
```

`docker compose up --build` runs the image on port 3000 with a named volume; it reads the three secrets (and `PUBLIC_URL`, if set) from your shell or a gitignored `.env`.

## Personal phones without Tailscale (xAI network host)

Run on an internal / Tailscale host, then:

```bash
./scripts/expose-funnel.sh 43127
# → https://<device>.<tailnet>.ts.net
```

That Funnel URL works on cellular. Print QRs from `/stops` **on that hostname**. Details: `DEPLOY.md`.

> This Cursor cloud VM can demo the UI locally. It cannot join corp Tailscale or enable Funnel — do that on an xAI host (desk NUC, lab VM, etc.).

## API

- `GET /api/state` — parties, vehicles (+ `seats` ledger), clearances  
- `POST /api/parties` — passenger seat request  
- `POST|PATCH /api/vehicles` — register, GPS, accept clearance  
- `POST /api/board` — board / alight against the ledger  
- `GET /api/dispatch` — ground-control snapshot  
- `GET /api/health` — container health (200 / 503)  

Legacy aliases: `/api/requests`, `/api/drivers`, `/api/pickups`.
