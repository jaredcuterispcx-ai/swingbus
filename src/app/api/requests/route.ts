import { NextResponse } from "next/server";
import { cancelRequest, createRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const request = await createRequest({
      stopId: String(body.stopId ?? ""),
      destinationId: String(body.destinationId ?? ""),
      partySize: Number(body.partySize ?? 1),
      note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json(request, { status: 201 });
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
    if (body.action === "cancel") {
      const updated = await cancelRequest(String(body.id ?? ""));
      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
