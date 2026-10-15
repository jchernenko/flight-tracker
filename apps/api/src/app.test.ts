import { describe, expect, it } from 'vitest';
import type { AircraftResponse } from '@flight/shared';
import { createApp } from './app.js';
import { AppError } from './utils/errors.js';

const data: AircraftResponse = {
  center: { lat: 49, lon: -122 },
  radiusNm: 60,
  fetchedAt: '2026-10-15T12:00:00.000Z',
  servedAt: '2026-10-15T12:00:02.000Z',
  stale: false,
  aircraft: [],
};

describe('GET /api/aircraft', () => {
  it('wraps the picture in the success envelope', async () => {
    const app = createApp({ aircraftService: { get: async () => data } });
    const res = await app.request('/api/aircraft');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data });
  });

  it('returns the error envelope when the feed is down', async () => {
    const app = createApp({
      aircraftService: {
        get: async () => {
          throw new AppError(502, 'Flight feed is unavailable');
        },
      },
    });
    const res = await app.request('/api/aircraft');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, error: 'Flight feed is unavailable' });
  });

  it('returns a JSON 404 for unknown API paths', async () => {
    const app = createApp({ aircraftService: { get: async () => data } });
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Not found' });
  });
});
