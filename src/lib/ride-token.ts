import { createHash, randomBytes } from "crypto";
import type { PassengerParty } from "./types";

/** http-only cookie holding the cancel token of this phone's latest ride request. */
export const RIDE_COOKIE = "sb_ride";

export function newCancelToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so neither the store file nor the staff feed can cancel a ride. */
export function hashCancelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function rideForToken(
  parties: PassengerParty[],
  token: string | undefined,
): PassengerParty | null {
  if (!token) return null;
  const hash = hashCancelToken(token);
  return parties.find((p) => p.cancelTokenHash === hash) ?? null;
}

/** Each new request replaces the token, so a day comfortably outlives any ride. */
export function rideCookieOptions(req: Request) {
  const https =
    new URL(req.url).protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: "/api",
    maxAge: 24 * 60 * 60,
  };
}
