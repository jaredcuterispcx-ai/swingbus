import { NextResponse } from "next/server";
import {
  registerDriver,
  setDriverActive,
  updateDriverLocation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const driver = await registerDriver({
      label: String(body.label ?? ""),
      capacity: body.capacity != null ? Number(body.capacity) : undefined,
    });
    return NextResponse.json(driver, { status: 201 });
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
    const driverId = String(body.driverId ?? "");

    if (body.action === "location") {
      const driver = await updateDriverLocation({
        driverId,
        lat: Number(body.lat),
        lng: Number(body.lng),
        currentStopId:
          body.currentStopId === undefined ? undefined : body.currentStopId,
      });
      if (!driver) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(driver);
    }

    if (body.action === "active") {
      const driver = await setDriverActive(driverId, Boolean(body.active));
      if (!driver) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(driver);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
