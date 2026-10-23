import { NextResponse } from "next/server";
import {
  createStop,
  deleteStop,
  getState,
  restoreDefaultStops,
  updateStop,
  type StopInput,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** When ADMIN_PIN is set, stop edits require a matching x-admin-pin header. */
function unauthorized(req: Request) {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return null;
  if (req.headers.get("x-admin-pin") === pin) return null;
  return NextResponse.json({ error: "Admin PIN required" }, { status: 401 });
}

function fail(err: unknown, status = 400) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Failed" },
    { status },
  );
}

function toInput(body: Record<string, unknown>): StopInput {
  const num = (v: unknown) =>
    v === undefined || v === "" ? undefined : v === null ? null : Number(v);
  const input: StopInput = {};
  if (body.name !== undefined) input.name = String(body.name);
  if (body.shortCode !== undefined) input.shortCode = String(body.shortCode);
  if (body.description !== undefined) input.description = String(body.description);
  const lat = num(body.lat);
  const lng = num(body.lng);
  if (lat != null) input.lat = lat;
  if (lng != null) input.lng = lng;
  if (body.service !== undefined) {
    input.service = body.service ? (String(body.service) as StopInput["service"]) : null;
  }
  if (body.arrivalRadiusM !== undefined) {
    input.arrivalRadiusM = num(body.arrivalRadiusM) ?? null;
  }
  return input;
}

export async function GET() {
  const state = await getState();
  return NextResponse.json({
    stops: state.stops,
    pinRequired: Boolean(process.env.ADMIN_PIN),
  });
}

export async function POST(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    if (body.action === "restore_defaults") {
      return NextResponse.json({ stops: await restoreDefaultStops() });
    }
    const stop = await createStop(toInput(body));
    return NextResponse.json(stop, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const stop = await updateStop(String(body.id ?? ""), toInput(body));
    if (!stop) return fail(new Error("Stop not found"), 404);
    return NextResponse.json(stop);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const ok = await deleteStop(id);
    if (!ok) return fail(new Error("Stop not found"), 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, 409);
  }
}
