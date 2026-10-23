import { ClockIcon } from "@/components/icons";
import {
  clockLabel,
  hoursLabel,
  opensLabel,
  statusOf,
  stopWindows,
  type StopServiceStatus,
} from "@/lib/service-hours";
import type { Stop, StopId } from "@/lib/types";

type HoursState = { stops: Stop[]; serviceStatus: Record<StopId, StopServiceStatus> };

/** Stops with limited hours, closed ones first. */
function limitedStops(state: HoursState | null) {
  return (state?.stops ?? [])
    .filter((stop) => stopWindows(stop) !== null)
    .map((stop) => ({ stop, status: statusOf(state, stop.id) }))
    .sort((a, b) => Number(a.status.open) - Number(b.status.open));
}

/** Driver view: stops riders can't request right now. */
export function ClosedStopsNote({ state }: { state: HoursState | null }) {
  const closed = limitedStops(state).filter((row) => !row.status.open);
  if (closed.length === 0) return null;
  return (
    <div className="rounded-xl bg-foam px-3.5 pt-3 pb-1">
      <p className="sb-label flex items-center gap-1.5">
        <ClockIcon size={14} />
        Closed now
      </p>
      <ul>
        {closed.map(({ stop, status }) => (
          <li key={stop.id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold">{stop.name}</span>
            <span className="shrink-0 text-sm font-semibold">{opensLabel(status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ground control: every stop with limited hours and whether it's in service. */
export function ServiceHoursPanel({ state }: { state: HoursState | null }) {
  const rows = limitedStops(state);
  if (rows.length === 0) return null;
  return (
    <section className="sb-panel sb-rise mb-4">
      <h2 className="sb-brand text-2xl">Service hours</h2>
      <ul className="mt-1">
        {rows.map(({ stop, status }) => (
          <li key={stop.id} className="sb-row cursor-default">
            {status.open ? (
              <span className="sb-pill w-[4.75rem] justify-center text-xs">
                <span className="sb-live-dot" />
                Open
              </span>
            ) : (
              <span className="sb-pill sb-pill-dark w-[4.75rem] justify-center text-xs">Closed</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {stop.shortCode} · {stop.name}
              </span>
              <span className="block text-xs text-ink-soft">{hoursLabel(stop)}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold">
              {status.open
                ? status.closesAt && `Until ${clockLabel(status.closesAt)}`
                : opensLabel(status)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
