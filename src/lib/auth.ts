/**
 * Password gates for driver and admin areas.
 * Edge-safe (Web Crypto only) so middleware can verify sessions.
 */

export type Role = "driver" | "admin";

export const SESSION_COOKIE = "sb_session";
export const SESSION_DAYS = 30;

// Local development only: the repo is public, so production refuses these.
const DEV_DRIVER_PASSWORD = "swingbus-driver";
const DEV_ADMIN_PASSWORD = "swingbus-admin";

/**
 * Why production can't offer sign-in with the current env, or null when it can.
 * Startup (src/instrumentation.ts) exits on this; sign-in and sessions also refuse.
 */
export function authConfigProblem(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const driver = process.env.DRIVER_PASSWORD;
  const admin = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  const missing = [
    driver ? null : "DRIVER_PASSWORD",
    admin ? null : "ADMIN_PASSWORD",
    secret ? null : "AUTH_SECRET",
  ].filter(Boolean);
  if (missing.length > 0) return `set ${missing.join(", ")}`;
  if (driver === DEV_DRIVER_PASSWORD || admin === DEV_ADMIN_PASSWORD) {
    return "DRIVER_PASSWORD and ADMIN_PASSWORD must not be the public defaults";
  }
  if (driver === admin) return "DRIVER_PASSWORD and ADMIN_PASSWORD must differ";
  if (secret!.length < 32) return "AUTH_SECRET must be at least 32 characters";
  return null;
}

function passwords() {
  if (authConfigProblem()) return null;
  return {
    driver: process.env.DRIVER_PASSWORD || DEV_DRIVER_PASSWORD,
    admin: process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD,
  };
}

/** Changing AUTH_SECRET or either password invalidates every existing session. */
function secret(): string | null {
  const p = passwords();
  if (!p) return null;
  return `${process.env.AUTH_SECRET || "swingbus"}|${p.driver}|${p.admin}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function roleForPassword(password: string): Role | null {
  const p = passwords();
  if (!p) return null;
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
  const keyMaterial = secret();
  if (!keyMaterial) throw new Error("Sign-in is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
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
  if (!token || authConfigProblem()) return null;
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
