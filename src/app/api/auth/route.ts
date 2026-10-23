import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  authConfigProblem,
  createSession,
  readSession,
  roleForPassword,
  satisfies,
  type Role,
} from "@/lib/auth";
import { clientKey, rateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Matches the Cloudflare rule: 10 sign-in attempts a minute per IP, then a 10-minute wait. */
const signIns = rateLimiter({ max: 10, windowMs: 60_000, blockMs: 10 * 60_000 });

function cookieOptions(req: Request) {
  const https =
    new URL(req.url).protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/** Current role, if signed in. */
export async function GET(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return NextResponse.json({ role: await readSession(token) });
}

/** Sign in: { password, as?: "driver" | "admin" } */
export async function POST(req: Request) {
  if (authConfigProblem()) {
    return NextResponse.json(
      { error: "Sign-in is off: server passwords aren't set" },
      { status: 503 },
    );
  }
  const ip = clientKey(req);
  const wait = signIns.take(ip);
  if (wait) {
    return NextResponse.json(
      { error: `Too many tries. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const role = roleForPassword(String(body.password ?? ""));
  const wanted: Role = body.as === "admin" ? "admin" : "driver";
  if (!role || !satisfies(role, wanted)) {
    // Small delay blunts password guessing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  // Only wrong passwords count, so a shift signing in over one site's Wi-Fi isn't blocked.
  signIns.refund(ip);
  const res = NextResponse.json({ role });
  res.cookies.set(SESSION_COOKIE, await createSession(role), cookieOptions(req));
  return res;
}

/** Sign out. */
export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
  return res;
}
