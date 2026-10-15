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
  military: false,
} as Aircraft;

describe('tagLines', () => {
  const texts = (a: Aircraft) => tagLines(a).map((l) => l.text);

  it('shows the callsign and the altitude with a thousands separator', () => {
    expect(texts(base)).toEqual(['ACA123', '35,000 ft']);
    expect(texts({ ...base, onGround: true, altitudeFt: null })[1]).toBe('GND');
  });

  it('shows the squawk for emergencies and a note for military traffic', () => {
    expect(texts({ ...base, squawk: '7700' })).toEqual(['ACA123', '7700 · EMERGENCY']);
    expect(texts({ ...base, military: true })).toEqual(['ACA123', '35,000 ft', 'MILITARY']);
  });

  it('falls back to registration, then hex', () => {
    expect(texts({ ...base, callsign: null, registration: 'C-GKLM' })[0]).toBe('C-GKLM');
    expect(texts({ ...base, callsign: null })[0]).toBe('C0FFEE');
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
