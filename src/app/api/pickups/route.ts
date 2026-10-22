import { NextResponse } from "next/server";
import { dropOff, recordPickup } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "dropoff") {
      const driver = await dropOff({
        driverId: String(body.driverId ?? ""),
        partySize: Number(body.partySize ?? 1),
      });
      if (!driver) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(driver);
    }

    const pickup = await recordPickup({
      driverId: String(body.driverId ?? ""),
      stopId: String(body.stopId ?? ""),
      destinationId: String(body.destinationId ?? ""),
      requestIds: Array.isArray(body.requestIds)
        ? body.requestIds.map(String)
        : undefined,
      partySize:
        body.partySize != null ? Number(body.partySize) : undefined,
    });
    return NextResponse.json(pickup, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
