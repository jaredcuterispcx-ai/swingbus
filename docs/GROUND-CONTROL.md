# Ground control model (airport metaphor)

Swing Bus treats campus shuttles like ground vehicles under a tower.

## Actors

| Real world | Swing Bus | Notes |
| --- | --- | --- |
| Gate / stand | **Stop / stand** | QR at the curb |
| Passenger group | **Party** | Requests *seats* (party size), not just a ping |
| Aircraft / bus | **Vehicle** | Callsign + physical **capacity** |
| Tower | **Ground control** | Issues **clearances**, tracks seat tape |
| Taxi clearance | **Clearance** | “Vehicle X, hold N seats, pick up stand Y” |

## Seat ledger (what drivers need)

For every vehicle:

```
available = capacity − occupied − reserved
```

| Bucket | Meaning | Changes when |
| --- | --- | --- |
| **capacity** | Physical seats on the bus | Set at go-on-duty |
| **occupied** | Heads currently onboard | Board (+) / alight (−) |
| **reserved** | Seats held by open clearances | Clearance issued (+) / board or cancel (−) |
| **available** | What ground control can still assign | Derived |

A bus is **full** when `available === 0`, even if some seats are only *held* and not yet boarded — that prevents double-booking.

## Passenger lifecycle

`waiting → cleared → boarding → onboard → delivered` (or `cancelled`)

1. Passenger scans stand QR, enters destination + party size.
2. Ground control finds nearest vehicle with enough **available** seats.
3. Party becomes **cleared**; those seats move into **reserved** on that vehicle.
4. Driver accepts clearance, arrives, **boards** → reserved becomes **occupied**.
5. At destination, driver **alights** → occupied drops; party **delivered**.

## Vehicle lifecycle

`offline → available → enroute → at_stand / boarding → full → …`

GPS updates keep the vehicle positionable for ETA. Without GPS (and without a current stand), the vehicle is invisible to auto-clearance.

## Why this mirrors a ground controller

- Controllers care about **capacity and occupancy**, not just “a plane exists.”
- Clearances **reserve** resources before the vehicle physically arrives.
- The board shows **stands with demand** and **fleet with free seats** side by side.
- Drivers execute clearances; they do not invent the global plan.
