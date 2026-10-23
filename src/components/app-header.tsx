import Link from "next/link";
import type { ReactNode } from "react";
import { BoltMark } from "./brand";

export function AppHeader({
  backHref = "/",
  title,
  right,
}: {
  backHref?: string;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-12 items-center gap-3">
      <Link href={backHref} aria-label="Back" className="sb-icon-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>
      {title && <h1 className="sb-brand min-w-0 flex-1 truncate text-xl">{title}</h1>}
      <div className="ml-auto flex items-center gap-2">
        {right ?? (
          <Link href="/" aria-label="swingbus home">
            <BoltMark size={30} />
          </Link>
        )}
      </div>
    </div>
  );
}
