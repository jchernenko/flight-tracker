import { z } from 'zod';
import type { Aircraft, Route } from '@flight/shared';
import { isAirlineCallsign } from '../utils/lookups.js';
import { USER_AGENT } from './providers/http.js';

// ADS-B carries no flight plan, so origin/destination come from the community
// route database tar1090 uses, which infers a route from the callsign.
const ROUTESET_URL = 'https://api.adsb.lol/api/0/routeset';
const ROUTE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_PER_REQUEST = 100;
const MAX_CACHE_ENTRIES = 5000;

const routesetSchema = z.array(
  z.object({
    callsign: z.string(),
    plausible: z.union([z.boolean(), z.number()]).optional(),
    _airports: z
      .array(z.object({ iata: z.string().optional(), icao: z.string().optional() }))
      .optional(),
  }),
);

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
  options: { url?: string; now?: () => number; fetchFn?: typeof fetch } = {},
): RouteLookup {
  const { url = ROUTESET_URL, now = Date.now, fetchFn = fetch } = options;
  const cache = new Map<string, CacheEntry>();

  function remember(callsign: string, route: Route | null, ttlMs: number) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const t = now();
      for (const [key, entry] of cache) if (entry.expires <= t) cache.delete(key);
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    }
    cache.set(callsign, { route, expires: now() + ttlMs });
  }

  async function lookup(planes: Aircraft[]) {
    const body = {
      planes: planes.map((a) => ({ callsign: a.callsign, lat: a.lat, lng: a.lon })),
    };
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        // adsb.lol rejects requests with no identifying User-Agent (403).
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`routeset responded ${response.status}`);
      const routes = routesetSchema.parse(await response.json());

      const found = new Set<string>();
      for (const r of routes) {
        const airports = r._airports ?? [];
        const first = airports[0];
        const last = airports[airports.length - 1];
        const origin = first?.iata || first?.icao;
        const destination = last?.iata || last?.icao;
        if (r.plausible && airports.length >= 2 && origin && destination) {
          remember(r.callsign, { origin, destination }, ROUTE_TTL_MS);
          found.add(r.callsign);
        }
      }
      for (const a of planes) {
        if (a.callsign && !found.has(a.callsign)) remember(a.callsign, null, ROUTE_TTL_MS);
      }
    } catch (err) {
      console.warn('Route lookup failed:', err instanceof Error ? err.message : err);
      for (const a of planes) if (a.callsign) remember(a.callsign, null, FAILURE_BACKOFF_MS);
    }
  }

  let pending: Promise<void> | null = null;

  async function lookupAll(planes: Aircraft[]) {
    for (let i = 0; i < planes.length; i += MAX_PER_REQUEST) {
      await lookup(planes.slice(i, i + MAX_PER_REQUEST));
    }
  }

  return {
    enrich(aircraft) {
      const t = now();
      const needed = new Map<string, Aircraft>();
      for (const a of aircraft) {
        if (!isAirlineCallsign(a.callsign)) continue;
        const cached = cache.get(a.callsign);
        if (!cached || cached.expires <= t) needed.set(a.callsign, a);
      }

      if (needed.size > 0 && !pending) {
        pending = lookupAll([...needed.values()]).finally(() => {
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
