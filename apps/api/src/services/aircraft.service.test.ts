import { describe, expect, it, vi } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { createAircraftService } from './aircraft.service.js';
import { noRouteLookup } from './route-lookup.service.js';
import type { FeedProvider } from './providers/index.js';
import { AppError } from '../utils/errors.js';

const plane = { hex: 'abc123', lat: 49, lon: -122 } as Aircraft;

function setup(fetchAircraft: FeedProvider['fetchAircraft']) {
  let clock = 0;
  const provider = { name: 'test', label: 'test', fetchAircraft: vi.fn(fetchAircraft) };
  const service = createAircraftService({
    provider,
    routes: noRouteLookup,
    center: { lat: 49, lon: -122 },
    radiusNm: 60,
    ttlMs: 5000,
    now: () => clock,
  });
  return { provider, service, tick: (ms: number) => (clock += ms) };
}

describe('aircraft service', () => {
  it('calls upstream once per cache window', async () => {
    const { provider, service, tick } = setup(async () => [plane]);
    await service.get();
    tick(4999);
    await service.get();
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(1);
    tick(1);
    const data = await service.get();
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(2);
    expect(data).toMatchObject({ stale: false, radiusNm: 60, aircraft: [plane] });
  });

  it('times the window from the start of a slow fetch, so 5 s polls always get a fresh picture', async () => {
    let tick = (_ms: number) => 0;
    const harness = setup(async () => {
      tick(800); // upstream takes 0.8 s
      return [plane];
    });
    tick = harness.tick;
    const first = await harness.service.get();
    harness.tick(5000 - 800); // next poll, 5 s after the first one started
    const second = await harness.service.get();
    expect(harness.provider.fetchAircraft).toHaveBeenCalledTimes(2);
    expect(second.fetchedAt).not.toBe(first.fetchedAt);
  });

  it('stamps servedAt on every response, including cached ones', async () => {
    const { service, tick } = setup(async () => [plane]);
    await service.get();
    tick(3000);
    const cached = await service.get();
    expect(cached.fetchedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(cached.servedAt).toBe('1970-01-01T00:00:03.000Z');
  });

  it('shares one upstream call between concurrent requests', async () => {
    const { provider, service } = setup(async () => [plane]);
    await Promise.all([service.get(), service.get(), service.get()]);
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(1);
  });

  it('serves the last good picture flagged stale when upstream fails', async () => {
    const { provider, service, tick } = setup(async () => [plane]);
    await service.get();
    provider.fetchAircraft.mockRejectedValue(new Error('boom'));
    tick(6000);
    const data = await service.get();
    expect(data).toMatchObject({ stale: true, aircraft: [plane] });

    // Backs off for a full window instead of retrying on every request.
    tick(1000);
    await service.get();
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(2);
  });

  it('throws a 502 when upstream fails before any good response, and backs off', async () => {
    const { provider, service, tick } = setup(async () => {
      throw new Error('down');
    });
    const unavailable = new AppError(502, 'Flight feed is unavailable');
    await expect(service.get()).rejects.toMatchObject(unavailable);
    tick(1000);
    await expect(service.get()).rejects.toMatchObject(unavailable);
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(1);
    tick(4000);
    await expect(service.get()).rejects.toMatchObject(unavailable);
    expect(provider.fetchAircraft).toHaveBeenCalledTimes(2);
  });
});
