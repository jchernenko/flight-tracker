import { describe, expect, it } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { isEmergency, placeTag, tagLines, type Rect } from './tags';

const base = {
  hex: 'c0ffee',
  callsign: 'ACA123',
  registration: null,
  altitudeFt: 35000,
  onGround: false,
  verticalRateFpm: 1500,
  groundSpeedKt: 452,
  route: null,
  squawk: '2341',
} as Aircraft;

describe('tagLines', () => {
  it('formats callsign, flight level, trend and speed', () => {
    expect(tagLines(base)).toEqual(['ACA123', '350 ↑ 452']);
  });

  it('adds the route and handles descending, level and ground traffic', () => {
    expect(
      tagLines({ ...base, verticalRateFpm: -800, route: { origin: 'YVR', destination: 'YYZ' } }),
    ).toEqual(['ACA123', '350 ↓ 452', 'YVR→YYZ']);
    expect(tagLines({ ...base, verticalRateFpm: 0, altitudeFt: 2500, groundSpeedKt: 95 })[1]).toBe(
      '025   095',
    );
    expect(tagLines({ ...base, onGround: true, altitudeFt: null, verticalRateFpm: null })[1]).toBe(
      'GND   452',
    );
  });

  it('falls back to registration, then hex', () => {
    expect(tagLines({ ...base, callsign: null, registration: 'C-GKLM' })[0]).toBe('C-GKLM');
    expect(tagLines({ ...base, callsign: null })[0]).toBe('C0FFEE');
  });
});

describe('isEmergency', () => {
  it('flags 7500, 7600 and 7700', () => {
    expect(
      ['7500', '7600', '7700', '1200'].map((s) => isEmergency({ ...base, squawk: s })),
    ).toEqual([true, true, true, false]);
  });
});

describe('placeTag', () => {
  it('moves to another corner instead of overlapping', () => {
    const placed: Rect[] = [];
    const first = placeTag(100, 100, 50, 20, 5, placed);
    const second = placeTag(100, 100, 50, 20, 5, placed);
    expect(first).toEqual({ x: 105, y: 75, w: 50, h: 20 });
    expect(second).toEqual({ x: 105, y: 105, w: 50, h: 20 });
  });
});
