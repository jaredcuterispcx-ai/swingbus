import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, STORE_PATH } from "./store";

const DATED_COPY = /^store\.json\.\d{4}-\d{2}-\d{2}$/;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Daily copies to keep: BACKUP_DAYS (default 14); 0 turns backups off. */
function copiesToKeep(): number {
  const n = Number(process.env.BACKUP_DAYS ?? "14");
  return Number.isInteger(n) && n >= 0 ? n : 14;
}

/**
 * store.json is the only copy of the stops and rides, so keep one dated copy per
 * UTC day beside it (store.json.YYYY-MM-DD) and prune to the newest N. A store
 * that doesn't parse is never copied and prunes nothing, so bad data can't push
 * out good copies.
 */
export async function backupStore(now = new Date()): Promise<void> {
  const keep = copiesToKeep();
  if (keep === 0) return;
  const target = `${STORE_PATH}.${now.toISOString().slice(0, 10)}`;
  const done = await fs.access(target).then(
    () => true,
    () => false,
  );
  if (!done) {
    let text: string;
    try {
      text = await fs.readFile(STORE_PATH, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    JSON.parse(text);
    await fs.writeFile(`${target}.tmp`, text);
    await fs.rename(`${target}.tmp`, target);
  }
  const copies = (await fs.readdir(DATA_DIR)).filter((f) => DATED_COPY.test(f)).sort();
  for (const old of copies.slice(0, -keep)) {
    await fs.rm(path.join(DATA_DIR, old), { force: true });
  }
}

/** Back up at boot, then check hourly for a new day. */
export function startDailyBackups() {
  const run = () =>
    backupStore().catch((err) => console.error("[swingbus] daily backup failed:", err));
  void run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
