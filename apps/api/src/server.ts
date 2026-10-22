import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { createAircraftService } from './services/aircraft.service.js';
import { createFeedProvider } from './services/providers/index.js';
import { createRouteLookup, noRouteLookup } from './services/route-lookup.service.js';
import { createAeroApiFallback } from './services/aeroapi.service.js';

const env = loadEnv();
const provider = createFeedProvider(env);
const home = { lat: env.HOME_LAT, lon: env.HOME_LON };
const routes = env.ROUTES_ENABLED
  ? createRouteLookup({
      home,
      fallbackRadiusNm: env.AEROAPI_RADIUS_NM,
      fallback: env.AEROAPI_KEY
        ? createAeroApiFallback({ apiKey: env.AEROAPI_KEY, dailyLimit: env.AEROAPI_DAILY_LIMIT })
        : undefined,
    })
  : noRouteLookup;

const app = createApp({
  aircraftService: createAircraftService({
    provider,
    routes,
    center: home,
    radiusNm: env.FETCH_RADIUS_NM,
    ttlMs: env.CACHE_TTL_MS,
  }),
  info: { feed: provider.label, place: env.HOME_NAME },
});

// In production the API also serves the built web app, so it's one Railway service.
const webDist = resolve(env.WEB_DIST_DIR);
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  // Client-side fallback for page paths only, so a missing /assets/*.js 404s instead of returning HTML.
  app.get('*', async (c, next) => {
    if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
    return serveStatic({ path: `${webDist}/index.html` })(c, next);
  });
}

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  const fallback = env.ROUTES_ENABLED && env.AEROAPI_KEY ? ', AeroAPI route fallback' : '';
  console.log(`API listening on :${port} (feed: ${provider.name}${fallback})`);
});
