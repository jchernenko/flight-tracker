import { describe, expect, it } from 'vitest';
import { normalizeReadsb } from './readsb-format.js';

const NOW_MS = Date.parse('2026-10-15T12:00:00Z');

describe('normalizeReadsb', () => {
  it('maps an airborne airline flight', () => {
    const [a] = normalizeReadsb({
      now: NOW_MS,
      ac: [
        {
          hex: 'C0FFEE',
          flight: 'ACA191  ',
          lat: 49.2,
          lon: -122.6,
          alt_baro: 35000,
          gs: 452.3,
          track: 270.5,
          baro_rate: -64,
          squawk: '2341',
          t: 'A321',
          r: 'C-GJWO',
          seen_pos: 2,
        },
      ],
    });
    expect(a).toMatchObject({
      hex: 'c0ffee',
      callsign: 'ACA191',
      airline: 'Air Canada',
      flightNumber: '191',
      altitudeFt: 35000,
      onGround: false,
      groundSpeedKt: 452.3,
      trackDeg: 270.5,
      verticalRateFpm: -64,
      typeName: 'Airbus A321',
      registration: 'C-GJWO',
      military: false,
      route: null,
      seenAt: '2026-10-15T11:59:58.000Z',
    });
  });

  it('marks ground traffic and military flags', () => {
    const [a] = normalizeReadsb({
      now: NOW_MS / 1000,
      aircraft: [{ hex: 'ae1234', lat: 1, lon: 2, alt_baro: 'ground', dbFlags: 1 }],
    });
    expect(a).toMatchObject({ onGround: true, altitudeFt: null, military: true, callsign: null });
    expect(a?.seenAt).toBe('2026-10-15T12:00:00.000Z');
  });

  it('drops entries without a position or with a malformed shape', () => {
    const result = normalizeReadsb({
      ac: [
        { hex: 'abc123', alt_baro: 1000 },
        { lat: 1, lon: 2 },
        'junk',
        { hex: 'def456', lat: 1, lon: 2 },
      ],
    });
    expect(result.map((a) => a.hex)).toEqual(['def456']);
  });

  it('prefers the feed description for the type name', () => {
    const [a] = normalizeReadsb({
      ac: [{ hex: 'a', lat: 0, lon: 0, t: 'ZZZZ', desc: 'Mystery Jet' }],
    });
    expect(a?.typeName).toBe('Mystery Jet');
  });
});
