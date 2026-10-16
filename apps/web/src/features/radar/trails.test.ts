import { describe, expect, it } from 'vitest';
import type { Aircraft } from '@flight/shared';
import { offsetNm } from './geometry';
import { splitPath, TrackHistory, TRAIL_SEC, trailPath } from './trails';

const center = { lat: 49.22, lon: -122.6 };
const T0 = Date.parse('2026-10-16T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const plane = (over: Partial<Aircraft>): Aircraft =>
  ({
    hex: 'abc123',
    lat: center.lat,
    lon: center.lon,
    onGround: false,
    groundSpeedKt: 360, // 0.1 nm a second
    trackDeg: 90,
    seenAt: iso(T0),
    ...over,
  }) as Aircraft;

function record(history: TrackHistory, ms: number, a: Aircraft) {
  history.record({ aircraft: [a], fetchedAt: iso(ms), servedAt: iso(ms) });
}

describe('comet trails', () => {
  it('follow the turn an aircraft flew, then carry on straight for the time not yet recorded', () => {
    const history = new TrackHistory();
    // Flying north, then turning east: three fixes 10 s apart.
    record(history, T0, plane({ lat: 49.2, lon: -122.6, seenAt: iso(T0) }));
    record(history, T0 + 10_000, plane({ lat: 49.21, lon: -122.6, seenAt: iso(T0 + 10_000) }));
    record(history, T0 + 20_000, plane({ lat: 49.21, lon: -122.58, seenAt: iso(T0 + 20_000) }));

    const fixes = history.fixesFor('abc123');
    expect(fixes).toHaveLength(3);
    const now = T0 + 20_000;
    const head = offsetNm(center, fixes[2]!);
    const path = trailPath(plane({}), head, center, fixes, now);

    // Head, the three fixes newest first, and a straight run back south from the oldest.
    expect(path).toHaveLength(5);
    expect(path.slice(1, 4)).toEqual([...fixes].reverse().map((f) => offsetNm(center, f)));
    const oldest = path[3]!;
    const extension = path[4]!;
    expect(extension.eastNm).toBeCloseTo(oldest.eastNm, 6);
    // 140 s not yet recorded at 0.1 nm/s.
    expect(oldest.northNm - extension.northNm).toBeCloseTo(0.1 * (TRAIL_SEC - 20), 6);
  });

  it('go straight back along the track before any history exists, and not at all on the ground', () => {
    const head = { eastNm: 0, northNm: 0 };
    const path = trailPath(plane({}), head, center, [], T0);
    expect(path).toHaveLength(2);
    expect(path[1]!.eastNm).toBeCloseTo(-0.1 * TRAIL_SEC, 6);
    expect(path[1]!.northNm).toBeCloseTo(0, 6);
    expect(trailPath(plane({ onGround: true }), head, center, [], T0)).toEqual([]);
  });

  it('drop fixes older than the trail and forget aircraft gone a minute', () => {
    const history = new TrackHistory();
    for (let s = 0; s <= 300; s += 10) {
      record(history, T0 + s * 1000, plane({ lat: 49 + s / 1000, seenAt: iso(T0 + s * 1000) }));
    }
    const ages = history.fixesFor('abc123').map((f) => (T0 + 300_000 - f.t) / 1000);
    expect(Math.max(...ages)).toBeLessThanOrEqual(TRAIL_SEC);

    history.record({ aircraft: [], fetchedAt: iso(T0 + 400_000), servedAt: iso(T0 + 400_000) });
    expect(history.fixesFor('abc123')).toEqual([]);
  });

  it('split into equal-length runs that join up', () => {
    const path = [
      { eastNm: 0, northNm: 0 },
      { eastNm: 3, northNm: 0 },
      { eastNm: 3, northNm: 3 },
    ];
    const runs = splitPath(path, 3);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual([path[0], { eastNm: 2, northNm: 0 }]);
    expect(runs[1]).toEqual([{ eastNm: 2, northNm: 0 }, path[1], { eastNm: 3, northNm: 1 }]);
    expect(runs[2]![runs[2]!.length - 1]).toEqual(path[2]);
  });
});
