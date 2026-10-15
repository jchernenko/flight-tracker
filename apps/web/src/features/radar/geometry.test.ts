import { describe, expect, it } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { deadReckon, offsetNm, positionAgeSec, ringStepNm } from './geometry';

const center = { lat: 49.2, lon: -122.6 };
const plane = (over: Partial<Aircraft>) =>
  ({
    lat: 49.2,
    lon: -122.6,
    onGround: false,
    groundSpeedKt: 360,
    trackDeg: 90,
    ...over,
  }) as Aircraft;

describe('geometry', () => {
  it('measures one degree of latitude as 60 nm north', () => {
    const o = offsetNm(center, { lat: 50.2, lon: -122.6 });
    expect(o.northNm).toBeCloseTo(60);
    expect(o.eastNm).toBeCloseTo(0);
  });

  it('dead-reckons along the track at ground speed', () => {
    const o = deadReckon(plane({}), center, 10); // 360 kt = 0.1 nm/s
    expect(o.eastNm).toBeCloseTo(1);
    expect(o.northNm).toBeCloseTo(0);
  });

  it('does not move ground traffic or aircraft without a track, and caps extrapolation', () => {
    expect(deadReckon(plane({ onGround: true }), center, 10).eastNm).toBeCloseTo(0);
    expect(deadReckon(plane({ trackDeg: null }), center, 10).eastNm).toBeCloseTo(0);
    expect(deadReckon(plane({}), center, 600).eastNm).toBeCloseTo(2);
  });

  it('ages positions from server timestamps plus local elapsed time', () => {
    const a = plane({ seenAt: '2026-10-15T12:00:00.000Z' });
    expect(positionAgeSec(a, '2026-10-15T12:00:03.000Z', 2000)).toBe(5);
  });

  it('picks ring spacing per range', () => {
    expect([10, 20, 30, 60].map(ringStepNm)).toEqual([5, 5, 10, 20]);
  });
});
