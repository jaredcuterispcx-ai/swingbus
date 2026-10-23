import { NextResponse } from "next/server";
import { alight, boardParties } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "alight" || body.action === "dropoff") {
      const result = await alight({
        vehicleId: String(body.vehicleId ?? body.driverId ?? ""),
        seats: Number(body.seats ?? body.partySize ?? 1),
        destinationId: body.destinationId
          ? String(body.destinationId)
          : undefined,
      });
      return NextResponse.json(result);
    }

    const result = await boardParties({
      vehicleId: String(body.vehicleId ?? body.driverId ?? ""),
      stopId: String(body.stopId ?? ""),
      destinationId: body.destinationId
        ? String(body.destinationId)
        : undefined,
      partyIds: Array.isArray(body.partyIds)
        ? body.partyIds.map(String)
        : Array.isArray(body.requestIds)
          ? body.requestIds.map(String)
          : undefined,
      seats:
        body.seats != null
          ? Number(body.seats)
          : body.partySize != null
            ? Number(body.partySize)
            : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
