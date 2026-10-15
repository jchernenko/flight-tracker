import type { Aircraft } from '@flight/shared';
import type { LatLon } from '@flight/shared';

export interface FeedProvider {
  readonly name: string;
  /** Aircraft with a known position within `radiusNm` of `center`. Throws on upstream failure. */
  fetchAircraft(center: LatLon, radiusNm: number): Promise<Aircraft[]>;
}
