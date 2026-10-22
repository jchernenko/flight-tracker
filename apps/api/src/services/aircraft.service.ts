import { distanceNm, snapToGrid, type AircraftResponse, type LatLon } from '@flight/shared';
import type { FeedProvider } from './providers/index.js';
import type { RouteLookup } from './route-lookup.service.js';
import { AppError } from '../utils/errors.js';

export interface AircraftService {
  /**
   * Latest aircraft picture around home, or around `at` (a phone's position),
   * refreshed from upstream at most once per cache window per area.
   */
  get(at?: LatLon): Promise<AircraftResponse>;
}

type Picture = Omit<AircraftResponse, 'servedAt'>;

/** One cached picture and its refresh window. */
type Area = {
  center: LatLon;
  last: Picture | null;
  /**
   * When the window started, measured from the start of the upstream call so a
   * slow fetch doesn't stretch the window past the clients' poll interval.
   */
  windowStart: number;
  inflight: Promise<Picture> | null;
};

/** Phones this close to home share the home picture. */
const HOME_AREA_NM = 2;
/** Away-from-home areas kept at once; the least recently asked for is dropped. Bounds upstream load. */
const MAX_AWAY_AREAS = 6;

export function createAircraftService(options: {
  provider: FeedProvider;
  routes: RouteLookup;
  center: LatLon;
  radiusNm: number;
  ttlMs: number;
  now?: () => number;
}): AircraftService {
  const { provider, routes, center: home, radiusNm, ttlMs, now = Date.now } = options;
  const newArea = (center: LatLon): Area => ({
    center,
    last: null,
    windowStart: -Infinity,
    inflight: null,
  });
  const homeArea = newArea(home);
  // Insertion order is recency: re-inserted on every request.
  const away = new Map<string, Area>();

  function areaFor(at: LatLon | undefined): Area {
    if (!at || distanceNm(home, at) <= HOME_AREA_NM) return homeArea;
    const center = snapToGrid(at);
    const key = `${center.lat},${center.lon}`;
    const area = away.get(key) ?? newArea(center);
    away.delete(key);
    away.set(key, area);
    if (away.size > MAX_AWAY_AREAS) away.delete(away.keys().next().value!);
    return area;
  }

  async function refresh(area: Area): Promise<Picture> {
    const started = now();
    area.windowStart = started;
    try {
      const aircraft = routes.enrich(await provider.fetchAircraft(area.center, radiusNm));
      area.last = {
        center: area.center,
        radiusNm,
        fetchedAt: new Date(started).toISOString(),
        stale: false,
        aircraft,
      };
      return area.last;
    } catch (err) {
      console.error(`Feed "${provider.name}" failed:`, err instanceof Error ? err.message : err);
      // Keep serving the last good picture; either way, wait a full window before retrying.
      if (!area.last) throw new AppError(502, 'Flight feed is unavailable');
      area.last = { ...area.last, stale: true };
      return area.last;
    }
  }

  async function current(area: Area): Promise<Picture> {
    if (now() - area.windowStart < ttlMs) {
      if (area.inflight) return area.inflight;
      if (area.last) return area.last;
      throw new AppError(502, 'Flight feed is unavailable');
    }
    area.inflight ??= refresh(area).finally(() => {
      area.inflight = null;
    });
    return area.inflight;
  }

  return {
    async get(at) {
      const picture = await current(areaFor(at));
      return { ...picture, servedAt: new Date(now()).toISOString() };
    },
  };
}
