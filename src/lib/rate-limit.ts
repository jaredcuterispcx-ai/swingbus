/**
 * Per-IP limits kept in memory. swingbus runs as a single process, so counts are exact;
 * in production Cloudflare applies the same limits at the edge.
 */

type Window = { count: number; until: number; blocked: boolean };

/** Under a flood of new addresses the oldest are forgotten instead of growing memory. */
const MAX_KEYS = 10_000;

export function rateLimiter({
  max,
  windowMs,
  blockMs = windowMs,
}: {
  /** Attempts allowed per window. */
  max: number;
  windowMs: number;
  /** How long a caller who goes over has to wait. */
  blockMs?: number;
}) {
  const windows = new Map<string, Window>();
  let sweptAt = 0;

  function sweep(now: number) {
    if (now - sweptAt >= windowMs) {
      sweptAt = now;
      for (const [key, w] of windows) if (w.until <= now) windows.delete(key);
    }
    while (windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value!);
  }

  return {
    /** Counts one attempt. Returns 0 if it may go ahead, else the seconds to wait. */
    take(key: string, now = Date.now()): number {
      sweep(now);
      let w = windows.get(key);
      if (!w || w.until <= now) {
        w = { count: 0, until: now + windowMs, blocked: false };
        windows.set(key, w);
      }
      if (!w.blocked && w.count >= max) {
        w.blocked = true;
        w.until = now + blockMs;
      }
      if (w.blocked) return Math.ceil((w.until - now) / 1000);
      w.count += 1;
      return 0;
    },
    /** Hands back an attempt that turned out fine, such as a correct password. */
    refund(key: string) {
      const w = windows.get(key);
      if (w && !w.blocked && w.count > 0) w.count -= 1;
    },
  };
}

/**
 * The caller's address: CF-Connecting-IP behind Cloudflare, else the nearest X-Forwarded-For
 * hop. Without a proxy in front, clients can set either header themselves.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop();
  return ipKey((req.headers.get("cf-connecting-ip") ?? forwarded ?? "").trim());
}

/** IPv6 addresses are grouped by /64, which a single device can rotate through freely. */
export function ipKey(ip: string): string {
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip || "unknown";
  const [head, tail] = ip.split("::");
  const groups = head ? head.split(":") : [];
  if (tail !== undefined) {
    const rest = tail ? tail.split(":") : [];
    groups.push(...Array<string>(Math.max(0, 8 - groups.length - rest.length)).fill("0"), ...rest);
  }
  const prefix = groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16));
  return `${prefix.join(":")}::/64`;
}
