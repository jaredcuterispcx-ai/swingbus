import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession, requiredRole, satisfies } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needed = requiredRole(pathname, req.method);
  if (!needed) return NextResponse.next();

  const role = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (satisfies(role, needed)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}&as=${needed}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/driver/:path*",
    "/admin/:path*",
    "/dispatch/:path*",
    "/api/:path*",
  ],
};
