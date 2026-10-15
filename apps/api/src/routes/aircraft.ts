import { Hono } from 'hono';
import type { AircraftService } from '../services/aircraft.service.js';

export function aircraftRoutes(service: AircraftService) {
  return new Hono().get('/', async (c) => {
    const data = await service.get();
    return c.json({ success: true as const, data });
  });
}
