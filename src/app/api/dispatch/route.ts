import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Live dispatch snapshot — same as /api/state but focused for polling UIs. */
export async function GET() {
  const state = await getState();
  const waitingByStop = state.stops.map((stop) => {
    const waiting = state.requests.filter(
      (r) => r.stopId === stop.id && (r.status === "waiting" || r.status === "assigned"),
    );
    return {
      stop,
      people: waiting.reduce((n, r) => n + r.partySize, 0),
      parties: waiting.length,
      destinations: Object.entries(
        waiting.reduce<Record<string, number>>((acc, r) => {
          acc[r.destinationId] = (acc[r.destinationId] ?? 0) + r.partySize;
          return acc;
        }, {}),
      ).map(([destinationId, people]) => ({ destinationId, people })),
    };
  });

  return NextResponse.json({
    updatedAt: state.updatedAt,
    suggestions: state.suggestions,
    drivers: state.drivers.filter((d) => d.active),
    waitingByStop: waitingByStop.filter((w) => w.people > 0),
    recentPickups: state.pickups.slice(0, 10),
  });
}
