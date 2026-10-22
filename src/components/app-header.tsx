import Link from "next/link";

export function AppHeader({
  backHref = "/",
  backLabel = "Swing Bus",
  badge,
}: {
  backHref?: string;
  backLabel?: string;
  badge: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link href={backHref} className="flex items-center gap-2.5 text-sm text-ink-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xsi-mark.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span>← {backLabel}</span>
      </Link>
      <span className="sb-chip inline-flex items-center gap-2">
        <span className="sb-live-dot" /> {badge}
      </span>
    </div>
  );
}
