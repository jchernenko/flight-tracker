import type { FeedProvider } from './types.js';
import { fetchReadsbJson } from './http.js';
import { normalizeReadsb } from './readsb-format.js';

/** adsb.lol and airplanes.live share the same "aircraft within N nm of a point" API. */
export function createPointApiProvider(name: string, label: string, baseUrl: string): FeedProvider {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    name,
    label,
    async fetchAircraft(center, radiusNm) {
      const radius = Math.min(250, Math.ceil(radiusNm));
      const lat = center.lat.toFixed(4);
      const lon = center.lon.toFixed(4);
      const payload = await fetchReadsbJson(`${base}/v2/point/${lat}/${lon}/${radius}`, 10_000);
      return normalizeReadsb(payload);
    },
  };
}
