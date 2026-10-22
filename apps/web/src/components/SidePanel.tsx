import type { Aircraft, LatLon, RangeNm } from '@flight/shared';
import type { ThemeName } from '../lib/theme';
import type { Status } from '../features/aircraft/status';
import { AircraftList, NothingOverhead, SkeletonRows } from '../features/list/AircraftList';
import { Controls, type View } from './Controls';
import { Headline } from './Headline';
import { StatusLine } from './StatusLine';

type Props = {
  view: View;
  onSelectView: (view: View) => void;
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
  rangeNm: RangeNm;
  onCycleRange: () => void;
  clock: string;
  status: Status;
  feed: string | undefined;
  place: string | undefined;
  home: LatLon | undefined;
  /** In range, sorted for the list; null before the first picture. */
  aircraft: Aircraft[] | null;
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
};

/** The right-hand panel beside the scope and the map (below them on a phone): controls, header, status and the list. */
export function SidePanel(props: Props) {
  const { status, aircraft, home } = props;
  return (
    <aside className="absolute inset-y-0 right-0 flex w-[400px] flex-col gap-[18px] border-l border-line bg-panel p-6 max-md:top-auto max-md:h-[45%] max-md:w-full max-md:gap-3 max-md:border-t max-md:border-l-0 max-md:p-4">
      <Controls
        view={props.view}
        onSelectView={props.onSelectView}
        theme={props.theme}
        onSelectTheme={props.onSelectTheme}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-4">
          <Headline
            size="panel"
            count={aircraft?.length ?? null}
            rangeNm={props.rangeNm}
            onCycleRange={props.onCycleRange}
            place={props.place}
          />
          <time className="font-mono text-[28px] leading-none font-normal tracking-[-0.02em]">
            {props.clock}
          </time>
        </div>
        <StatusLine status={status} feed={props.feed} />
      </div>
      {status.kind === 'acquiring' ? (
        <SkeletonRows />
      ) : aircraft && home ? (
        aircraft.length === 0 ? (
          <NothingOverhead rangeNm={props.rangeNm} onCycleRange={props.onCycleRange} />
        ) : (
          <AircraftList
            aircraft={aircraft}
            home={home}
            selectedHex={props.selectedHex}
            onSelect={props.onSelect}
            dimmed={status.kind === 'stale'}
          />
        )
      ) : null}
    </aside>
  );
}
