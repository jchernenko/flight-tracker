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
        destination: { iata_code: 'YVR', icao_code: 'CYVR', municipality: 'Richmond' },
      },
    },
  },
  ASA12: {
    response: {
      flightroute: {
        origin: { iata_code: null, icao_code: 'KSEA' },
        destination: { iata_code: 'XYZ', icao_code: 'PXYZ', municipality: 'Somewhere' },
      },
    },
  },
  WJA9: { response: 'unknown callsign' },
  JZA8: {
    response: {
      flightroute: {
        origin: { iata_code: 'YUL', icao_code: 'CYUL', latitude: 45.47, longitude: -73.74 },
        destination: { iata_code: 'YFC', icao_code: 'CYFC', latitude: 45.87, longitude: -66.53 },
      },
    },
  },
  ACA301: {
    response: {
      flightroute: {
        origin: { iata_code: 'YUL', icao_code: 'CYUL', latitude: 45.47, longitude: -73.74 },
        destination: { iata_code: 'YVR', icao_code: 'CYVR', latitude: 49.19, longitude: -123.18 },
      },
    },
  },
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
    expect(second.map((a) => a.route)).toMatchObject([
      {
        origin: 'YZF',
        destination: 'YVR',
        originCity: 'Yellowknife',
        destinationCity: 'Vancouver',
      },
      null,
      null,
    ]);
    await lookup.idle();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('names cities from the table, then ICAO codes, then adsbdb', async () => {
    const lookup = createRouteLookup({
      fetchFn: fakeAdsbdb() as unknown as typeof fetch,
      now: () => 0,
    });
    lookup.enrich([ac('ASA12')]);
    await lookup.idle();
    expect(lookup.enrich([ac('ASA12')])[0]?.route).toMatchObject({
      origin: 'KSEA',
      destination: 'XYZ',
      originCity: 'Seattle',
      destinationCity: 'Somewhere',
    });
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

  it('hides a route the aircraft is nowhere near, since adsbdb routes can be stale', async () => {
    const lookup = createRouteLookup({
      fetchFn: fakeAdsbdb() as unknown as typeof fetch,
      now: () => 0,
    });
    lookup.enrich([ac('JZA8'), ac('ACA301')]);
    await lookup.idle();
    // Both aircraft are over the Lower Mainland: Montreal to Fredericton is
    // impossible there, Montreal to Vancouver is on the way.
    const [far, near] = lookup.enrich([ac('JZA8'), ac('ACA301')]);
    expect(far?.route).toBeNull();
    expect(near?.route).toMatchObject({ origin: 'YUL', destination: 'YVR' });
  });
});

describe('route lookup fallback', () => {
  const home = { lat: 49.22, lon: -122.6 };
  const at = (callsign: string, lat: number, lon: number) =>
    ({ hex: callsign, callsign, lat, lon, route: null }) as Aircraft;
  const fallbackRoute = {
    origin: 'YYC',
    destination: 'YVR',
    originCity: 'Calgary',
    destinationCity: 'Vancouver',
  };

  function setup(budget = Infinity) {
    let left = budget;
    const fallback = {
      take: vi.fn(() => left-- > 0),
      find: vi.fn(async (_callsign: string) => fallbackRoute),
    };
    const lookup = createRouteLookup({
      fetchFn: fakeAdsbdb() as unknown as typeof fetch,
      now: () => 0,
      fallback,
      home,
    });
    return { lookup, fallback };
  }

  it('asks the fallback only for nearby aircraft adsbdb misses or gets wrong, once each', async () => {
    const { lookup, fallback } = setup();
    const picture = [
      at('ACA253', 49.2, -122.7), // adsbdb knows it
      at('WJA9', 49.3, -122.5), // adsbdb doesn't
      at('JZA8', 49.1, -122.8), // adsbdb's route is implausible here
      at('WJA700', 51.0, -114.0), // a miss, but far from home
    ];
    lookup.enrich(picture);
    await lookup.idle(); // adsbdb round
    lookup.enrich(picture);
    await lookup.idle(); // fallback round
    lookup.enrich(picture);
    await lookup.idle();

    expect(fallback.find.mock.calls.map(([c]) => c).sort()).toEqual(['JZA8', 'WJA9']);
    const routes = lookup.enrich(picture).map((a) => a.route);
    expect(routes[0]).toMatchObject({ origin: 'YZF' });
    expect(routes[1]).toEqual(fallbackRoute);
    expect(routes[2]).toEqual(fallbackRoute);
    expect(routes[3]).toBeNull();
  });

  it('spends a short budget on the nearest aircraft first', async () => {
    const { lookup, fallback } = setup(1);
    const picture = [at('WJA9', 49.6, -122.6), at('WJA10', 49.23, -122.6)];
    lookup.enrich(picture);
    await lookup.idle();
    lookup.enrich(picture);
    await lookup.idle();
    expect(fallback.find.mock.calls.map(([c]) => c)).toEqual(['WJA10']);
  });
});

describe('stale route check', () => {
  it('uses the bundled airport table when adsbdb sends no coordinates', async () => {
    const lookup = createRouteLookup({
      fetchFn: fakeAdsbdb() as unknown as typeof fetch,
      now: () => 0,
    });
    const overMontreal = { ...ac('ACA253'), lat: 45.5, lon: -73.6 };
    lookup.enrich([overMontreal]);
    await lookup.idle();
    // Yellowknife → Vancouver can't pass over Montreal, so it's hidden.
    expect(lookup.enrich([overMontreal])[0]?.route).toBeNull();
    expect(lookup.enrich([ac('ACA253')])[0]?.route).toMatchObject({ origin: 'YZF' });
  });
});
