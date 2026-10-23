/**
 * Password gates for driver and admin areas.
 * Edge-safe (Web Crypto only) so middleware can verify sessions.
 */

export type Role = "driver" | "admin";

export const SESSION_COOKIE = "sb_session";
export const SESSION_DAYS = 30;

function passwords() {
  return {
    driver: process.env.DRIVER_PASSWORD || "swingbus-driver",
    admin: process.env.ADMIN_PASSWORD || "swingbus-admin",
  };
}

/** Changing either password invalidates every existing session. */
function secret(): string {
  const p = passwords();
  return process.env.AUTH_SECRET || `swingbus|${p.driver}|${p.admin}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function roleForPassword(password: string): Role | null {
  const p = passwords();
  if (safeEqual(password, p.admin)) return "admin";
  if (safeEqual(password, p.driver)) return "driver";
  return null;
}

/** Admins can do everything drivers can. */
export function satisfies(role: Role | null, needed: Role): boolean {
  if (!role) return false;
  return role === "admin" || role === needed;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSession(role: Role): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${role}.${exp}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSession(token: string | undefined): Promise<Role | null> {
  if (!token) return null;
  const [role, exp, sig] = token.split(".");
  if ((role !== "driver" && role !== "admin") || !exp || !sig) return null;
  if (!(Number(exp) > Date.now())) return null;
  return safeEqual(sig, await sign(`${role}.${exp}`)) ? role : null;
}

/** Which role a path needs, or null when it's public. */
export function requiredRole(pathname: string, method: string): Role | null {
  const isRead = method === "GET" || method === "HEAD";

  if (/^\/(admin|dispatch)(\/|$)/.test(pathname)) return "admin";
  if (/^\/driver(\/|$)/.test(pathname)) return "driver";

  if (/^\/api\/(demo|dispatch)(\/|$)/.test(pathname)) return "admin";
  if (pathname === "/api/state" && !isRead) return "admin";
  if (pathname === "/api/stops" && !isRead) return "admin";
  if (/^\/api\/(vehicles|drivers|board|pickups)(\/|$)/.test(pathname) && !isRead) {
    return "driver";
  }
  return null;
}
