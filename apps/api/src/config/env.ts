import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

// z.coerce.number() turns "" into 0, which would silently center the scope at 0,0.
const requiredNumber = (min: number, max: number) =>
  z.string().trim().min(1, 'is required').pipe(z.coerce.number<string>().min(min).max(max));

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOME_LAT: requiredNumber(-90, 90),
  HOME_LON: requiredNumber(-180, 180),
  /** Shown in the display's header, e.g. "Maple Ridge". */
  HOME_NAME: z.string().trim().min(1).default('Home'),
  // The map's widest range. Fetching it once costs adsb.lol no more requests than 60 nm.
  FETCH_RADIUS_NM: z.coerce.number().positive().max(250).default(250),
  FEED_PROVIDER: z.enum(['adsblol', 'airplaneslive', 'readsb', 'demo']).default('adsblol'),
  FEED_URL: z.url().optional(),
  // airplanes.live and adsb.lol ask for at most ~1 request/second.
  CACHE_TTL_MS: z.coerce.number().int().min(1000).default(5000),
  ROUTES_ENABLED: booleanString,
  /** FlightAware AeroAPI key. When set, it fills in routes adsbdb misses. */
  AEROAPI_KEY: z.string().trim().min(1).optional(),
  // ~$0.005 a query: 30 a day stays inside the Personal tier's free $5 a month.
  AEROAPI_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  AEROAPI_RADIUS_NM: z.coerce.number().positive().max(250).default(30),
  WEB_DIST_DIR: z.string().default('../web/dist'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses env vars and exits the process if any are missing or invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
