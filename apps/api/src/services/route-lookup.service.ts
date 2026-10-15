import { z } from 'zod';
import type { Aircraft, Route } from '@flight/shared';
import { airportCity, isAirlineCallsign } from '../utils/lookups.js';
import { USER_AGENT } from './providers/http.js';

// ADS-B carries no flight plan, so origin/destination come from adsbdb's
// callsign route database. (adsb.lol's routeset API refuses server requests.)
const ADSBDB_CALLSIGN_URL = 'https://api.adsbdb.com/v0/callsign/';
const ROUTE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
/** Spread a cold start over several refreshes instead of bursting at the free API. */
const MAX_LOOKUPS_PER_CYCLE = 20;
const CONCURRENCY = 4;
const MAX_CACHE_ENTRIES = 5000;

const airportSchema = z.object({
  iata_code: z.string().nullish(),
  icao_code: z.string().nullish(),
  municipality: z.string().nullish(),
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

type CacheEntry = { route: Route | null; expires: number };

export function createRouteLookup(
  options: { baseUrl?: string; now?: () => number; fetchFn?: typeof fetch } = {},
): RouteLookup {
  const { baseUrl = ADSBDB_CALLSIGN_URL, now = Date.now, fetchFn = fetch } = options;
  const cache = new Map<string, CacheEntry>();
  let pending: Promise<void> | null = null;

  function remember(callsign: string, route: Route | null, ttlMs: number) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const t = now();
      for (const [key, entry] of cache) if (entry.expires <= t) cache.delete(key);
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    }
    cache.set(callsign, { route, expires: now() + ttlMs });
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
      remember(callsign, route, ROUTE_TTL_MS);
    } catch (err) {
      console.warn(
        `Route lookup for ${callsign} failed:`,
        err instanceof Error ? err.message : err,
      );
      remember(callsign, null, FAILURE_BACKOFF_MS);
    }
  }

  async function lookupAll(callsigns: string[]) {
    const queue = callsigns.slice(0, MAX_LOOKUPS_PER_CYCLE);
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await lookup(next);
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
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

      if (needed.size > 0 && !pending) {
        pending = lookupAll([...needed]).finally(() => {
          pending = null;
        });
      }

      return aircraft.map((a) => {
        const route = a.callsign ? (cache.get(a.callsign)?.route ?? null) : null;
        return route ? { ...a, route } : a;
      });
    },
    idle: () => pending ?? Promise.resolve(),
  };
}

/** A lookup that adds nothing, for when route enrichment is turned off. */
export const noRouteLookup: RouteLookup = { enrich: (aircraft) => aircraft, idle: async () => {} };
