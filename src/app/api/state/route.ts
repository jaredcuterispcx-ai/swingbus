import { NextResponse } from "next/server";
import { activeClearances, seatLedger } from "@/lib/seats";
import { getState, resetDemo } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  const vehicles = state.vehicles.map((v) => ({
    ...v,
    seats: seatLedger(state, v),
  }));
  return NextResponse.json({
    ...state,
    vehicles,
    activeClearances: activeClearances(state),
  });
}

export async function DELETE() {
  const state = await resetDemo();
  return NextResponse.json(state);
}
