/**
 * useDashboardData Hook
 *
 * Single fetch hook for dashboard data. The dashboard fetches once,
 * and widgets select their data via keys.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';

/**
 * Data provider function type.
 * Takes a data source identifier and returns dashboard data.
 */
export type DashboardDataProvider = (dataSource: string) => Promise<DashboardData>;

interface UseDashboardDataOptions {
  /** Dashboard configuration containing data_source and refresh settings */
  config: DashboardConfig;
  /** Function that fetches data for the given data source */
  dataProvider: DashboardDataProvider;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

interface UseDashboardDataResult {
  /** The fetched dashboard data */
  data: DashboardData | undefined;
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching data */
  isError: boolean;
  /** The error if any */
  error: Error | null;
  /** Manually refetch the data */
  refetch: UseQueryResult<DashboardData>['refetch'];
}

/**
 * Hook for fetching dashboard data.
 *
 * Makes a single API call per dashboard, with automatic refresh
 * based on the dashboard's refresh_interval_seconds setting.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useDashboardData({
 *   config: myDashboardConfig,
 *   dataProvider: async (source) => {
 *     const response = await fetch(`/api/dashboards/${source}`);
 *     return response.json();
 *   },
 * });
 *
 * return <DashboardRenderer config={config} data={data ?? {}} isLoading={isLoading} />;
 * ```
 */
export function useDashboardData({
  config,
  dataProvider,
  enabled = true,
}: UseDashboardDataOptions): UseDashboardDataResult {
  const query = useQuery({
    queryKey: ['dashboard-data', config.dashboard_id, config.data_source],
    queryFn: () => dataProvider(config.data_source),
    enabled,
    refetchInterval: config.refresh_interval_seconds
      ? config.refresh_interval_seconds * 1000
      : undefined,
    staleTime: 5000, // Consider data fresh for 5s
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
