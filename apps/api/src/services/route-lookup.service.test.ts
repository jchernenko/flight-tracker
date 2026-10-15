import { describe, expect, it, vi } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { createRouteLookup } from './route-lookup.service.js';

const ac = (callsign: string | null) =>
  ({ hex: callsign ?? 'x', callsign, lat: 49, lon: -122, route: null }) as Aircraft;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ADSBDB_ROUTES: Record<string, unknown> = {
  ACA253: {
    response: {
      flightroute: {
        origin: { iata_code: 'YZF', icao_code: 'CYZF' },
        destination: { iata_code: 'YVR', icao_code: 'CYVR' },
      },
    },
  },
  WJA9: { response: 'unknown callsign' },
};

function fakeAdsbdb() {
  return vi.fn(async (url: string) => {
    const callsign = url.split('/').pop()!;
    return callsign in ADSBDB_ROUTES ? json(ADSBDB_ROUTES[callsign]) : json({}, 404);
  });
}

describe('route lookup', () => {
  it('fills routes in the background for airline callsigns only, and caches them', async () => {
    const fetchFn = fakeAdsbdb();
    const lookup = createRouteLookup({ fetchFn: fetchFn as unknown as typeof fetch, now: () => 0 });

    // The first picture goes out without waiting for the route API.
    const first = lookup.enrich([ac('ACA253'), ac('WJA9'), ac('JZA1'), ac('CGKLM'), ac(null)]);
    expect(first.every((a) => a.route === null)).toBe(true);
    await lookup.idle();

    const looked = fetchFn.mock.calls.map(([url]) => url.split('/').pop()).sort();
    expect(looked).toEqual(['ACA253', 'JZA1', 'WJA9']);

    const second = lookup.enrich([ac('ACA253'), ac('WJA9'), ac('JZA1')]);
    expect(second.map((a) => a.route)).toEqual([{ origin: 'YZF', destination: 'YVR' }, null, null]);
    await lookup.idle();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('never throws, and backs off after a failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const lookup = createRouteLookup({ fetchFn: fetchFn as typeof fetch, now: () => 0 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(lookup.enrich([ac('ACA191')])[0]?.route).toBeNull();
    await lookup.idle();
    lookup.enrich([ac('ACA191')]);
    await lookup.idle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
