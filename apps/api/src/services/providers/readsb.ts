import type { FeedProvider } from './types.js';
import { fetchReadsbJson } from './http.js';
import { normalizeReadsb } from './readsb-format.js';
import { distanceNm } from '@flight/shared';

/** A home receiver running readsb / dump1090, serving its aircraft.json on the LAN. */
export function createReadsbProvider(url: string): FeedProvider {
  return {
    name: 'readsb',
    async fetchAircraft(center, radiusNm) {
      const payload = await fetchReadsbJson(url, 5_000);
      return normalizeReadsb(payload).filter((a) => distanceNm(center, a) <= radiusNm);
    },
  };
}
