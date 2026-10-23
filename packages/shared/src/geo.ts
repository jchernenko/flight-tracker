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
