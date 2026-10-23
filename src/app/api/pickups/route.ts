import { NextResponse } from "next/server";
import { alight, boardParties } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "dropoff") {
      const result = await alight({
        vehicleId: String(body.driverId ?? body.vehicleId ?? ""),
        seats: Number(body.partySize ?? body.seats ?? 1),
      });
      return NextResponse.json({
        ...result.vehicle,
        label: result.vehicle.callsign,
        onboard: result.vehicle.occupied,
        seats: result.ledger,
      });
    }

    const result = await boardParties({
      vehicleId: String(body.driverId ?? body.vehicleId ?? ""),
      stopId: String(body.stopId ?? ""),
      destinationId: String(body.destinationId ?? ""),
      partyIds: Array.isArray(body.requestIds)
        ? body.requestIds.map(String)
        : undefined,
      seats: body.partySize != null ? Number(body.partySize) : undefined,
    });
    return NextResponse.json(
      {
        ...result.event,
        partySize: result.event.seats,
        requestIds: result.event.partyIds,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
