import type { Aircraft, LatLon, RangeNm } from '@flight/shared';
import { altitudeVar } from '../../lib/theme';
import { isEmergency } from '../radar/tags';
import { nextRange } from '../../components/Headline';
import {
  altitudeText,
  detailFooter,
  headingText,
  ident,
  operatorLine,
  routeCities,
  routeCode,
  speedText,
  squawkMeaning,
  verticalSpeedText,
} from '../aircraft/format';

/** Altitude colour, or alert red for an emergency. Military traffic is never red. */
export const aircraftColor = (a: Aircraft): string =>
  isEmergency(a) ? 'var(--color-alert)' : altitudeVar(a.onGround ? 0 : a.altitudeFt);

export function MilChip() {
  return (
    <span className="rounded-[4px] border border-dim px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium tracking-[.08em] text-text2">
      MIL
    </span>
  );
}

type ListProps = {
  /** In range and already sorted: emergencies first, then highest first. */
  aircraft: Aircraft[];
  home: LatLon;
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
  dimmed: boolean;
};

export function AircraftList({ aircraft, home, selectedHex, onSelect, dimmed }: ListProps) {
  return (
    <div
      className={`no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1 ${dimmed ? 'opacity-45' : ''}`}
    >
      {aircraft.map((a) => {
        if (isEmergency(a)) return <EmergencyCard key={a.hex} a={a} home={home} />;
        const selected = a.hex === selectedHex;
        const toggle = () => onSelect(selected ? null : a.hex);
        return selected ? (
          <SelectedCard key={a.hex} a={a} home={home} onClick={toggle} />
        ) : (
          <Row key={a.hex} a={a} onClick={toggle} />
        );
      })}
    </div>
  );
}

function Row({ a, onClick }: { a: Aircraft; onClick: () => void }) {
  const color = aircraftColor(a);
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-14 w-full grid-cols-[10px_1fr_auto] items-center gap-3 border-b border-line2 px-1 text-left"
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[15px] leading-5 font-semibold">{ident(a)}</span>
          {a.military && <MilChip />}
        </span>
        <span className="block truncate text-[13px] leading-[18px] text-muted">
          {routeCities(a)}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-mono text-[14px] leading-5 font-medium" style={{ color }}>
          {altitudeText(a)}
        </span>
        <span className="block font-mono text-[12px] leading-[18px] text-dim">{routeCode(a)}</span>
      </span>
    </button>
  );
}

function Stats({ a, color }: { a: Aircraft; color: string }) {
  const stats = [
    { label: 'Alt ft', value: altitudeText(a), color },
    { label: 'V/S', value: verticalSpeedText(a) },
    { label: 'Kt', value: speedText(a) },
    { label: 'Hdg', value: headingText(a) },
  ];
  return (
    <div className="flex justify-between">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-[11px] text-muted">{s.label}</div>
          <div className="font-mono text-[16px]" style={s.color ? { color: s.color } : undefined}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Endpoint({ code, city, align }: { code: string; city: string; align: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="font-mono text-[24px] leading-tight font-medium">{code}</div>
      <div className="truncate text-[13px] text-muted">{city}</div>
    </div>
  );
}

function SelectedCard({ a, home, onClick }: { a: Aircraft; home: LatLon; onClick: () => void }) {
  const color = aircraftColor(a);
  const route = a.route;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      aria-expanded
      className="my-1.5 flex w-full flex-col gap-3.5 rounded-[14px] border border-line bg-sel-bg p-4 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: color, boxShadow: '0 0 0 4px var(--color-line)' }}
          />
          <span className="truncate text-[20px] font-semibold">{ident(a)}</span>
          {a.military && <MilChip />}
        </div>
        <span className="truncate text-[13px] text-muted">{operatorLine(a)}</span>
      </div>
      {route ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <Endpoint code={route.origin} city={route.originCity ?? '—'} align="left" />
          <span className="h-px w-7 bg-dim" />
          <Endpoint code={route.destination} city={route.destinationCity ?? '—'} align="right" />
        </div>
      ) : (
        <div className="text-[13px] text-muted">{routeCities(a)}</div>
      )}
      <Stats a={a} color={color} />
      <div className="truncate text-[12px] text-muted">{detailFooter(home, a)}</div>
    </div>
  );
}

function EmergencyCard({ a, home }: { a: Aircraft; home: LatLon }) {
  const operator = operatorLine(a);
  return (
    <div className="my-1.5 flex flex-col gap-3 rounded-[14px] border border-alert bg-alert-t p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-[6px] bg-alert px-2 py-[3px] font-mono text-[12px] font-semibold text-bg">
          SQUAWK {a.squawk}
        </span>
        <span className="text-[13px] font-medium text-alert">{squawkMeaning(a.squawk)}</span>
      </div>
      <div>
        <div className="text-[20px] font-semibold">{ident(a)}</div>
        <div className="truncate text-[13px] text-muted">
          {[operator, a.route ? routeCities(a) : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Stats a={a} color="var(--color-alert)" />
      <div className="truncate text-[12px] text-muted">{detailFooter(home, a)}</div>
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="grid h-14 grid-cols-[10px_1fr_auto] items-center gap-3 border-b border-line2 px-1"
        >
          <span className="size-2 rounded-full bg-line" />
          <span className="flex flex-col gap-2">
            <span className="h-[11px] w-[88px] rounded-sm bg-line" />
            <span className="h-[9px] w-[150px] rounded-sm bg-line" />
          </span>
          <span className="flex flex-col items-end gap-2">
            <span className="h-[11px] w-[52px] rounded-sm bg-line" />
            <span className="h-[9px] w-[64px] rounded-sm bg-line" />
          </span>
        </div>
      ))}
    </div>
  );
}

type EmptyProps = { rangeNm: RangeNm; onCycleRange: () => void };

/** Nothing in range: says so, and offers a wider range when there is one. */
export function NothingOverhead({ rangeNm, onCycleRange }: EmptyProps) {
  const wider = nextRange(rangeNm);
  return (
    <div className="flex flex-col gap-2 pt-4">
      <h2 className="text-[20px] font-semibold">Nothing overhead right now</h2>
      <p className="text-[14px] text-muted">
        New aircraft show up here the moment they come within range.
      </p>
      {wider > rangeNm && (
        <button
          type="button"
          onClick={onCycleRange}
          className="mt-3 h-11 self-start rounded-[12px] border border-line bg-bg px-4 text-[14px] font-medium"
        >
          Widen range to {wider} nm
        </button>
      )}
    </div>
  );
}
