import { NextResponse } from "next/server";
import { seatLedger } from "@/lib/seats";
import {
  acceptClearance,
  getState,
  registerVehicle,
  setVehicleActive,
  setVehicleHeading,
  updateVehicleLocation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vehicle = await registerVehicle({
      callsign: String(body.callsign ?? body.label ?? ""),
      capacity: body.capacity != null ? Number(body.capacity) : undefined,
    });
    const state = await getState();
    return NextResponse.json(
      { ...vehicle, seats: seatLedger(state, vehicle) },
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
    const vehicleId = String(body.vehicleId ?? body.driverId ?? "");

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
      return NextResponse.json({ ...vehicle, seats: seatLedger(state, vehicle) });
    }

    if (body.action === "active") {
      const vehicle = await setVehicleActive(vehicleId, Boolean(body.active), {
        dropOff: Boolean(body.dropOff),
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(vehicle);
    }

    if (body.action === "accept_clearance") {
      const clearance = await acceptClearance(
        String(body.clearanceId ?? ""),
        vehicleId,
      );
      if (!clearance) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(clearance);
    }

    if (body.action === "heading") {
      const vehicle = await setVehicleHeading({
        vehicleId,
        headingStopId: body.headingStopId ? String(body.headingStopId) : null,
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const state = await getState();
      return NextResponse.json({ ...vehicle, seats: seatLedger(state, vehicle) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
