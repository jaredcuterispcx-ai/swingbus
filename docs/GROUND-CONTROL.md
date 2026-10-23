# Ground control model (airport metaphor)

swingbus treats campus shuttles like ground vehicles under a tower.

## Actors

| Real world | swingbus | Notes |
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

A party can be **cancelled** only while waiting or cleared: by the phone that requested it (its `sb_ride` cancel-token cookie), or by ground control from the Waiting board. Delivered and cancelled parties are deleted 3 hours after they close.

Riders follow along on the stop page, which reads their ride from the feed (`state.ride`): "On Volt" with the ETA to their stop, then "Arrived". For 15 minutes after a ride ends the page says how it ended, until the rider taps Done or Request again.

Requests nobody picks up lapse 30 minutes after they were made (`cancelled` with `cancelReason: "expired"`). A driver at the stop can mark a suggested group as a no-show (`cancelReason: "no_show"`), which frees its seats at once. Either way the rider sees why, with a one-tap "Request again".

A request can't be bigger than the biggest shuttle ground control can send (the feed's `maxPartySize`, 12 when none is online); a waiting party that stops fitting because the big shuttle left is told "Too many riders" until one that fits is back.

## Vehicle lifecycle

`offline → available → enroute → at_stand / boarding → full → …`

GPS updates keep the vehicle positionable for ETA. Without GPS (and without a current stand), the vehicle is invisible to auto-clearance.

Presence runs off `lastLocationAt`. `/driver` refreshes it about every 30 s while open (a new GPS fix, or the last one again when parked) and holds a Screen Wake Lock so the phone doesn't sleep. When the phone goes quiet:

| Quiet for | Effect |
| --- | --- |
| 2 min | Riders and ground control see "Last seen N min ago" |
| 5 min | Out of contact: no new clearances; riders it held wait again and go to another shuttle |
| 30 min | Taken offline; anyone still on board counts as dropped off |

Going offline, by the driver (who confirms first if anyone is on board) or by the 30-minute cutoff, drops everyone still on board at their stop. Only the driver's "Go online" brings a shuttle back; GPS alone doesn't.

After a pickup the heading becomes the nearest stop someone on board is going to. When the last rider for the heading stop gets off, it moves to the next nearest, or clears when nobody is left. A heading the driver picked for a stop nobody on board is going to stays put.

The cutoffs live in `src/lib/lifecycle.ts`.

## Why this mirrors a ground controller

- Controllers care about **capacity and occupancy**, not just “a plane exists.”
- Clearances **reserve** resources before the vehicle physically arrives.
- The board shows **stands with demand** and **fleet with free seats** side by side.
- Drivers execute clearances; they do not invent the global plan.
