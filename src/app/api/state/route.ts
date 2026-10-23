import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { publicState, staffState } from "@/lib/feed";
import { RIDE_COOKIE, rideForToken } from "@/lib/ride-token";
import { getState, resetDemo } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Anonymous callers get the passenger feed; signed-in drivers and admins get the full state. */
export async function GET(req: NextRequest) {
  const [state, role] = await Promise.all([
    getState(),
    readSession(req.cookies.get(SESSION_COOKIE)?.value),
  ]);
  const ride = rideForToken(state.parties, req.cookies.get(RIDE_COOKIE)?.value);
  return NextResponse.json(role ? staffState(state, ride) : publicState(state, ride), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function DELETE() {
  const state = await resetDemo();
  return NextResponse.json(state);
}
