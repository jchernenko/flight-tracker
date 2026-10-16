import { describe, expect, it } from 'vitest';
import type { Aircraft } from '@flight/shared';
import {
  altitudeText,
  compassPoint,
  headingText,
  routeCities,
  routeCode,
  sortForList,
  verticalSpeedText,
  whereText,
} from './format';

const ac = (over: Partial<Aircraft>) =>
  ({
    hex: 'c0ffee',
    callsign: 'ACA123',
    lat: 49.22,
    lon: -122.6,
    altitudeFt: 13300,
    onGround: false,
    verticalRateFpm: 0,
    trackDeg: 7,
    squawk: '2341',
    military: false,
    route: null,
    ...over,
  }) as Aircraft;

const route = { origin: 'YYC', destination: 'YVR', originCity: 'Calgary', destinationCity: null };

describe('format', () => {
  it('writes altitudes with a thousands separator', () => {
    expect(altitudeText(ac({}))).toBe('13,300');
    expect(altitudeText(ac({ onGround: true }))).toBe('GND');
  });

  it('describes the route, or why there is none', () => {
    expect(routeCode(ac({ route }))).toBe('YYC→YVR');
    expect(routeCities(ac({ route }))).toBe('Calgary → YVR');
    expect([routeCode(ac({})), routeCities(ac({}))]).toEqual(['VFR', 'Local VFR flight']);
    expect([routeCode(ac({ military: true })), routeCities(ac({ military: true }))]).toEqual([
      'MIL',
      'Route not published',
    ]);
  });

  it('formats heading, vertical speed and where the aircraft is', () => {
    expect(headingText(ac({}))).toBe('007° N');
    expect(headingText(ac({ trackDeg: 290 }))).toBe('290° W');
    expect(headingText(ac({ trackDeg: 135 }))).toBe('135° SE');
    expect(headingText(ac({ trackDeg: 359.6 }))).toBe('000° N');
    expect([compassPoint(22), compassPoint(23), compassPoint(-45), compassPoint(337)]).toEqual([
      'N',
      'NE',
      'NW',
      'NW',
    ]);
    expect(verticalSpeedText(ac({ verticalRateFpm: -1180 }))).toBe('−1,200');
    expect(whereText({ lat: 49.22, lon: -122.6 }, ac({ lon: -122.35 }))).toBe('9.8 nm E of you');
  });

  it('pins emergencies first, then sorts highest first with ground traffic last', () => {
    const list = sortForList([
      ac({ hex: 'low', altitudeFt: 2000 }),
      ac({ hex: 'gnd', onGround: true, altitudeFt: null }),
      ac({ hex: 'high', altitudeFt: 38000 }),
      ac({ hex: 'sos', altitudeFt: 5000, squawk: '7700' }),
    ]);
    expect(list.map((a) => a.hex)).toEqual(['sos', 'high', 'low', 'gnd']);
  });
});
