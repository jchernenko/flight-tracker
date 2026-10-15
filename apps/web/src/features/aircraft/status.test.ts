import { describe, expect, it } from 'vitest';
import type { AircraftSnapshot } from './useAircraft';
import { STALE_AFTER_MS, statusFor } from './status';

const snap = (over: Partial<AircraftSnapshot> = {}) =>
  ({
    fetchedAt: '2026-10-15T15:16:05.000Z',
    stale: false,
    receivedAt: 1000,
    ...over,
  }) as AircraftSnapshot;

describe('statusFor', () => {
  it('is acquiring before the first answer and offline when it never came', () => {
    expect(statusFor(undefined, true, false).kind).toBe('acquiring');
    expect(statusFor(undefined, false, true).kind).toBe('offline');
  });

  it('is live with a fresh picture and stale when the feed or the poll falls behind', () => {
    expect(statusFor(snap(), false, false, 2000)).toMatchObject({ kind: 'live' });
    expect(statusFor(snap({ stale: true }), false, false, 2000).kind).toBe('stale');
    expect(statusFor(snap(), false, true, 2000).kind).toBe('stale');
    expect(statusFor(snap(), false, false, 1001 + STALE_AFTER_MS).kind).toBe('stale');
  });
});
