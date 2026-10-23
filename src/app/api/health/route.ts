import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { authConfigProblem } from "@/lib/auth";
import { DATA_DIR } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function unhealthy(error: string) {
  return NextResponse.json({ status: "error", error }, { status: 503, headers: noStore });
}

/** The store creates DATA_DIR on first write, so a missing dir passes if its nearest existing parent is writable. */
async function assertWritable(dir: string): Promise<void> {
  try {
    await fs.access(dir, fs.constants.W_OK);
  } catch (err) {
    const parent = path.dirname(dir);
    if ((err as NodeJS.ErrnoException).code !== "ENOENT" || parent === dir) throw err;
    await assertWritable(parent);
  }
}

/**
 * Container probe. Read-only: it never goes through getState(), which can write.
 * 200 when auth is configured, DATA_DIR is writable, and store.json parses or
 * doesn't exist yet (the first request seeds it).
 */
export async function GET() {
  if (authConfigProblem()) return unhealthy("auth not configured");
  try {
    await assertWritable(DATA_DIR);
    let stops: number | null = null;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, "store.json"), "utf8"));
      stops = Array.isArray(raw?.stops) ? raw.stops.length : 0;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return NextResponse.json(
      {
        status: "ok",
        store: stops === null ? "new" : "ok",
        ...(stops === null ? {} : { stops }),
        uptimeSeconds: Math.round(process.uptime()),
      },
      { headers: noStore },
    );
  } catch (err) {
    console.error("[swingbus] health check failed:", err);
    return unhealthy("data store unavailable");
  }
}
