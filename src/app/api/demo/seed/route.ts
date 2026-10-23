import { NextResponse } from "next/server";
import { serviceStatus } from "@/lib/service-hours";
import {
  createParty,
  getState,
  registerVehicle,
  resetDemo,
  updateVehicleLocation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

const DEMO_RIDERS = [
  {
    stopId: "food-trucks-war-room",
    destinationId: "macroharder-east",
    partySize: 4,
    note: "lunch run",
  },
  { stopId: "crossroads", destinationId: "duke", partySize: 2 },
  { stopId: "southland-mall", destinationId: "macroharder-west", partySize: 3 },
  { stopId: "church-lot", destinationId: "macroharder-east", partySize: 6 },
];

/** Seed a realistic ground-control scenario for demos. */
export async function POST() {
  await resetDemo();

  const v1 = await registerVehicle({ callsign: "Green-1", capacity: 14 });
  const v2 = await registerVehicle({ callsign: "Blue-2", capacity: 10 });

  // Stateline Rd W outside Macroharder, clear of every stop's arrival radius
  await updateVehicleLocation({
    vehicleId: v1.id,
    lat: 34.99185,
    lng: -90.038,
  });
  await updateVehicleLocation({
    vehicleId: v2.id,
    lat: 34.99183,
    lng: -90.033,
  });

  // Riders can't request offsite lots outside their service hours.
  const { stops } = await getState();
  const inService = (id: string) => {
    const stop = stops.find((s) => s.id === id);
    return !stop || serviceStatus(stop).open;
  };
  for (const rider of DEMO_RIDERS) {
    if (inService(rider.stopId) && inService(rider.destinationId)) {
      await createParty(rider);
    }
  }

  const state = await getState();
  return NextResponse.json({
    ok: true,
    vehicles: state.vehicles.length,
    parties: state.parties.length,
    clearances: state.clearances.filter((c) => c.status !== "completed").length,
  });
}
