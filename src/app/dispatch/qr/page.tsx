import type { Metadata } from "next";
import { QrControls, QrSheet } from "@/components/qr-sheet";
import { resolveQrBase } from "@/lib/public-url";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "swingbus stop QR codes" };

export default async function StopQrPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string | string[] }>;
}) {
  const { base: override } = await searchParams;
  const [{ stops }, base] = await Promise.all([getState(), resolveQrBase(override)]);

  return (
    <main className="sb-shell sb-qr-shell">
      <QrControls view="stops" base={base} />
      <QrSheet
        cards={stops.map((stop) => ({
          key: stop.id,
          label: stop.name,
          tag: stop.shortCode,
          cta: "Scan to request a ride",
          url: base.url && `${base.url}/passenger/${encodeURIComponent(stop.id)}`,
        }))}
      />
    </main>
  );
}
