import { describe, expect, it, vi } from 'vitest';
import { createAeroApiFallback } from './aeroapi.service.js';

const airport = (iata: string | null, icao: string, city: string) => ({
  code: icao,
  code_icao: icao,
  code_iata: iata,
  city,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AeroAPI fallback', () => {
  it('returns the airborne flight, not yesterday’s or tomorrow’s', async () => {
    const fetchFn = vi.fn(async () =>
      json({
        flights: [
          {
            origin: airport('YYZ', 'CYYZ', 'Toronto'),
            destination: airport('YVR', 'CYVR', 'Vancouver'),
            actual_off: null,
            actual_on: null,
          },
          {
            origin: airport('YYC', 'CYYC', 'Calgary'),
            destination: airport(null, 'CYPK', 'Pitt Meadows'),
            actual_off: '2026-10-22T12:00:00Z',
            actual_on: null,
          },
          {
            origin: airport('YUL', 'CYUL', 'Montreal'),
            destination: airport('YVR', 'CYVR', 'Vancouver'),
            actual_off: '2026-10-21T12:00:00Z',
            actual_on: '2026-10-21T17:00:00Z',
          },
        ],
      }),
    );
    const fallback = createAeroApiFallback({
      apiKey: 'k',
      dailyLimit: 30,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await fallback.find('WJA123')).toEqual({
      origin: 'YYC',
      destination: 'CYPK',
      originCity: 'Calgary',
      destinationCity: 'Pitt Meadows',
      originPos: { lat: 51.119, lon: -114.01 },
      destinationPos: { lat: 49.215, lon: -122.709 },
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://aeroapi.flightaware.com/aeroapi/flights/WJA123?ident_type=designator',
    );
    expect((init.headers as Record<string, string>)['x-apikey']).toBe('k');
  });

  it('returns null when nothing is airborne or the flight is unknown, and throws on errors', async () => {
    const responses = [json({ flights: [] }), json({}, 404), json({}, 401)];
    const fetchFn = vi.fn(async () => responses.shift()!);
    const fallback = createAeroApiFallback({
      apiKey: 'k',
      dailyLimit: 30,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await fallback.find('ACA1')).toBeNull();
    expect(await fallback.find('ACA2')).toBeNull();
    await expect(fallback.find('ACA3')).rejects.toThrow('401');
  });

  it('spreads the daily limit over the day and never goes over it', () => {
    let t = Date.UTC(2026, 9, 22, 0, 0);
    const fallback = createAeroApiFallback({ apiKey: 'k', dailyLimit: 30, now: () => t });
    const takeAll = () => {
      let n = 0;
      while (fallback.take()) n++;
      return n;
    };

    expect(takeAll()).toBe(5); // a burst of a sixth of the day
    t += 48 * 60 * 1000; // one query refills every 48 minutes
    expect(takeAll()).toBe(1);

    let total = 6;
    for (let i = 0; i < 23 * 60; i++) {
      t += 60 * 1000;
      if (t >= Date.UTC(2026, 9, 23)) break;
      total += takeAll();
    }
    expect(total).toBeLessThanOrEqual(30);

    t = Date.UTC(2026, 9, 23, 6);
    expect(takeAll()).toBe(5); // a new day
  });
});
