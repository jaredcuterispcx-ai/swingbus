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

Offsite-only stops take ride requests only during offsite service hours, 5–10 AM and 5–10 PM Memphis time; onsite and "both" stops run 24/7. Hours live in `src/lib/service-hours.ts`. Drivers pick onsite or offsite when they start a session, and ground control only clears a shuttle for trips its service runs.

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
npm test             # service-hours tests (Node ≥ 22.18)
```

## Production

The `Dockerfile` builds the Next.js standalone server (Node 22, multi-stage) and runs `node server.js` as uid 1000 (`node`), listening on `HOSTNAME:PORT` (`0.0.0.0:3000`). No secrets are baked in.

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
| `DATA_DIR` | `/data` in the image, `./data` otherwise | Directory that holds `store.json` and its daily copies. |
| `BACKUP_DAYS` | `14` | Daily copies of `store.json` to keep (`store.json.YYYY-MM-DD`, UTC date). `0` turns them off. |
| `PORT` | `3000` in the image | Listen port. |
| `HOSTNAME` | `0.0.0.0` in the image | Bind address. Kubernetes overwrites it with the pod name, so set `HOSTNAME=0.0.0.0` in the pod spec. |

Production means any `next build` output: `npm start`, `node server.js`, the image. It exits at boot with `Refusing to start in production: …` unless the three secrets are set and the passwords aren't the public defaults; sign-in and sessions are refused as well. Only `npm run dev` uses the defaults.

**Volume.** Mount a persistent volume as a directory at `/data` (or wherever `DATA_DIR` points), writable by uid 1000. Don't mount `store.json` as a single file: each write goes to a temp file in the same directory and is renamed over `store.json`, which can't replace a separately mounted file (`/api/health` reports it). `store.json` holds stops (including admin edits), riders, and shuttles, and a crash mid-write leaves the previous version intact. A missing file starts from the built-in stops. An unreadable file is never overwritten: requests fail and `/api/health` returns 503 until it's repaired or moved aside (moving it aside reseeds the built-in stops).

**Backups.** At boot and then hourly, the app copies `store.json` to `store.json.YYYY-MM-DD` (UTC date) in the same directory, once a day, and keeps the newest `BACKUP_DAYS` (14). A store that doesn't parse is never copied. To restore, stop the app, copy a dated file over `store.json`, and start it again. The copies share the volume, so they cover a bad edit or an accidental "Restore defaults", not a lost volume: snapshot the volume as well if the platform can.

**One process.** State is one file behind an in-process write lock, so swingbus must run as exactly one process. That rules out horizontal scaling (more than one replica), serverless platforms, and multi-process managers. Stop the old instance before starting its replacement.

**Health.** `GET /api/health` (public, read-only) returns 200 `{"status":"ok","store":"ok",…}` when the secrets are set, `DATA_DIR` is writable, and `store.json` parses or doesn't exist yet (`"store":"new"`); otherwise 503. `"store":"new"` after a restart means the volume didn't persist. Point readiness and liveness probes at it; the image's `HEALTHCHECK` uses it.

**Without Docker** (same rules; port 43127, data in `./data` unless `DATA_DIR` is set):

```bash
npm ci && npm run build
DRIVER_PASSWORD='…' ADMIN_PASSWORD='…' AUTH_SECRET='…' npm start
```

`docker compose up --build` runs the image on port 3000 with a named volume; it reads the three secrets (and `PUBLIC_URL`, if set) from your shell or a gitignored `.env`.

Hosting rules for any platform (one process, public HTTPS, no tunnels): [DEPLOY.md](DEPLOY.md).

## API

- `GET /api/state` — parties, vehicles (+ `seats` ledger), clearances, per-stop `serviceStatus` (open, `opensAt`, `closesAt`)  
- `POST /api/parties` — passenger seat request  
- `POST|PATCH /api/vehicles` — register, GPS, accept clearance  
- `POST /api/board` — board / alight against the ledger  
- `GET /api/dispatch` — ground-control snapshot  
- `GET /api/health` — container health (200 / 503)  

Legacy aliases: `/api/requests`, `/api/drivers`, `/api/pickups`.
