import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createSnapshotSource } from '../data-source';

interface UseProjectionQueryOptions {
  queryKey: string[];
  topic: string;            // NEW — topic the caller wants to read
  enabled?: boolean;
  refetchInterval?: number;
}

export function useProjectionQuery<T>(options: UseProjectionQueryOptions) {
  const source = useMemo(() => createSnapshotSource(), []);
  return useQuery<T[]>({
    queryKey: options.queryKey,
    queryFn: async () => {
      const out: T[] = [];
      for await (const s of source.readAll(options.topic)) out.push(s as T);
      return out;
    },
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}
