import { NextResponse } from "next/server";
import { activeClearances, seatLedger } from "@/lib/seats";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Ground-control snapshot — stands, seat tape, clearances. */
export async function GET() {
  const state = await getState();

  const stands = state.stops
    .map((stop) => {
      const open = state.parties.filter(
        (p) =>
          p.stopId === stop.id &&
          (p.status === "waiting" ||
            p.status === "cleared" ||
            p.status === "boarding"),
      );
      const waiting = open.filter((p) => p.status === "waiting");
      const cleared = open.filter(
        (p) => p.status === "cleared" || p.status === "boarding",
      );
      return {
        stop,
        waitingSeats: waiting.reduce((n, p) => n + p.partySize, 0),
        clearedSeats: cleared.reduce((n, p) => n + p.partySize, 0),
        parties: open,
        destinations: Object.entries(
          open.reduce<Record<string, number>>((acc, p) => {
            acc[p.destinationId] = (acc[p.destinationId] ?? 0) + p.partySize;
            return acc;
          }, {}),
        ).map(([destinationId, seats]) => ({ destinationId, seats })),
      };
    })
    .filter((s) => s.waitingSeats + s.clearedSeats > 0);

  const fleet = state.vehicles
    .filter((v) => v.active)
    .map((v) => ({
      ...v,
      seats: seatLedger(state, v),
    }));

  return NextResponse.json({
    updatedAt: state.updatedAt,
    clearances: activeClearances(state),
    stands,
    fleet,
    recentEvents: state.events.slice(0, 12),
  });
}
