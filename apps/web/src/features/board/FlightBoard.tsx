import type { ReactNode } from 'react';
import type { Aircraft, RangeNm } from '@flight/shared';
import type { ThemeName } from '../../lib/theme';
import type { Status } from '../aircraft/status';
import { Controls, type View } from '../../components/Controls';
import { Headline } from '../../components/Headline';
import { aircraftColor, KindChip, NothingOverhead } from '../list/AircraftList';
import { isEmergency } from '../radar/tags';
import {
  altitudeText,
  headingText,
  ident,
  operatorLine,
  routeCities,
  routeCode,
  speedText,
  trendArrow,
} from '../aircraft/format';

type Props = {
  view: View;
  onSelectView: (view: View) => void;
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
  rangeNm: RangeNm;
  /** What tapping the range changes it to. */
  nextRangeNm: RangeNm;
  onCycleRange: () => void;
  clock: string;
  status: Status;
  feed: string | undefined;
  place: string | undefined;
  /** In range, sorted; null before the first picture. */
  aircraft: Aircraft[] | null;
  onRetry: () => void;
};

/** FlightWall-style board: a card per aircraft, four across (one across on a phone). */
export function FlightBoard(props: Props) {
  const { status, aircraft } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-8 px-8 max-md:h-auto max-md:flex-col-reverse max-md:items-stretch max-md:gap-3 max-md:p-4">
        <Headline
          size="board"
          count={aircraft?.length ?? null}
          rangeNm={props.rangeNm}
          onCycleRange={props.onCycleRange}
          place={props.place}
          suffix={props.clock}
        />
        <Controls
          view={props.view}
          onSelectView={props.onSelectView}
          theme={props.theme}
          onSelectTheme={props.onSelectTheme}
          className="w-[520px] shrink-0 max-md:w-full"
        />
      </header>
      <div className="mx-8 mb-8 min-h-0 flex-1 max-md:mx-4 max-md:mb-4">
        {status.kind === 'offline' ? (
          <Offline feed={props.feed} onRetry={props.onRetry} />
        ) : status.kind === 'acquiring' ? (
          <Grid count={8}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="rounded-[16px] border border-line bg-panel" aria-hidden />
            ))}
          </Grid>
        ) : aircraft && aircraft.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-[16px] border border-line">
            <NothingOverhead
              rangeNm={props.rangeNm}
              nextRangeNm={props.nextRangeNm}
              onCycleRange={props.onCycleRange}
            />
          </div>
        ) : aircraft ? (
          <Grid count={aircraft.length} dimmed={status.kind === 'stale'}>
            {aircraft.map((a) => (
              <BoardCard key={a.hex} a={a} />
            ))}
          </Grid>
        ) : null}
      </div>
    </div>
  );
}

/** Up to eight cards fill two rows; more scroll in fixed-height rows. */
function Grid({
  count,
  dimmed,
  children,
}: {
  count: number;
  dimmed?: boolean;
  children: ReactNode;
}) {
  const fill = count <= 8;
  return (
    <div
      className={`no-scrollbar grid h-full grid-cols-4 gap-4 overflow-y-auto max-md:auto-rows-[200px] max-md:grid-cols-1 max-md:gap-3 ${
        fill ? 'grid-rows-2 max-md:grid-rows-none' : 'auto-rows-[300px]'
      } ${dimmed ? 'opacity-45' : ''}`}
    >
      {children}
    </div>
  );
}

function BoardCard({ a }: { a: Aircraft }) {
  const color = aircraftColor(a);
  const emergency = isEmergency(a);
  const arrow = trendArrow(a);
  return (
    <article
      className={`flex min-h-0 flex-col gap-3 rounded-[16px] border p-5 ${
        emergency ? 'border-alert bg-alert-t' : 'border-line bg-panel'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={`text-[18px] font-semibold ${emergency ? 'text-alert' : ''}`}>
            {ident(a)}
          </span>
          <KindChip a={a} />
        </span>
        <span className="min-w-0 truncate text-[12px] text-muted">
          {emergency ? `SQUAWK ${a.squawk}` : operatorLine(a)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-mono text-[28px] leading-tight font-medium tracking-[-0.02em]">
          {routeCode(a, ' → ')}
        </div>
        <div className="truncate text-[13px] text-muted">{routeCities(a)}</div>
      </div>
      <div className="mt-auto flex items-center gap-2.5">
        <span className="size-[9px] shrink-0 rounded-full" style={{ background: color }} />
        <span className="font-mono text-[26px] leading-none font-medium" style={{ color }}>
          {altitudeText(a)}
        </span>
        {!a.onGround && a.altitudeFt !== null && (
          <span className="text-[13px] text-muted">ft{arrow && ` ${arrow}`}</span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line2 pt-2.5 font-mono text-[13px] text-muted">
        <span>{speedText(a)} kt</span>
        <span className="flex items-center gap-1.5">
          {a.trackDeg !== null && (
            <span
              className="inline-block text-text"
              style={{ transform: `rotate(${a.trackDeg}deg)` }}
            >
              ↑
            </span>
          )}
          {headingText(a)}
        </span>
        <span>{a.type ?? '—'}</span>
      </div>
    </article>
  );
}

function Offline({ feed, onRetry }: { feed: string | undefined; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-line">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-alert">
          <span className="size-2.5 rounded-full bg-alert" />
        </span>
        <h2 className="text-[26px] font-semibold">Feed offline</h2>
        <p className="text-[15px] text-muted">
          Can&apos;t reach {feed ?? 'the feed'}. Retrying every 5 seconds.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 h-11 rounded-[12px] bg-act-bg px-5 text-[14px] font-medium text-act-fg"
        >
          Retry now
        </button>
      </div>
    </div>
  );
}
