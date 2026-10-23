import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { authConfigProblem } from "@/lib/auth";
import { DATA_DIR, STORE_PATH } from "@/lib/store";

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

/** store.json's contents, or null when it doesn't exist yet. */
async function readStoreFile(): Promise<string | null> {
  try {
    const [dir, file] = await Promise.all([fs.stat(DATA_DIR), fs.stat(STORE_PATH)]);
    // Writes rename a temp file over store.json, which fails when the file is mounted on its own.
    if (dir.dev !== file.dev) {
      throw new Error(`${STORE_PATH} is mounted on its own; mount ${DATA_DIR} as a directory`);
    }
    return await fs.readFile(STORE_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
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
    const text = await readStoreFile();
    let store: { store: "new" } | { store: "ok"; stops: number } = { store: "new" };
    if (text !== null) {
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== "object") throw new Error(`${STORE_PATH} is not a JSON object`);
      store = { store: "ok", stops: Array.isArray(raw.stops) ? raw.stops.length : 0 };
    }
    return NextResponse.json(
      { status: "ok", ...store, uptimeSeconds: Math.round(process.uptime()) },
      { headers: noStore },
    );
  } catch (err) {
    console.error("[swingbus] health check failed:", err);
    return unhealthy("data store unavailable");
  }
}
