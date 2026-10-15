import { lazy, Suspense } from 'react';
import { DEFAULT_RANGE_NM, RANGES_NM, type RangeNm } from '@flight/shared';
import { StatusOverlay, VIEWS, type View } from '../components/StatusOverlay';
import { useAircraft, type AircraftSnapshot } from '../features/aircraft/useAircraft';
import { aircraftInRange } from '../features/aircraft/inRange';
import { FlightBoard } from '../features/board/FlightBoard';
import { RadarScope } from '../features/radar/RadarScope';
import { usePersistentState } from '../hooks/usePersistentState';
import { useWakeLock } from '../hooks/useWakeLock';

// Leaflet only loads when the map view is opened, keeping the radar bundle small.
const FlightMap = lazy(() =>
  import('../features/map/FlightMap').then((m) => ({ default: m.FlightMap })),
);

const parseRange = (raw: string) => RANGES_NM.find((r) => String(r) === raw) ?? null;
const parseView = (raw: string): View | null => VIEWS.find((v) => v === raw) ?? null;

function statusFor(
  data: AircraftSnapshot | undefined,
  isPending: boolean,
  isError: boolean,
): { label: string; tone: 'ok' | 'warn' | 'alert' } {
  if (isPending) return { label: 'Acquiring…', tone: 'warn' };
  if (!data) return { label: 'Feed offline · retrying', tone: 'alert' };
  const time = new Date(data.fetchedAt).toLocaleTimeString([], { hour12: false });
  if (isError || data.stale) return { label: `Stale · ${time}`, tone: 'alert' };
  return { label: `Upd ${time}`, tone: 'ok' };
}

export function DisplayPage() {
  useWakeLock();
  const [rangeNm, setRangeNm] = usePersistentState<RangeNm>(
    'range-nm',
    DEFAULT_RANGE_NM,
    parseRange,
  );
  const [view, setView] = usePersistentState<View>('view', 'radar', parseView);
  const { data, isPending, isError } = useAircraft();

  const inRange = data ? aircraftInRange(data, rangeNm) : [];
  const cycleRange = () => {
    const next = RANGES_NM[(RANGES_NM.indexOf(rangeNm) + 1) % RANGES_NM.length]!;
    setRangeNm(next);
  };

  return (
    <main className="relative h-full w-full">
      {view === 'radar' && (
        <>
          <RadarScope snapshot={data} rangeNm={rangeNm} />
          {data && inRange.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-sm tracking-widest text-amber-dim">
              NO TRAFFIC WITHIN {rangeNm} NM
            </p>
          )}
        </>
      )}
      {view === 'map' &&
        (data ? (
          <Suspense fallback={<p className="py-32 text-center text-amber-muted">LOADING MAP…</p>}>
            <FlightMap snapshot={data} rangeNm={rangeNm} />
          </Suspense>
        ) : (
          <p className="py-32 text-center text-amber-muted italic">
            {isPending ? 'SCANNING AIRSPACE…' : 'CONNECTION ERROR'}
          </p>
        ))}
      {view === 'board' && (
        <div className="h-full overflow-y-auto px-4 pt-16 pb-12">
          {data ? (
            <FlightBoard aircraft={inRange} />
          ) : (
            <p className="py-16 text-center text-amber-muted italic">
              {isPending ? 'SCANNING AIRSPACE…' : 'CONNECTION ERROR'}
            </p>
          )}
        </div>
      )}
      <StatusOverlay
        rangeNm={rangeNm}
        onCycleRange={cycleRange}
        view={view}
        onSelectView={setView}
        count={data ? inRange.length : null}
        status={statusFor(data, isPending, isError)}
      />
    </main>
  );
}
