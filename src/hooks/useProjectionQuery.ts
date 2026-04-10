import { useQuery } from '@tanstack/react-query';

// The v2 Express server runs on 3002 and proxies all projection reads from Postgres.
// This is the single fetch primitive for all dashboard components.
const SERVER_BASE = 'http://localhost:3002';

interface UseProjectionQueryOptions {
  queryKey: string[];
  enabled?: boolean;
  refetchInterval?: number;
}

export function useProjectionQuery<T>(endpoint: string, options: UseProjectionQueryOptions) {
  return useQuery<T>({
    queryKey: options.queryKey,
    queryFn: async () => {
      const res = await fetch(`${SERVER_BASE}${endpoint}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}
