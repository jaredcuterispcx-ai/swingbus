"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ChevronIcon, PinIcon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out";
import { DEFAULT_ARRIVAL_RADIUS_M } from "@/lib/geo";
import { serviceLabel } from "@/lib/stops";
import type { Stop, StopService } from "@/lib/types";

type Draft = {
  name: string;
  shortCode: string;
  description: string;
  service: StopService | "";
  lat: string;
  lng: string;
  arrivalRadiusM: string;
};

const SERVICES: { value: StopService; label: string }[] = [
  { value: "onsite", label: "Onsite" },
  { value: "offsite", label: "Offsite" },
  { value: "both", label: "Both" },
];

function toDraft(stop?: Stop): Draft {
  return {
    name: stop?.name ?? "",
    shortCode: stop?.shortCode ?? "",
    description: stop?.description ?? "",
    service: stop?.service ?? "",
    lat: stop ? String(stop.lat) : "",
    lng: stop ? String(stop.lng) : "",
    arrivalRadiusM: stop?.arrivalRadiusM ? String(stop.arrivalRadiusM) : "",
  };
}

/** With a hemisphere letter, the letter alone sets the sign (S and W are negative). */
function signed(value: string, hemisphere: string | undefined, negative: "S" | "W"): string {
  if (!hemisphere) return value;
  const abs = value.replace(/^-/, "");
  return hemisphere.toUpperCase() === negative ? `-${abs}` : abs;
}

/**
 * Accepts "35.0012, -90.0145" or Apple Maps' "35.0012° N, 90.0145° W"
 * pasted into either coordinate field.
 */
function splitPair(value: string): [string, string] | null {
  const m = value.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i,
  );
  return m ? [signed(m[1], m[2], "S"), signed(m[3], m[4], "W")] : null;
}

export default function AdminPage() {
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stops", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load stops");
      setStops(data.stops);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load stops");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (method: string, body?: unknown, query = "") => {
      const res = await fetch(`/api/stops${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [],
  );

  async function restoreDefaults() {
    if (
      !confirm(
        "Replace every stop with the MEM shuttle sheet list? Custom stops and edits will be lost.",
      )
    ) {
      return;
    }
    try {
      await send("POST", { action: "restore_defaults" });
      setNotice("Restored MEM shuttle sheet stops");
      setOpenId(null);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <main className="sb-shell">
      <AppHeader
        backHref="/dispatch"
        title="Stops"
        right={
          <Link href="/stops" className="sb-pill">
            QR codes
          </Link>
        }
      />

      {notice && (
        <p className="mb-4 rounded-xl border border-[var(--line)] bg-surface px-3 py-2 text-sm text-ink-soft">
          {notice}
        </p>
      )}

      {loadError && (
        <div className="mb-4 rounded-xl bg-danger/10 px-3 py-3 text-sm text-danger">
          {loadError}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!stops && !loadError && <p className="text-sm text-ink-soft">Loading stops…</p>}

      {stops && (
        <>
          {adding ? (
            <StopEditor
              title="New stop"
              send={send}
              onDone={async (msg) => {
                setAdding(false);
                if (msg) setNotice(msg);
                await load();
              }}
            />
          ) : (
            <button
              type="button"
              className="sb-btn sb-btn-accent mb-4 w-full"
              onClick={() => {
                setAdding(true);
                setOpenId(null);
              }}
            >
              + Add stop
            </button>
          )}

          <ul className="space-y-2">
            {stops.map((stop) =>
              openId === stop.id ? (
                <li key={stop.id}>
                  <StopEditor
                    title={`Edit ${stop.name}`}
                    stop={stop}
                    send={send}
                    onDone={async (msg) => {
                      setOpenId(null);
                      if (msg) setNotice(msg);
                      await load();
                    }}
                  />
                </li>
              ) : (
                <li key={stop.id}>
                  <button
                    type="button"
                    className="sb-mode-row w-full text-left"
                    onClick={() => {
                      setOpenId(stop.id);
                      setAdding(false);
                      setNotice(null);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="sb-chip mb-0.5">
                        {stop.shortCode}
                        {stop.service ? ` · ${serviceLabel(stop.service)}` : ""}
                      </p>
                      <p className="sb-brand truncate text-lg">{stop.name}</p>
                      <p className="font-mono text-[11px] text-ink-soft">
                        {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                      </p>
                    </div>
                    <span className="shrink-0 text-ink-soft">
                      <ChevronIcon />
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>

          <button
            type="button"
            className="sb-btn sb-btn-ghost mt-6 w-full text-sm text-ink-soft"
            onClick={() => void restoreDefaults()}
          >
            Restore MEM shuttle sheet stops
          </button>
          <div className="mt-3 flex justify-center">
            <SignOutButton />
          </div>
        </>
      )}
    </main>
  );
}

function StopEditor({
  title,
  stop,
  send,
  onDone,
}: {
  title: string;
  stop?: Stop;
  send: (method: string, body?: unknown, query?: string) => Promise<unknown>;
  onDone: (message?: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(stop));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function setCoord(field: "lat" | "lng", value: string) {
    set({ [field]: value });
  }

  function trySplit(value: string): boolean {
    const pair = splitPair(value);
    if (pair) set({ lat: pair[0], lng: pair[1] });
    return Boolean(pair);
  }

  function coordHandlers(field: "lat" | "lng") {
    return {
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCoord(field, e.target.value),
      onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
        if (trySplit(e.clipboardData.getData("text"))) e.preventDefault();
      },
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        trySplit(e.target.value);
      },
    };
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share location");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
      },
      (err) => {
        setError(`Location: ${err.message || "unavailable"}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Enter submits without blurring, so a typed pair may not have been split yet.
    const pair = splitPair(draft.lat) ?? splitPair(draft.lng);
    if (pair) set({ lat: pair[0], lng: pair[1] });
    try {
      const body = {
        name: draft.name,
        shortCode: draft.shortCode,
        description: draft.description,
        service: draft.service || null,
        lat: pair ? pair[0] : draft.lat,
        lng: pair ? pair[1] : draft.lng,
        arrivalRadiusM: draft.arrivalRadiusM || null,
      };
      if (stop) await send("PATCH", { id: stop.id, ...body });
      else await send("POST", body);
      await onDone(stop ? `Saved ${draft.name}` : `Added ${draft.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!stop || !confirm(`Delete ${stop.name}? Its QR code will stop working.`)) return;
    setBusy(true);
    setError(null);
    try {
      await send("DELETE", undefined, `?id=${encodeURIComponent(stop.id)}`);
      await onDone(`Deleted ${stop.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  const latNum = Number(draft.lat);
  const lngNum = Number(draft.lng);
  const hasCoords =
    draft.lat !== "" && draft.lng !== "" && Number.isFinite(latNum) && Number.isFinite(lngNum);

  return (
    <form onSubmit={save} className="sb-panel sb-rise mb-4 space-y-4 border-leaf/40">
      <div className="flex items-center justify-between gap-2">
        <h2 className="sb-brand text-xl">{title}</h2>
        <button
          type="button"
          className="text-sm text-ink-soft underline"
          onClick={() => void onDone()}
        >
          Cancel
        </button>
      </div>

      <label className="block space-y-1.5">
        <span className="sb-label">Name</span>
        <input
          className="sb-input"
          required
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Macroharder East"
        />
      </label>

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <label className="block space-y-1.5">
          <span className="sb-label">Code</span>
          <input
            className="sb-input font-mono uppercase"
            maxLength={4}
            autoCapitalize="characters"
            value={draft.shortCode}
            onChange={(e) => set({ shortCode: e.target.value })}
            placeholder="Auto"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="sb-label">Description</span>
          <input
            className="sb-input"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Where exactly to wait"
          />
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="sb-label mb-1.5">Service</legend>
        <div className="grid grid-cols-3 gap-2">
          {SERVICES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={draft.service === s.value}
              className={`sb-seg ${draft.service === s.value ? "sb-seg-on" : ""}`}
              onClick={() => set({ service: draft.service === s.value ? "" : s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <span className="sb-label">Location</span>
        <button
          type="button"
          className="sb-btn sb-btn-ghost w-full"
          disabled={locating}
          onClick={useMyLocation}
        >
          <PinIcon />
          {locating ? "Getting GPS fix…" : "Use my location"}
        </button>
        {accuracy != null && (
          <p className="text-xs text-ink-soft">
            GPS accuracy ±{accuracy} m
            {accuracy > 50 ? " — step outside or wait a moment and try again" : ""}
          </p>
        )}
        {/* No inputMode="decimal": the iOS decimal keypad has no minus key or comma. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-[11px] text-ink-soft">Latitude</span>
            <input
              className="sb-input font-mono"
              required
              value={draft.lat}
              {...coordHandlers("lat")}
              placeholder="35.0012"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] text-ink-soft">Longitude</span>
            <input
              className="sb-input font-mono"
              required
              value={draft.lng}
              {...coordHandlers("lng")}
              placeholder="-90.0145"
            />
          </label>
        </div>
        <p className="text-xs text-ink-soft">
          Paste “lat, lng” into either box.
          {hasCoords && (
            <>
              {" "}
              <a
                className="text-leaf underline"
                href={`https://www.google.com/maps?q=${latNum},${lngNum}`}
                target="_blank"
                rel="noreferrer"
              >
                Check on map
              </a>
            </>
          )}
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="sb-label">Arrival radius (m)</span>
        <input
          className="sb-input"
          type="number"
          inputMode="numeric"
          min={10}
          max={1000}
          value={draft.arrivalRadiusM}
          onChange={(e) => set({ arrivalRadiusM: e.target.value })}
          placeholder={`${DEFAULT_ARRIVAL_RADIUS_M} (default)`}
        />
        <span className="block text-xs text-ink-soft">
          Drivers inside this distance are treated as at the stop.
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" className="sb-btn sb-btn-accent w-full" disabled={busy}>
        {busy ? "Saving…" : stop ? "Save changes" : "Add stop"}
      </button>
      {stop && (
        <button
          type="button"
          className="sb-btn sb-btn-ghost w-full text-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          Delete stop
        </button>
      )}
    </form>
  );
}
