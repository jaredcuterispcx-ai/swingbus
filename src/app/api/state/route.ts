import { NextResponse } from "next/server";
import { getState, resetDemo } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return NextResponse.json(state);
}

export async function DELETE() {
  const state = await resetDemo();
  return NextResponse.json(state);
}
