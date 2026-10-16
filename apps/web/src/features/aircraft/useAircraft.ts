import { useQuery } from '@tanstack/react-query';
import type { AircraftResponse } from '@flight/shared';
import { api } from '../../lib/api';
import { trackHistory } from '../radar/trails';

export const POLL_INTERVAL_MS = 5000;

/** The aircraft picture plus when this browser received it (performance.now() clock), for dead-reckoning. */
export type AircraftSnapshot = AircraftResponse & { receivedAt: number };

export function useAircraft() {
  return useQuery({
    queryKey: ['aircraft'],
    queryFn: async (): Promise<AircraftSnapshot> => {
      const res = await api.api.aircraft.$get();
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
    retry: 1,
  });
}
