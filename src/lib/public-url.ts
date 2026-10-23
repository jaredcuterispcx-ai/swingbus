/**
 * Base address for printed QR codes. Only a bare origin is ever kept (no
 * credentials, path, query or fragment), so a code can't carry a password or
 * token. Loopback addresses (localhost, 127.x, ::1, 0.0.0.0) are refused:
 * phones scan these off paper.
 */

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

/** "host.example.com/x?y" → "https://host.example.com"; null when phones can't use it. */
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
  return url.origin;
}

export type QrPreset = {
  /** Base from the page's Public URL field or PUBLIC_URL; null means the address the page is open at. */
  url: string | null;
  /** True when `url` came from the page's `?base=` field. */
  overridden: boolean;
  /** A `?base=` value that was refused, echoed back so it can be fixed. */
  rejected: string | null;
};

/** Server side: the page's `?base=` field wins over the PUBLIC_URL env var. */
export function resolveQrPreset(field?: string | string[]): QrPreset {
  const typed = (Array.isArray(field) ? field[0] : field)?.trim() || null;
  const fromField = normalizePublicUrl(typed);
  return {
    url: fromField ?? normalizePublicUrl(process.env.PUBLIC_URL),
    overridden: fromField !== null,
    rejected: typed && !fromField ? typed : null,
  };
}
