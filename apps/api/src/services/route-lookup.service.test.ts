import { describe, expect, it, vi } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { createRouteLookup } from './route-lookup.service.js';

const ac = (callsign: string | null) =>
  ({ hex: callsign ?? 'x', callsign, lat: 49, lon: -122, route: null }) as Aircraft;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('route lookup', () => {
  it('fills routes for airline callsigns and caches them', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        { callsign: 'ACA191', plausible: true, _airports: [{ iata: 'YVR' }, { iata: 'YYZ' }] },
        { callsign: 'WJA9', plausible: false, _airports: [{ iata: 'YVR' }, { iata: 'YYC' }] },
      ]),
    );
    const lookup = createRouteLookup({ fetchFn: fetchFn as typeof fetch, now: () => 0 });

    // The first picture goes out without waiting for the route API.
    expect(lookup.enrich([ac('ACA191')])[0]?.route).toBeNull();
    await lookup.idle();

    const result = lookup.enrich([ac('ACA191'), ac('WJA9'), ac('CGKLM'), ac(null)]);
    await lookup.idle();
    expect(result.map((a) => a.route)).toEqual([
      { origin: 'YVR', destination: 'YYZ' },
      null,
      null,
      null,
    ]);

    const body = JSON.parse(
      (fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.planes.map((p: { callsign: string }) => p.callsign)).toEqual(['WJA9']);

    lookup.enrich([ac('ACA191'), ac('WJA9')]);
    await lookup.idle();
    expect(fetchFn).toHaveBeenCalledTimes(2);
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
