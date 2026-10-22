import { NextResponse } from "next/server";
import {
  createParty,
  getState,
  registerVehicle,
  resetDemo,
  updateVehicleLocation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** Seed a realistic ground-control scenario for demos. */
export async function POST() {
  await resetDemo();

  const v1 = await registerVehicle({ callsign: "Green-1", capacity: 14 });
  const v2 = await registerVehicle({ callsign: "Blue-2", capacity: 10 });

  await updateVehicleLocation({
    vehicleId: v1.id,
    lat: 37.3865,
    lng: -122.0835,
  });
  await updateVehicleLocation({
    vehicleId: v2.id,
    lat: 37.3835,
    lng: -122.0805,
  });

  await createParty({
    stopId: "hq-lobby",
    destinationId: "remote-lot",
    partySize: 4,
    note: "team standup",
  });
  await createParty({
    stopId: "hq-lobby",
    destinationId: "lab-wing",
    partySize: 2,
  });
  await createParty({
    stopId: "cafe-row",
    destinationId: "garage-p3",
    partySize: 3,
  });
  await createParty({
    stopId: "remote-lot",
    destinationId: "hq-lobby",
    partySize: 6,
  });

  const state = await getState();
  return NextResponse.json({
    ok: true,
    vehicles: state.vehicles.length,
    parties: state.parties.length,
    clearances: state.clearances.filter((c) => c.status !== "completed").length,
  });
}
