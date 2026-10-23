import type { Metadata } from "next";
import { QrPrintSheet } from "@/components/qr-sheet";
import { resolveQrPreset } from "@/lib/public-url";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "swingbus stop QR codes" };

export default async function StopQrPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string | string[] }>;
}) {
  const [{ base }, { stops }] = await Promise.all([searchParams, getState()]);

  return (
    <main className="sb-shell sb-qr-shell">
      <QrPrintSheet
        view="stops"
        preset={resolveQrPreset(base)}
        cards={stops.map((stop) => ({
          key: stop.id,
          label: stop.name,
          tag: stop.shortCode,
          cta: "Scan to request a ride",
          path: `/passenger/${encodeURIComponent(stop.id)}`,
        }))}
      />
    </main>
  );
}
