import type { AircraftResponse, LatLon } from '@flight/shared';
import type { FeedProvider } from './providers/index.js';
import type { RouteLookup } from './route-lookup.service.js';
import { AppError } from '../utils/errors.js';

export interface AircraftService {
  /** Latest aircraft picture, refreshed from upstream at most once per cache window. */
  get(): Promise<AircraftResponse>;
}

type Picture = Omit<AircraftResponse, 'servedAt'>;

export function createAircraftService(options: {
  provider: FeedProvider;
  routes: RouteLookup;
  center: LatLon;
  radiusNm: number;
  ttlMs: number;
  now?: () => number;
}): AircraftService {
  const { provider, routes, center, radiusNm, ttlMs, now = Date.now } = options;
  let last: Picture | null = null;
  // When the window started, measured from the start of the upstream call so a
  // slow fetch doesn't stretch the window past the clients' poll interval.
  let windowStart = -Infinity;
  let inflight: Promise<Picture> | null = null;

  async function refresh(): Promise<Picture> {
    const started = now();
    windowStart = started;
    try {
      const aircraft = routes.enrich(await provider.fetchAircraft(center, radiusNm));
      last = {
        center,
        radiusNm,
        fetchedAt: new Date(started).toISOString(),
        stale: false,
        aircraft,
      };
      return last;
    } catch (err) {
      console.error(`Feed "${provider.name}" failed:`, err instanceof Error ? err.message : err);
      // Keep serving the last good picture; either way, wait a full window before retrying.
      if (!last) throw new AppError(502, 'Flight feed is unavailable');
      last = { ...last, stale: true };
      return last;
    }
  }

  async function current(): Promise<Picture> {
    if (now() - windowStart < ttlMs) {
      if (inflight) return inflight;
      if (last) return last;
      throw new AppError(502, 'Flight feed is unavailable');
    }
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    async get() {
      const picture = await current();
      return { ...picture, servedAt: new Date(now()).toISOString() };
    },
  };
}
