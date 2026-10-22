import { NextResponse } from "next/server";
import { seatLedger } from "@/lib/seats";
import {
  getState,
  registerVehicle,
  setVehicleActive,
  updateVehicleLocation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vehicle = await registerVehicle({
      callsign: String(body.label ?? body.callsign ?? ""),
      capacity: body.capacity != null ? Number(body.capacity) : undefined,
    });
    const state = await getState();
    return NextResponse.json(
      {
        ...vehicle,
        label: vehicle.callsign,
        onboard: vehicle.occupied,
        seats: seatLedger(state, vehicle),
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

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const vehicleId = String(body.driverId ?? body.vehicleId ?? "");

    if (body.action === "location") {
      const vehicle = await updateVehicleLocation({
        vehicleId,
        lat: Number(body.lat),
        lng: Number(body.lng),
        currentStopId:
          body.currentStopId === undefined ? undefined : body.currentStopId,
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const state = await getState();
      return NextResponse.json({
        ...vehicle,
        label: vehicle.callsign,
        onboard: vehicle.occupied,
        seats: seatLedger(state, vehicle),
      });
    }

    if (body.action === "active") {
      const vehicle = await setVehicleActive(vehicleId, Boolean(body.active));
      if (!vehicle) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(vehicle);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
