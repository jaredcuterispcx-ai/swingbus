import type { Metadata } from "next";
import { QrPrintSheet } from "@/components/qr-sheet";
import { resolveQrPreset } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "swingbus driver QR code" };

export default async function DriverQrPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string | string[] }>;
}) {
  const { base } = await searchParams;

  return (
    <main className="sb-shell sb-qr-shell">
      <QrPrintSheet
        view="driver"
        poster
        preset={resolveQrPreset(base)}
        cards={[{ key: "driver", label: "Driver", cta: "Scan to start driving", path: "/driver" }]}
      />
    </main>
  );
}
