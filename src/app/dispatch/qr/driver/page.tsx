import type { Metadata } from "next";
import { QrControls, QrSheet } from "@/components/qr-sheet";
import { resolveQrBase } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "swingbus driver QR code" };

export default async function DriverQrPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string | string[] }>;
}) {
  const { base: override } = await searchParams;
  const base = await resolveQrBase(override);

  return (
    <main className="sb-shell sb-qr-shell">
      <QrControls view="driver" base={base} />
      <QrSheet
        poster
        cards={[
          {
            key: "driver",
            label: "Driver",
            cta: "Scan to start driving",
            url: base.url && `${base.url}/driver`,
          },
        ]}
      />
    </main>
  );
}
