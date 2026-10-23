"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { QrBase } from "@/lib/public-url";
import { AppHeader } from "./app-header";
import { BoltMark } from "./brand";

export type QrCardData = {
  key: string;
  label: string;
  tag?: string;
  cta: string;
  url: string | null;
};

type View = "stops" | "driver";

const VIEWS: { view: View; label: string; href: string }[] = [
  { view: "stops", label: "Stops", href: "/dispatch/qr" },
  { view: "driver", label: "Driver", href: "/dispatch/qr/driver" },
];

export function QrControls({ view, base }: { view: View; base: QrBase }) {
  const query = base.overridden && base.url ? `?base=${encodeURIComponent(base.url)}` : "";
  const problem = base.rejected
    ? `Phones can't open ${base.rejected}. Enter the public address.`
    : base.url
      ? null
      : "Phones can't open localhost. Enter the public address or set PUBLIC_URL.";

  return (
    <div className="mb-5 print:hidden">
      <AppHeader backHref="/dispatch" title="QR codes" />
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <nav className="grid grid-cols-2 gap-2 md:w-52" aria-label="QR codes">
          {VIEWS.map((v) => (
            <Link
              key={v.view}
              href={v.href + query}
              aria-current={v.view === view ? "page" : undefined}
              className={`sb-seg inline-flex min-h-[3.1rem] items-center justify-center ${v.view === view ? "sb-seg-on" : ""}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form
          action={VIEWS.find((v) => v.view === view)?.href}
          className="flex min-w-0 flex-1 items-end gap-2"
        >
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="sb-label">Public URL</span>
            <input
              name="base"
              className="sb-input"
              defaultValue={base.rejected ?? base.url ?? ""}
              placeholder="https://swingbus.example.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="sb-btn sb-btn-ghost min-h-[3.1rem]">
            Apply
          </button>
        </form>
        <button
          type="button"
          className="sb-btn sb-btn-primary min-h-[3.1rem] md:w-36"
          disabled={!base.url}
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      {problem && (
        <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{problem}</p>
      )}
    </div>
  );
}

/** Cards in sheets of four (one per sheet for a poster); each sheet prints on its own page. */
export function QrSheet({ cards, poster = false }: { cards: QrCardData[]; poster?: boolean }) {
  const perPage = poster ? 1 : 4;
  const pages: QrCardData[][] = [];
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage));

  return (
    <div className={`sb-qr-sheet${poster ? " sb-qr-poster" : ""}`}>
      {pages.map((page, i) => (
        <section key={i} className="sb-qr-page">
          {page.map(({ key, ...card }) => (
            <QrCard key={key} {...card} />
          ))}
        </section>
      ))}
    </div>
  );
}

function QrCard({ label, tag, cta, url }: Omit<QrCardData, "key">) {
  return (
    <article className="sb-qr-card">
      <div className="sb-qr-top">
        <span className="inline-flex items-center gap-1.5">
          <BoltMark size={22} />
          <span className="sb-wordmark">swingbus</span>
        </span>
        {tag && <span className="sb-qr-tag">{tag}</span>}
      </div>
      {/* Non-breaking space keeps "Food Trucks /" together: no line starts with the slash. */}
      <h2 className="sb-qr-label">{label.replace(/ \//g, "\u00a0/")}</h2>
      {url ? (
        <QRCodeSVG value={url} level="M" marginSize={2} title={label} className="sb-qr-code" />
      ) : (
        <div className="sb-qr-code sb-qr-missing" aria-hidden="true" />
      )}
      <div>
        <p className="sb-qr-cta">{cta}</p>
        <p className="sb-qr-url">{url ? <BreakableUrl url={url} /> : "—"}</p>
      </div>
    </article>
  );
}

/** A link that doesn't fit on one line wraps after the host, not at a hyphen in the path. */
function BreakableUrl({ url }: { url: string }) {
  const cut = url.indexOf("/", url.indexOf("//") + 2);
  if (cut === -1) return <>{url}</>;
  return (
    <>
      {url.slice(0, cut)}
      <wbr />
      <span className="inline-block max-w-full">{url.slice(cut)}</span>
    </>
  );
}
