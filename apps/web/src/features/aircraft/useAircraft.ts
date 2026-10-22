import { useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { distanceNm, snapToGrid, type AircraftResponse, type LatLon } from '@flight/shared';
import { api } from '../../lib/api';
import { trackHistory } from '../radar/trails';

export const POLL_INTERVAL_MS = 5000;

/** The aircraft picture plus when this browser received it (performance.now() clock), for dead-reckoning. */
export type AircraftSnapshot = AircraftResponse & { receivedAt: number };

const HOME_KEY = ['aircraft', null] as const;

/**
 * The live picture around home, or around `at` (the phone's position in follow
 * mode). The home picture is reused while it still covers `rangeNm` around
 * `at`, so a phone near home costs no extra upstream calls; further away the
 * API is asked for the grid cell the phone is in. Either way the snapshot's
 * centre is `at`, so the views and distances are measured from the phone.
 */
export function useAircraft(at: LatLon | null = null, rangeNm = 0) {
  const queryClient = useQueryClient();
  const home = queryClient.getQueryData<AircraftSnapshot>(HOME_KEY);
  const covered = home && at && distanceNm(home.center, at) + rangeNm <= home.radiusNm;
  const area = at && !covered ? snapToGrid(at) : null;

  const query = useQuery({
    queryKey: ['aircraft', area],
    queryFn: async (): Promise<AircraftSnapshot> => {
      const res = await api.api.aircraft.$get({
        query: area ? { lat: String(area.lat), lon: String(area.lon) } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const body = await res.json();
      // Recorded here, not in a view, so trails survive switching between radar and map.
      trackHistory.record(body.data);
      return { ...body.data, receivedAt: performance.now() };
    },
    refetchInterval: POLL_INTERVAL_MS,
    // Moving into another area keeps showing the last picture until the new one arrives.
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const raw = query.data;
  const data = useMemo(
    () => (raw && at ? { ...raw, center: at } : raw),
    [raw, at?.lat, at?.lon], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { ...query, data };
}
