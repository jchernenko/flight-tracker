import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AircraftService } from '../services/aircraft.service.js';
import { aircraftQuerySchema } from '../validators/aircraft.js';
import { AppError } from '../utils/errors.js';

export function aircraftRoutes(service: AircraftService) {
  return new Hono().get(
    '/',
    zValidator('query', aircraftQuerySchema, (result) => {
      if (!result.success) throw new AppError(400, 'Invalid lat/lon');
    }),
    async (c) => {
      const { lat, lon } = c.req.valid('query');
      const data = await service.get(
        lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
      );
      return c.json({ success: true as const, data });
    },
  );
}
