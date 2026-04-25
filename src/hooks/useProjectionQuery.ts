import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createSnapshotSource } from '../data-source';
import { useFrameStore } from '../store/store';

interface UseProjectionQueryOptions {
  queryKey: string[];
  topic: string;            // NEW — topic the caller wants to read
  enabled?: boolean;
  refetchInterval?: number;
}

export function useProjectionQuery<T>(options: UseProjectionQueryOptions) {
  const source = useMemo(() => createSnapshotSource(), []);

  // OMN-126: dashboard-level auto-refresh override. The
  // `AutoRefreshSelector` writes `globalFilters.autoRefreshInterval`,
  // and every projection query honours it:
  //   - `null`  → user explicitly turned auto-refresh off; pass
  //               `false` to react-query so no refetching happens.
  //   - number  → override whatever the widget supplied; the global
  //               wins so all widgets refresh on the same cadence.
  //   - undefined → no global preference; fall back to the widget's
  //                 own `options.refetchInterval` (existing behavior).
  const globalInterval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const refetchInterval =
    globalInterval === null
      ? false
      : (globalInterval ?? options.refetchInterval);

  return useQuery<T[]>({
    queryKey: options.queryKey,
    queryFn: async () => {
      const out: T[] = [];
      for await (const s of source.readAll(options.topic)) out.push(s as T);
      return out;
    },
    enabled: options.enabled ?? true,
    refetchInterval,
  });
}
