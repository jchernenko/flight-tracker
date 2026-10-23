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
    kind: 'airline',
    route: null,
    ...over,
  }) as Aircraft;

const route = {
  origin: 'YYC',
  destination: 'YVR',
  originCity: 'Calgary',
  destinationCity: null,
};

describe('format', () => {
  it('writes altitudes with a thousands separator', () => {
    expect(altitudeText(ac({}))).toBe('13,300');
    expect(altitudeText(ac({ onGround: true }))).toBe('GND');
  });

  it('describes the route, or why there is none', () => {
    expect(routeCode(ac({ route }))).toBe('YYC→YVR');
    expect(routeCities(ac({ route }))).toBe('Calgary → YVR');
    expect([routeCode(ac({})), routeCities(ac({}))]).toEqual(['—', 'Route unknown']);
    const cessna = ac({ callsign: 'CGKLM', kind: 'private' });
    expect([routeCode(cessna), routeCities(cessna)]).toEqual(['VFR', 'Local VFR flight']);
    const bizjet = ac({ callsign: 'LXJ396', kind: 'charter' });
    expect([routeCode(bizjet), routeCities(bizjet)]).toEqual(['—', 'Route unknown']);
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

  it('sorts nearest first, with emergencies and then the selected aircraft pinned on top', () => {
    const home = { lat: 49.22, lon: -122.6 };
    const aircraft = [
      ac({ hex: 'far', lat: 49.6 }),
      ac({ hex: 'near', lat: 49.23 }),
      ac({ hex: 'mid', lat: 49.4 }),
      ac({ hex: 'sos', lat: 49.8, squawk: '7700' }),
    ];
    expect(sortForList(aircraft, home).map((a) => a.hex)).toEqual(['sos', 'near', 'mid', 'far']);
    expect(sortForList(aircraft, home, 'far').map((a) => a.hex)).toEqual([
      'far',
      'sos',
      'near',
      'mid',
    ]);
    // In follow mode distances are from the phone.
    const phone = { lat: 49.6, lon: -122.6 };
    expect(sortForList(aircraft, phone).map((a) => a.hex)).toEqual(['sos', 'far', 'mid', 'near']);
  });
});
