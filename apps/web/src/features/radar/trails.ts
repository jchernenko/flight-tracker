import type { Aircraft, AircraftResponse, LatLon } from '@flight/shared';
import { offsetNm, type Offset } from './geometry';

/** Comet trails show this much of the track behind each aircraft. */
export const TRAIL_SEC = 160;
/** Keep an aircraft's history this long after it was last seen, so a brief dropout doesn't wipe its trail. */
const FORGET_AFTER_MS = 60_000;

type Fix = LatLon & { t: number };

/**
 * Each aircraft's recently reported positions, so trails can follow the turns
 * it actually flew. Recorded once per picture, whichever view is showing.
 */
export class TrackHistory {
  private fixes = new Map<string, Fix[]>();
  private lastSeen = new Map<string, number>();
  private recorded: string | null = null;

  record(snapshot: Pick<AircraftResponse, 'aircraft' | 'fetchedAt' | 'servedAt'>): void {
    if (this.recorded === snapshot.fetchedAt) return;
    this.recorded = snapshot.fetchedAt;
    const now = Date.parse(snapshot.servedAt);
    for (const a of snapshot.aircraft) {
      this.lastSeen.set(a.hex, now);
      const fixes = this.fixes.get(a.hex) ?? [];
      const last = fixes[fixes.length - 1];
      const t = Date.parse(a.seenAt);
      if (!last || (t > last.t && (last.lat !== a.lat || last.lon !== a.lon))) {
        fixes.push({ lat: a.lat, lon: a.lon, t });
      }
      while (fixes.length > 1 && t - fixes[0]!.t > TRAIL_SEC * 1000) fixes.shift();
      this.fixes.set(a.hex, fixes);
    }
    for (const [hex, seen] of this.lastSeen) {
      if (now - seen > FORGET_AFTER_MS) {
        this.lastSeen.delete(hex);
        this.fixes.delete(hex);
      }
    }
  }

  /** Reported positions, oldest first. */
  fixesFor(hex: string): readonly Fix[] {
    return this.fixes.get(hex) ?? [];
  }
}

/** Shared by the radar and the map, so switching views keeps the trails. */
export const trackHistory = new TrackHistory();

/**
 * The trail behind an aircraft, from its current position `head` back
 * TRAIL_SEC: through the positions it reported, so turns show, then straight
 * on for whatever time the history doesn't cover yet. Empty when it isn't moving.
 */
export function trailPath(
  a: Aircraft,
  head: Offset,
  center: LatLon,
  fixes: readonly Fix[],
  nowMs: number,
): Offset[] {
  if (a.onGround || a.groundSpeedKt === null || a.groundSpeedKt < 1) return [];
  const path: Offset[] = [head];
  let coveredMs = 0;
  for (let i = fixes.length - 1; i >= 0; i--) {
    const fix = fixes[i]!;
    const age = nowMs - fix.t;
    if (age > TRAIL_SEC * 1000) break;
    path.push(offsetNm(center, fix));
    coveredMs = Math.max(coveredMs, age);
  }

  const restSec = TRAIL_SEC - coveredMs / 1000;
  if (restSec <= 0) return path;
  // Carry on back the way the oldest stretch was heading, or the current track if there is none.
  const tail = path[path.length - 1]!;
  const before = path[path.length - 2];
  let dx: number;
  let dy: number;
  if (before && Math.hypot(before.eastNm - tail.eastNm, before.northNm - tail.northNm) > 0.05) {
    const len = Math.hypot(before.eastNm - tail.eastNm, before.northNm - tail.northNm);
    dx = (before.eastNm - tail.eastNm) / len;
    dy = (before.northNm - tail.northNm) / len;
  } else if (a.trackDeg !== null) {
    const rad = (a.trackDeg * Math.PI) / 180;
    dx = Math.sin(rad);
    dy = Math.cos(rad);
  } else {
    return path.length > 1 ? path : [];
  }
  const dist = (a.groundSpeedKt / 3600) * restSec;
  path.push({ eastNm: tail.eastNm - dx * dist, northNm: tail.northNm - dy * dist });
  return path;
}

/** Splits a path into `n` runs of equal length, for trails drawn as fading segments. */
export function splitPath(path: readonly Offset[], n: number): Offset[][] {
  const lengths = path.slice(1).map((p, i) => dist(path[i]!, p));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  if (path.length < 2 || total === 0) return Array.from({ length: n }, () => []);
  const runs: Offset[][] = [];
  let seg = 0;
  let along = 0; // distance into segment `seg`
  let start = path[0]!;
  for (let k = 1; k <= n; k++) {
    const run = [start];
    let need = total / n;
    while (seg < lengths.length) {
      const left = lengths[seg]! - along;
      if (need < left || (k === n && seg === lengths.length - 1)) {
        along += Math.min(need, left);
        const f = lengths[seg]! === 0 ? 1 : along / lengths[seg]!;
        const from = path[seg]!;
        const to = path[seg + 1]!;
        start = {
          eastNm: from.eastNm + (to.eastNm - from.eastNm) * f,
          northNm: from.northNm + (to.northNm - from.northNm) * f,
        };
        run.push(start);
        break;
      }
      need -= left;
      seg++;
      along = 0;
      run.push(path[seg]!);
    }
    runs.push(run);
  }
  return runs;
}

const dist = (a: Offset, b: Offset) => Math.hypot(a.eastNm - b.eastNm, a.northNm - b.northNm);
