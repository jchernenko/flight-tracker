import { distanceNm, type Aircraft, type AircraftResponse } from '@flight/shared';

export function aircraftInRange(data: AircraftResponse, rangeNm: number): Aircraft[] {
  return data.aircraft.filter((a) => distanceNm(data.center, a) <= rangeNm);
}
