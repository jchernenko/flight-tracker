import type { Aircraft, LatLon } from '@flight/shared';

const NM_PER_DEG_LAT = 60;
/** Never extrapolate further than this; a contact this old is about to drop anyway. */
const MAX_DEAD_RECKON_SEC = 20;

export type Offset = { eastNm: number; northNm: number };

/** Flat-earth offset from the home point. Accurate enough out to ~60 nm. */
export function offsetNm(center: LatLon, p: LatLon): Offset {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return {
    eastNm: (p.lon - center.lon) * NM_PER_DEG_LAT * cosLat,
    northNm: (p.lat - center.lat) * NM_PER_DEG_LAT,
  };
}

/**
 * Where the aircraft probably is `ageSec` after its reported position,
 * moving along its track at its ground speed.
 */
export function deadReckon(a: Aircraft, center: LatLon, ageSec: number): Offset {
  const base = offsetNm(center, a);
  if (a.onGround || a.groundSpeedKt === null || a.trackDeg === null) return base;
  const dt = Math.min(Math.max(ageSec, 0), MAX_DEAD_RECKON_SEC);
  const distNm = (a.groundSpeedKt / 3600) * dt;
  const rad = (a.trackDeg * Math.PI) / 180;
  return {
    eastNm: base.eastNm + distNm * Math.sin(rad),
    northNm: base.northNm + distNm * Math.cos(rad),
  };
}

/**
 * Seconds between an aircraft's reported position and now: its age when the
 * server sent the response (server clock only) plus local time since receipt.
 */
export function positionAgeSec(
  a: Aircraft,
  servedAt: string,
  elapsedSinceReceiveMs: number,
): number {
  const feedAgeMs = Date.parse(servedAt) - Date.parse(a.seenAt);
  return (Math.max(0, feedAgeMs) + elapsedSinceReceiveMs) / 1000;
}

/** Range-ring spacing for a scope range: every 5 nm up to 20, 10 at 30, 20 at 60. */
export function ringStepNm(rangeNm: number): number {
  if (rangeNm <= 20) return 5;
  if (rangeNm <= 30) return 10;
  return 20;
}

/** Inverse of offsetNm: the lat/lon at an east/north offset from the home point. */
export function toLatLon(center: LatLon, o: Offset): LatLon {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: center.lat + o.northNm / NM_PER_DEG_LAT,
    lon: center.lon + o.eastNm / (NM_PER_DEG_LAT * cosLat),
  };
}
