export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Grid the API caches away-from-home pictures on: 0.05° is about 3 nm north–south. */
export const AREA_GRID_DEG = 0.05;

/**
 * The grid point a location's picture is fetched around, so nearby phones share
 * one upstream call. Off by at most ~2 nm, which the 60 nm fetch radius absorbs.
 */
export function snapToGrid(p: LatLon): LatLon {
  const snap = (deg: number) =>
    Number((Math.round(deg / AREA_GRID_DEG) * AREA_GRID_DEG).toFixed(2));
  return { lat: snap(p.lat), lon: snap(p.lon) };
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Points along the great circle from a to b, about every `stepNm`, for
 * drawing a route line. Longitudes are unwrapped (they may pass ±180) so a
 * line over the Pacific never jumps across the map.
 */
export function greatCircle(a: LatLon, b: LatLon, stepNm = 25): LatLon[] {
  const vec = (p: LatLon) => {
    const lat = toRad(p.lat);
    const lon = toRad(p.lon);
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)] as const;
  };
  const va = vec(a);
  const vb = vec(b);
  const angle = distanceNm(a, b) / EARTH_RADIUS_NM;
  const steps = Math.min(200, Math.max(1, Math.ceil((angle * EARTH_RADIUS_NM) / stepNm)));
  const points: LatLon[] = [];
  let prevLon = a.lon;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    // Spherical interpolation; a straight blend for points too close to tell apart.
    const [wa, wb] =
      angle < 1e-9
        ? [1 - f, f]
        : [Math.sin((1 - f) * angle) / Math.sin(angle), Math.sin(f * angle) / Math.sin(angle)];
    const x = wa * va[0] + wb * vb[0];
    const y = wa * va[1] + wb * vb[1];
    const z = wa * va[2] + wb * vb[2];
    let lon = toDeg(Math.atan2(y, x));
    lon += Math.round((prevLon - lon) / 360) * 360;
    prevLon = lon;
    points.push({ lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon });
  }
  return points;
}
