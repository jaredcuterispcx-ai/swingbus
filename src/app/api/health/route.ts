import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { authConfigProblem } from "@/lib/auth";
import { DATA_DIR, getState } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Container health: 200 when the store loads, the data dir is writable, and auth is configured. */
export async function GET() {
  if (authConfigProblem()) {
    return NextResponse.json(
      { status: "error", error: "auth not configured" },
      { status: 503, headers: noStore },
    );
  }
  try {
    const state = await getState();
    await fs.access(DATA_DIR, fs.constants.W_OK);
    return NextResponse.json(
      {
        status: "ok",
        schemaVersion: state.schemaVersion,
        stops: state.stops.length,
        uptimeSeconds: Math.round(process.uptime()),
      },
      { headers: noStore },
    );
  } catch (err) {
    console.error("[swingbus] health check failed:", err);
    return NextResponse.json(
      { status: "error", error: "data store unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
