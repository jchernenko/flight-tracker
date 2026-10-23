import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { DEFAULT_RANGE_NM, RANGES_NM, type RangeNm } from '@flight/shared';
import { Controls, VIEWS, type View } from '../components/Controls';
import { nextRange, rangeFor } from '../components/Headline';
import { AltitudeLegend, ScopeBanners, ScopeMessage } from '../components/ScopeOverlays';
import { SidePanel } from '../components/SidePanel';
import { useAircraft } from '../features/aircraft/useAircraft';
import { useFeedInfo } from '../features/aircraft/useFeedInfo';
import { aircraftInRange } from '../features/aircraft/inRange';
import { clockText, sortForList } from '../features/aircraft/format';
import { statusFor } from '../features/aircraft/status';
import { FlightBoard } from '../features/board/FlightBoard';
import { FollowButton } from '../features/follow/FollowButton';
import { useFollowMe } from '../features/follow/useFollowMe';
import { RadarScope } from '../features/radar/RadarScope';
import { isEmergency } from '../features/radar/tags';
import { useNow } from '../hooks/useNow';
import { usePersistentState } from '../hooks/usePersistentState';
import { useWakeLock } from '../hooks/useWakeLock';
import { applyTheme, THEME_NAMES, THEMES, type ThemeName } from '../lib/theme';

// Leaflet only loads when the map view is opened, keeping the radar bundle small.
const FlightMap = lazy(() =>
  import('../features/map/FlightMap').then((m) => ({ default: m.FlightMap })),
);

const parseRange = (raw: string) => RANGES_NM.find((r) => String(r) === raw) ?? null;
const parseView = (raw: string): View | null => VIEWS.find((v) => v === raw) ?? null;
const parseTheme = (raw: string): ThemeName | null => THEME_NAMES.find((t) => t === raw) ?? null;

export function DisplayPage() {
  useWakeLock();
  const now = useNow();
  const [storedRange, setRangeNm] = usePersistentState<RangeNm>(
    'range-nm',
    DEFAULT_RANGE_NM,
    parseRange,
  );
  const [view, setView] = usePersistentState<View>('view', 'radar', parseView);
  // A wide map range shows as 60 nm on the radar and board, and comes back on the map.
  const rangeNm = rangeFor(storedRange, view);
  const nextRangeNm = nextRange(rangeNm, view);
  const [themeName, setThemeName] = usePersistentState<ThemeName>('theme', 'dark', parseTheme);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const follow = useFollowMe();
  const { data, isPending, isError, refetch } = useAircraft(follow.position, rangeNm);
  const info = useFeedInfo();
  // The scope turns only once there's a heading: the compass, or GPS direction of travel.
  const heading = follow.on && (follow.compass === 'ok' || follow.moving) ? follow.heading : null;

  const theme = THEMES[themeName];
  useLayoutEffect(() => applyTheme(theme), [theme]);

  const status = statusFor(data, isPending, isError);
  const inRange = data ? aircraftInRange(data, rangeNm) : null;
  const emergencies = inRange?.filter(isEmergency) ?? [];
  const cycleRange = () => setRangeNm(nextRangeNm);

  // Only aircraft in range can be selected; drop the selection when it leaves.
  const selectable = (hex: string | null) =>
    hex === null || (inRange?.some((a) => a.hex === hex) ?? false);
  const selected = selectable(selectedHex) ? selectedHex : null;
  useEffect(() => {
    if (selectedHex !== selected) setSelectedHex(selected);
  }, [selectedHex, selected]);
  const select = (hex: string | null) => setSelectedHex(selectable(hex) ? hex : null);
  // Nearest first; a selected aircraft jumps to the top until it's deselected.
  const listed = data && inRange ? sortForList(inRange, data.center, selected) : null;

  const shared = {
    view,
    onSelectView: setView,
    theme: themeName,
    onSelectTheme: setThemeName,
    rangeNm,
    nextRangeNm,
    onCycleRange: cycleRange,
    status,
    feed: info?.feed,
    place: follow.position ? 'Your location' : info?.place,
    aircraft: listed,
  };

  if (view === 'board') {
    return (
      <main className="relative h-full w-full">
        <FlightBoard {...shared} clock={clockText(now)} onRetry={() => void refetch()} />
      </main>
    );
  }

  const stale = status.kind === 'stale';
  const scopeMessage =
    status.kind === 'acquiring'
      ? 'Acquiring feed…'
      : inRange && inRange.length === 0
        ? `No aircraft within ${rangeNm} nm`
        : null;

  return (
    <main className="relative h-full w-full">
      {/* View and theme switches sit in a bar above the scope or map. */}
      <div className="absolute top-0 left-0 right-[400px] flex h-[66px] items-center px-4 max-md:right-0">
        <Controls
          view={view}
          onSelectView={setView}
          theme={themeName}
          onSelectTheme={setThemeName}
          className="w-[460px] max-md:w-full"
        />
      </div>
      <section className="absolute top-[66px] bottom-0 left-0 right-[400px] overflow-hidden max-md:right-0 max-md:bottom-[45%]">
        {view === 'radar' ? (
          <RadarScope
            snapshot={data}
            rangeNm={rangeNm}
            theme={theme}
            selectedHex={selected}
            stale={stale}
            acquiring={status.kind === 'acquiring'}
            heading={heading}
            onSelect={select}
          />
        ) : (
          data && (
            <Suspense fallback={null}>
              <FlightMap
                snapshot={data}
                rangeNm={rangeNm}
                theme={theme}
                selectedHex={selected}
                stale={stale}
                heading={heading}
                onSelect={select}
              />
            </Suspense>
          )
        )}
        {scopeMessage && <ScopeMessage>{scopeMessage}</ScopeMessage>}
        <ScopeBanners status={status} emergencies={emergencies} feed={info?.feed} />
        <AltitudeLegend />
        <FollowButton follow={follow} className="absolute right-5 bottom-5 z-[1100]" />
      </section>
      <SidePanel
        {...shared}
        clock={clockText(now)}
        home={data?.center}
        selectedHex={selected}
        onSelect={select}
      />
    </main>
  );
}
