# swingbus

Airport-style **ground control** for XSI / MEM campus shuttles (Macroharder + offsite lots). Passengers request **seats** at a stand; vehicles publish **capacity**; the board holds seats via **clearances** and routes the nearest bus with free capacity — like a tower for buses.

Stops start from the MEM shuttle sheet (`src/lib/stops.ts`) and are then managed at `/admin`: rename, move (including "use my current location" while standing at the curb), add, or delete stops. Edits persist in `data/store.json`.

## Passwords

| Area | Default password | Env override |
|------|------------------|--------------|
| `/driver` (+ driver APIs) | `swingbus-driver` | `DRIVER_PASSWORD` |
| `/dispatch`, `/admin` (+ stop/demo APIs) | `swingbus-admin` | `ADMIN_PASSWORD` |

The admin password also opens the driver page. Sessions are signed, http-only cookies that last 30 days; changing a password (or setting `AUTH_SECRET`) signs everyone out. Passenger pages and `GET /api/state` stay public.

Drivers' phones snap to a stop when they're inside its arrival radius (75 m by default, adjustable per stop in admin); the pickup stop auto-fills and stop lists sort nearest-first.

See [docs/GROUND-CONTROL.md](docs/GROUND-CONTROL.md) for the seat ledger and lifecycles.

## Modes

| Mode | Path |
|------|------|
| Passenger | `/passenger`, `/passenger/[stopId]` |
| Driver / vehicle | `/driver` |
| Ground control | `/dispatch` |
| Printable QR codes (stops, driver) | `/dispatch/qr`, `/dispatch/qr/driver` |
| Stop admin | `/admin` |
| Phone deploy cheat-sheet | `/deploy` |

## QR codes

Ground control → **QR codes** prints one card per stop (four to a page, dashed cut lines) that opens that stop's pickup page, plus a driver code that opens `/driver`. Codes point at the address in the browser's address bar. Set `PUBLIC_URL` (e.g. `https://swingbus.example.com`) to pin them, or type a one-off address in the page's Public URL field. A code holds only that origin plus the page path, never a password or session token. Localhost addresses are refused, since phones can't open them. `/stops` redirects here.

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

```bash
npm run build && npm start
docker compose up --build   # port 3000
```

## Personal phones without Tailscale (xAI network host)

Run on an internal / Tailscale host, then:

```bash
./scripts/expose-funnel.sh 43127
# → https://<device>.<tailnet>.ts.net
```

That Funnel URL works on cellular. Print QR codes from `/dispatch/qr` **on that hostname**, or set `PUBLIC_URL` to it. Details: `DEPLOY.md`.

> This Cursor cloud VM can demo the UI locally. It cannot join corp Tailscale or enable Funnel — do that on an xAI host (desk NUC, lab VM, etc.).

## API

- `GET /api/state` — parties, vehicles (+ `seats` ledger), clearances  
- `POST /api/parties` — passenger seat request  
- `POST|PATCH /api/vehicles` — register, GPS, accept clearance  
- `POST /api/board` — board / alight against the ledger  
- `GET /api/dispatch` — ground-control snapshot  

Legacy aliases: `/api/requests`, `/api/drivers`, `/api/pickups`.
