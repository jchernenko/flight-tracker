import { Hono } from 'hono';
import type { AircraftService } from './services/aircraft.service.js';
import { aircraftRoutes } from './routes/aircraft.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';

export type AppDeps = { aircraftService: AircraftService };

export function createApp({ aircraftService }: AppDeps) {
  const app = new Hono()
    .get('/api/health', (c) => c.json({ success: true as const, data: { ok: true } }))
    .route('/api/aircraft', aircraftRoutes(aircraftService));

  app.all('/api', apiNotFound);
  app.all('/api/*', apiNotFound);
  app.onError(errorHandler);
  return app;
}

export type AppType = ReturnType<typeof createApp>;
