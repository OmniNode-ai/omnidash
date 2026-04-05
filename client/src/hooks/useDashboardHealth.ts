/**
 * Dashboard Health Hook (OMN-7566)
 *
 * Fetches /api/health/data-sources via React Query and exposes a helper to
 * check whether a given route has live backing data.
 */

import { useQuery } from '@tanstack/react-query';
import type { DataSourcesHealthResponse } from '@/components/DataSourceHealthPanel';
import { isRouteLiveByHealth } from '@shared/data-source-route-map';

export function useDashboardHealth() {
  const { data } = useQuery<DataSourcesHealthResponse>({
    queryKey: ['health-data-sources'],
    queryFn: async () => {
      const res = await fetch('/api/health/data-sources');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const healthData = data?.dataSources;

  return {
    isRouteLive: (route: string) => isRouteLiveByHealth(route, healthData),
    healthData,
  };
}
