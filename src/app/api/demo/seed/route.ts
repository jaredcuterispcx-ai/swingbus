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

  // Approximate Macroharder / Stateline corridor
  await updateVehicleLocation({
    vehicleId: v1.id,
    lat: 35.0016,
    lng: -90.0135,
  });
  await updateVehicleLocation({
    vehicleId: v2.id,
    lat: 35.0021,
    lng: -90.0118,
  });

  await createParty({
    stopId: "food-trucks-war-room",
    destinationId: "macroharder-east",
    partySize: 4,
    note: "lunch run",
  });
  await createParty({
    stopId: "crossroads",
    destinationId: "duke",
    partySize: 2,
  });
  await createParty({
    stopId: "southland-mall",
    destinationId: "macroharder-west",
    partySize: 3,
  });
  await createParty({
    stopId: "church-lot",
    destinationId: "macroharder-east",
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
