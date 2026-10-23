import { headers } from "next/headers";

/**
 * Base address for printed QR codes. Phones scan them off paper, so a
 * loopback address (localhost, 127.x, ::1, 0.0.0.0) is never usable.
 */
export type QrBase = {
  /** What every QR link starts with; null when only a loopback address is known. */
  url: string | null;
  /** True when `url` came from the page's `?base=` field. */
  overridden: boolean;
  /** A `?base=` value that was refused, echoed back so it can be fixed. */
  rejected: string | null;
};

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/** Expects a WHATWG-normalized hostname (IPv4 dotted, IPv6 compressed). */
function isLoopbackHost(hostname: string): boolean {
  const h = hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "0.0.0.0" ||
    h === "::" ||
    h === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    /^::ffff:7f[\da-f]{2}:[\da-f]{1,4}$/.test(h)
  );
}

/** "host.example.com" → "https://host.example.com"; null when phones can't use it. */
export function normalizePublicUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (isLoopbackHost(url.hostname)) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function firstValue(header: string | null): string | null {
  return header?.split(",")[0]?.trim() || null;
}

/**
 * The page's `?base=` field wins, then the PUBLIC_URL env var, then the
 * address this request reached the site at (a proxy's X-Forwarded-Host and
 * X-Forwarded-Proto before Host).
 */
export async function resolveQrBase(override?: string | string[]): Promise<QrBase> {
  const typed = (Array.isArray(override) ? override[0] : override)?.trim() || null;
  const fromField = normalizePublicUrl(typed);
  const rejected = typed && !fromField ? typed : null;
  if (fromField) return { url: fromField, overridden: true, rejected };

  const fromEnv = normalizePublicUrl(process.env.PUBLIC_URL);
  if (fromEnv) return { url: fromEnv, overridden: false, rejected };

  const h = await headers();
  const host = firstValue(h.get("x-forwarded-host")) ?? firstValue(h.get("host"));
  const proto = firstValue(h.get("x-forwarded-proto")) ?? "http";
  return {
    url: host ? normalizePublicUrl(`${proto}://${host}`) : null,
    overridden: false,
    rejected,
  };
}
