/**
 * useDataSource — DataSourceWithFallback hook (OMN-5202)
 *
 * Wraps useQuery with graceful degradation for local-dev environments where
 * Kafka/DB isn't running. On a network error or non-2xx response, instead of
 * throwing (which breaks the page), it returns `source: 'unavailable'` and
 * the provided `fallbackData`.
 *
 * Usage:
 *   const { data, source, isLoading } = useDataSource({
 *     queryKey: ['my-key'],
 *     queryFn: async () => { ... },
 *     fallbackData: { events: [], summary: null },
 *   });
 *
 *   // Show banner when data is coming from fallback
 *   {source === 'unavailable' && <LocalDataUnavailableBanner />}
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

export type DataSourceStatus = 'live' | 'empty' | 'unavailable';

export interface UseDataSourceOptions<TData> {
  queryKey: UseQueryOptions<TData>['queryKey'];
  queryFn: () => Promise<TData>;
  /** Data to return when the API is unavailable (network error or 5xx). */
  fallbackData: TData;
  /**
   * Optional predicate to detect "empty but live" vs "unavailable".
   * When omitted, any successful response is treated as 'live'.
   */
  isEmpty?: (data: TData) => boolean;
  refetchInterval?: number;
  staleTime?: number;
  enabled?: boolean;
}

export interface UseDataSourceResult<TData> {
  data: TData;
  source: DataSourceStatus;
  isLoading: boolean;
  /** True only when the first load is in flight (no cached data yet). */
  isInitialLoading: boolean;
  refetch: () => void;
}

export function useDataSource<TData>({
  queryKey,
  queryFn,
  fallbackData,
  isEmpty,
  refetchInterval,
  staleTime = 15_000,
  enabled = true,
}: UseDataSourceOptions<TData>): UseDataSourceResult<TData> {
  const query = useQuery<TData, Error>({
    queryKey,
    queryFn,
    refetchInterval,
    staleTime,
    enabled,
    // Never throw — surface the error as `source: 'unavailable'` instead.
    retry: 1,
    throwOnError: false,
  });

  let data: TData;
  let source: DataSourceStatus;

  if (query.isError || query.data === undefined) {
    data = fallbackData;
    source = query.isError ? 'unavailable' : 'live';
  } else {
    data = query.data;
    if (isEmpty && isEmpty(data)) {
      source = 'empty';
    } else {
      source = 'live';
    }
  }

  return {
    data,
    source,
    isLoading: query.isLoading,
    isInitialLoading: query.isLoading && query.fetchStatus === 'fetching',
    refetch: () => {
      void query.refetch();
    },
  };
}
