import { z } from 'zod';
import type { Route } from '@flight/shared';
import { airportCity } from '../utils/lookups.js';
import { USER_AGENT } from './providers/http.js';

// FlightAware AeroAPI has the filed flight plan, so it knows routes adsbdb's
// crowd-sourced table doesn't. It bills per query, so it only fills gaps.
const AEROAPI_FLIGHTS_URL = 'https://aeroapi.flightaware.com/aeroapi/flights/';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The Personal tier allows 10 queries a minute; a burst never comes close. */
const MAX_BURST = 8;

const airportSchema = z
  .object({
    code: z.string().nullish(),
    code_icao: z.string().nullish(),
    code_iata: z.string().nullish(),
    city: z.string().nullish(),
  })
  .nullish();

const flightsResponseSchema = z.object({
  flights: z.array(
    z.object({
      origin: airportSchema,
      destination: airportSchema,
      actual_off: z.string().nullish(),
      actual_on: z.string().nullish(),
      cancelled: z.boolean().nullish(),
    }),
  ),
});

export interface RouteFallback {
  /** Spends one query from the budget. False when the budget is used up for now. */
  take(): boolean;
  /** Route of the airborne flight with this callsign, or null if FlightAware has none. Throws on failure. */
  find(callsign: string): Promise<Route | null>;
}

/**
 * Keeps spending within `dailyLimit` queries per UTC day, and spreads them
 * over the day so the morning rush can't use up the whole allowance.
 */
function createBudget(dailyLimit: number, now: () => number) {
  const burst = Math.min(MAX_BURST, Math.max(1, Math.ceil(dailyLimit / 6)));
  const refillPerMs = dailyLimit / DAY_MS;
  let tokens = burst;
  let refilledAt = now();
  let day = Math.floor(refilledAt / DAY_MS);
  let usedToday = 0;

  return () => {
    const t = now();
    tokens = Math.min(burst, tokens + (t - refilledAt) * refillPerMs);
    refilledAt = t;
    const today = Math.floor(t / DAY_MS);
    if (today !== day) {
      day = today;
      usedToday = 0;
    }
    if (tokens < 1 || usedToday >= dailyLimit) return false;
    tokens -= 1;
    usedToday += 1;
    return true;
  };
}

const code = (a: z.infer<typeof airportSchema>) => a?.code_iata || a?.code_icao || a?.code || null;

export function createAeroApiFallback(options: {
  apiKey: string;
  dailyLimit: number;
  now?: () => number;
  fetchFn?: typeof fetch;
}): RouteFallback {
  const { apiKey, dailyLimit, now = Date.now, fetchFn = fetch } = options;

  return {
    take: createBudget(dailyLimit, now),
    async find(callsign) {
      const response = await fetchFn(
        `${AEROAPI_FLIGHTS_URL}${encodeURIComponent(callsign)}?ident_type=designator`,
        {
          headers: { 'x-apikey': apiKey, 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`AeroAPI responded ${response.status}`);

      // The list covers the last few days of this flight number; only the one in the air counts.
      const { flights } = flightsResponseSchema.parse(await response.json());
      const airborne = flights.find((f) => f.actual_off && !f.actual_on && !f.cancelled);
      const from = code(airborne?.origin);
      const to = code(airborne?.destination);
      if (!airborne || !from || !to) return null;
      return {
        origin: from,
        destination: to,
        originCity: airportCity(from) ?? airborne.origin?.city ?? null,
        destinationCity: airportCity(to) ?? airborne.destination?.city ?? null,
      };
    },
  };
}
