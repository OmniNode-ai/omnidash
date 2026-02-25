/**
 * useRegistryDiscovery Hook
 *
 * Fetches registry discovery data from the API with automatic refresh.
 * Supports filtering by node state, type, and capability.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { RegistryDiscoveryData } from '@/lib/configs/registry-discovery-dashboard';

export interface RegistryDiscoveryFilters {
  /** Filter by node state (e.g., 'active', 'pending', 'failed') */
  state?: string;
  /** Filter by node type (e.g., 'EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR') */
  type?: string;
  /** Filter by capability keyword */
  capability?: string;
}

export interface UseRegistryDiscoveryOptions extends RegistryDiscoveryFilters {
  /** Enable or disable the query (default: true) */
  enabled?: boolean;
  /** Refresh interval in milliseconds (default: 30000) */
  refetchInterval?: number;
}

export interface UseRegistryDiscoveryResult {
  /** The fetched registry discovery data */
  data: RegistryDiscoveryData | undefined;
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching data */
  isError: boolean;
  /** The error if any */
  error: Error | null;
  /** Whether the query is currently fetching (includes background refetches) */
  isFetching: boolean;
  /** Manually refetch the data */
  refetch: UseQueryResult<RegistryDiscoveryData>['refetch'];
  /** Timestamp when data was last updated (milliseconds since epoch) */
  dataUpdatedAt: number;
}

/**
 * Fetch registry discovery data from the API.
 */
async function fetchRegistryDiscovery(
  filters: RegistryDiscoveryFilters
): Promise<RegistryDiscoveryData> {
  const params = new URLSearchParams();

  if (filters.state) {
    params.set('state', filters.state);
  }
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.capability) {
    params.set('capability', filters.capability);
  }

  const queryString = params.toString();
  const url = `/api/registry/discovery${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry discovery: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Hook for fetching registry discovery data.
 *
 * @example Basic usage
 * ```tsx
 * const { data, isLoading } = useRegistryDiscovery();
 * ```
 *
 * @example With filters
 * ```tsx
 * const { data, isLoading } = useRegistryDiscovery({
 *   state: 'active',
 *   type: 'EFFECT',
 * });
 * ```
 *
 * @example Custom refresh interval
 * ```tsx
 * const { data, isLoading } = useRegistryDiscovery({
 *   refetchInterval: 10000, // 10 seconds
 * });
 * ```
 */
export function useRegistryDiscovery(
  options: UseRegistryDiscoveryOptions = {}
): UseRegistryDiscoveryResult {
  const { state, type, capability, enabled = true, refetchInterval = 30000 } = options;

  const filters: RegistryDiscoveryFilters = { state, type, capability };

  const query = useQuery({
    queryKey: ['registry-discovery', filters],
    queryFn: () => fetchRegistryDiscovery(filters),
    enabled,
    refetchInterval,
    staleTime: 5000, // Consider data fresh for 5 seconds
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
