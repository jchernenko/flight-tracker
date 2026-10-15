import { Hono } from 'hono';
import type { Health } from '@flight/shared';
import type { AircraftService } from './services/aircraft.service.js';
import { aircraftRoutes } from './routes/aircraft.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';

export type AppDeps = {
  aircraftService: AircraftService;
  /** Display names for the feed and the home point, sent with the health check. */
  info: { feed: string; place: string };
};

export function createApp({ aircraftService, info }: AppDeps) {
  const app = new Hono()
    .get('/api/health', (c) =>
      c.json({ success: true as const, data: { ok: true as const, ...info } satisfies Health }),
    )
    .route('/api/aircraft', aircraftRoutes(aircraftService));

  app.all('/api', apiNotFound);
  app.all('/api/*', apiNotFound);
  app.onError(errorHandler);
  return app;
}

export type AppType = ReturnType<typeof createApp>;
