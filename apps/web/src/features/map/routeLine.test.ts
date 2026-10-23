import { describe, expect, it } from 'vitest';
import { distanceNm, greatCircle } from '@flight/shared';
import { nextRange, rangeFor } from '../../components/Headline';

const YVR = { lat: 49.194, lon: -123.184 };
const YLW = { lat: 49.956, lon: -119.378 };
const NRT = { lat: 35.765, lon: 140.386 };

describe('route lines', () => {
  it('follows the great circle in short steps, end to end', () => {
    const line = greatCircle(YVR, YLW, 10);
    expect(line[0]!.lat).toBeCloseTo(YVR.lat, 6);
    expect(line[0]!.lon).toBeCloseTo(YVR.lon, 6);
    expect(line.at(-1)!.lat).toBeCloseTo(YLW.lat, 6);
    expect(line.at(-1)!.lon).toBeCloseTo(YLW.lon, 6);
    for (let i = 1; i < line.length; i++) {
      expect(distanceNm(line[i - 1]!, line[i]!)).toBeLessThanOrEqual(10.01);
    }
  });

  it('bends north over the Pacific and never jumps across the antimeridian', () => {
    const line = greatCircle(YVR, NRT);
    expect(Math.max(...line.map((p) => p.lat))).toBeGreaterThan(50);
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]!.lon - line[i - 1]!.lon)).toBeLessThan(5);
    }
    expect(line.at(-1)!.lon).toBeCloseTo(NRT.lon - 360, 3);
  });
});

describe('ranges', () => {
  it('goes out to 250 nm on the map only', () => {
    expect(nextRange(60, 'map')).toBe(120);
    expect(nextRange(250, 'map')).toBe(10);
    expect(nextRange(60, 'radar')).toBe(10);
    expect(rangeFor(250, 'radar')).toBe(60);
    expect(rangeFor(250, 'map')).toBe(250);
    expect(rangeFor(20, 'board')).toBe(20);
  });
});
