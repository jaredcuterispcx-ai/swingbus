import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { publicRide } from "@/lib/feed";
import { clientKey, rateLimiter } from "@/lib/rate-limit";
import { RIDE_COOKIE, rideCookieOptions } from "@/lib/ride-token";
import { RideError, cancelParty, createParty } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Roomy enough for a whole site behind one Wi-Fi address; matches the Cloudflare rule. */
const requests = rateLimiter({ max: 60, windowMs: 60_000 });

function fail(err: unknown) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Failed" },
    { status: err instanceof RideError ? err.status : 400 },
  );
}

export async function POST(req: NextRequest) {
  const wait = requests.take(clientKey(req));
  if (wait) {
    return NextResponse.json(
      { error: "Too many ride requests from this network. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  try {
    const body = await req.json();
    const { party, cancelToken } = await createParty({
      stopId: String(body.stopId ?? ""),
      destinationId: String(body.destinationId ?? ""),
      partySize: Number(body.partySize ?? 1),
      note: body.note ? String(body.note) : undefined,
      contactHint: body.contactHint ? String(body.contactHint) : undefined,
      heldCancelToken: req.cookies.get(RIDE_COOKIE)?.value,
    });
    const res = NextResponse.json(publicRide(party), { status: 201 });
    res.cookies.set(RIDE_COOKIE, cancelToken, rideCookieOptions(req));
    return res;
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "cancel") {
      const role = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
      const updated = await cancelParty(String(body.id ?? ""), {
        staff: role !== null,
        cancelToken: req.cookies.get(RIDE_COOKIE)?.value,
      });
      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(publicRide(updated));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
