import { z } from 'zod';
import { distanceNm, type Aircraft, type LatLon, type Route } from '@flight/shared';
import { airportCity, isAirlineCallsign } from '../utils/lookups.js';
import { USER_AGENT } from './providers/http.js';
import type { RouteFallback } from './aeroapi.service.js';

// ADS-B carries no flight plan, so origin/destination come from adsbdb's
// callsign route database. (adsb.lol's routeset API refuses server requests.)
// An optional paid fallback (FlightAware) fills in what adsbdb misses.
const ADSBDB_CALLSIGN_URL = 'https://api.adsbdb.com/v0/callsign/';
const ROUTE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
/** Spread a cold start over several refreshes instead of bursting at the free API. */
const MAX_LOOKUPS_PER_CYCLE = 20;
const CONCURRENCY = 4;
const MAX_CACHE_ENTRIES = 5000;
/**
 * adsbdb's callsign routes are sometimes stale (flight numbers get reused), so
 * a route is only shown when the aircraft is roughly on the way: going via its
 * position may be at most this much longer than flying direct.
 */
const DETOUR_FACTOR = 1.25;
const DETOUR_SLACK_NM = 100;
/** The paid fallback is only spent on aircraft this close to home, nearest first. */
const DEFAULT_FALLBACK_RADIUS_NM = 30;

const airportSchema = z.object({
  iata_code: z.string().nullish(),
  icao_code: z.string().nullish(),
  municipality: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

const callsignResponseSchema = z.object({
  // An unknown callsign comes back as a string message instead of an object.
  response: z.union([
    z.object({ flightroute: z.object({ origin: airportSchema, destination: airportSchema }) }),
    z.string(),
  ]),
});

export interface RouteLookup {
  /**
   * Fills in `route` from the cache straight away and looks up unknown
   * callsigns in the background, so a slow route API never delays the picture.
   * New routes appear on the next refresh. Never throws.
   */
  enrich(aircraft: Aircraft[]): Aircraft[];
  /** Resolves when no background lookup is running. For tests. */
  idle(): Promise<void>;
}

type Ends = { from: LatLon; to: LatLon } | null;
type CacheEntry = {
  route: Route | null;
  ends: Ends;
  expires: number;
  /** Set once the fallback has been asked, so a callsign is never paid for twice. */
  fallbackAsked: boolean;
};

const latLon = (a: z.infer<typeof airportSchema>): LatLon | null =>
  a.latitude != null && a.longitude != null ? { lat: a.latitude, lon: a.longitude } : null;

/** True when the aircraft could be flying this route; unknown airport positions count as plausible. */
export function onTheWay(position: LatLon, ends: Ends): boolean {
  if (!ends) return true;
  const direct = distanceNm(ends.from, ends.to);
  const via = distanceNm(ends.from, position) + distanceNm(position, ends.to);
  return via <= direct * DETOUR_FACTOR + DETOUR_SLACK_NM;
}

export function createRouteLookup(
  options: {
    baseUrl?: string;
    now?: () => number;
    fetchFn?: typeof fetch;
    /** Asked for routes adsbdb doesn't know or gets wrong, near `home`. */
    fallback?: RouteFallback;
    home?: LatLon;
    fallbackRadiusNm?: number;
  } = {},
): RouteLookup {
  const {
    baseUrl = ADSBDB_CALLSIGN_URL,
    now = Date.now,
    fetchFn = fetch,
    fallback,
    home,
    fallbackRadiusNm = DEFAULT_FALLBACK_RADIUS_NM,
  } = options;
  const cache = new Map<string, CacheEntry>();
  let pending: Promise<void> | null = null;

  function remember(
    callsign: string,
    route: Route | null,
    ttlMs: number,
    ends: Ends = null,
    fallbackAsked = false,
  ) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const t = now();
      for (const [key, entry] of cache) if (entry.expires <= t) cache.delete(key);
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    }
    cache.set(callsign, { route, ends, expires: now() + ttlMs, fallbackAsked });
  }

  async function lookup(callsign: string) {
    try {
      const response = await fetchFn(baseUrl + encodeURIComponent(callsign), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 404) {
        remember(callsign, null, ROUTE_TTL_MS);
        return;
      }
      if (!response.ok) throw new Error(`adsbdb responded ${response.status}`);

      const body = callsignResponseSchema.parse(await response.json());
      if (typeof body.response === 'string') {
        remember(callsign, null, ROUTE_TTL_MS);
        return;
      }
      const { origin, destination } = body.response.flightroute;
      const from = origin.iata_code || origin.icao_code;
      const to = destination.iata_code || destination.icao_code;
      const route: Route | null =
        from && to
          ? {
              origin: from,
              destination: to,
              originCity: airportCity(from) ?? origin.municipality ?? null,
              destinationCity: airportCity(to) ?? destination.municipality ?? null,
            }
          : null;
      const fromPos = latLon(origin);
      const toPos = latLon(destination);
      remember(
        callsign,
        route,
        ROUTE_TTL_MS,
        fromPos && toPos ? { from: fromPos, to: toPos } : null,
      );
    } catch (err) {
      console.warn(
        `Route lookup for ${callsign} failed:`,
        err instanceof Error ? err.message : err,
      );
      remember(callsign, null, FAILURE_BACKOFF_MS);
    }
  }

  async function askFallback(callsign: string) {
    if (!fallback?.take()) return;
    try {
      const route = await fallback.find(callsign);
      // A live flight plan needs no on-the-way check.
      remember(callsign, route, ROUTE_TTL_MS, null, true);
    } catch (err) {
      console.warn(
        `Fallback route lookup for ${callsign} failed:`,
        err instanceof Error ? err.message : err,
      );
      const entry = cache.get(callsign);
      if (entry) entry.fallbackAsked = true;
    }
  }

  async function lookupAll(callsigns: string[], fallbackCallsigns: string[]) {
    const queue = callsigns.slice(0, MAX_LOOKUPS_PER_CYCLE);
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await lookup(next);
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // One at a time: the budget decides how many go out, and the nearest go first.
    for (const callsign of fallbackCallsigns) await askFallback(callsign);
  }

  /** Near aircraft whose adsbdb answer is missing or implausible, nearest first. */
  function fallbackCandidates(aircraft: Aircraft[], t: number): string[] {
    if (!fallback || !home) return [];
    const near: { callsign: string; distance: number }[] = [];
    for (const a of aircraft) {
      if (!isAirlineCallsign(a.callsign)) continue;
      const cached = cache.get(a.callsign);
      if (!cached || cached.expires <= t || cached.fallbackAsked) continue;
      if (cached.route && onTheWay(a, cached.ends)) continue;
      const distance = distanceNm(home, a);
      if (distance <= fallbackRadiusNm) near.push({ callsign: a.callsign, distance });
    }
    return near.sort((x, y) => x.distance - y.distance).map((n) => n.callsign);
  }

  return {
    enrich(aircraft) {
      const t = now();
      const needed = new Set<string>();
      for (const a of aircraft) {
        if (!isAirlineCallsign(a.callsign)) continue;
        const cached = cache.get(a.callsign);
        if (!cached || cached.expires <= t) needed.add(a.callsign);
      }

      const misses = fallbackCandidates(aircraft, t);
      if ((needed.size > 0 || misses.length > 0) && !pending) {
        pending = lookupAll([...needed], misses).finally(() => {
          pending = null;
        });
      }

      return aircraft.map((a) => {
        const cached = a.callsign ? cache.get(a.callsign) : undefined;
        return cached?.route && onTheWay(a, cached.ends) ? { ...a, route: cached.route } : a;
      });
    },
    idle: () => pending ?? Promise.resolve(),
  };
}

/** A lookup that adds nothing, for when route enrichment is turned off. */
export const noRouteLookup: RouteLookup = { enrich: (aircraft) => aircraft, idle: async () => {} };
