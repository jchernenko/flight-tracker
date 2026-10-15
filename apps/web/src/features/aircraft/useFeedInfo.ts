import { useQuery } from '@tanstack/react-query';
import type { Health } from '@flight/shared';
import { api } from '../../lib/api';

/** Names for the feed and home point. They don't change while the server runs. */
export function useFeedInfo(): Health | undefined {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.api.health.$get();
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()).data;
    },
    staleTime: Infinity,
    retry: true,
    retryDelay: 5000,
  });
  return data;
}
