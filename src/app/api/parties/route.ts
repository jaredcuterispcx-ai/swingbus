import { NextResponse } from "next/server";
import { cancelParty, createParty } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const party = await createParty({
      stopId: String(body.stopId ?? ""),
      destinationId: String(body.destinationId ?? ""),
      partySize: Number(body.partySize ?? 1),
      note: body.note ? String(body.note) : undefined,
      contactHint: body.contactHint ? String(body.contactHint) : undefined,
    });
    return NextResponse.json(party, { status: 201 });
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
      const updated = await cancelParty(String(body.id ?? ""));
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
