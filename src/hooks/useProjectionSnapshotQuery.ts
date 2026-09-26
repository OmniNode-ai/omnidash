import { useQuery } from '@tanstack/react-query';
import { useSnapshotSource, type ProjectionSnapshot } from '@/data-source';
import { useFrameStore } from '@/store/store';

interface ProjectionSnapshotQueryOptions {
  topic: string;
  queryKey: string[];
  params?: Readonly<Record<string, string>>;
  enabled?: boolean;
  refetchInterval?: number | false;
}

async function readSnapshot<T>(
  source: ReturnType<typeof useSnapshotSource>,
  topic: string,
  params: Readonly<Record<string, string>> | undefined,
): Promise<ProjectionSnapshot<T>> {
  if (source.readSnapshot) {
    return source.readSnapshot(topic, params) as Promise<ProjectionSnapshot<T>>;
  }
  const rows: T[] = [];
  for await (const row of source.readAll(topic)) rows.push(row as T);
  return {
    rows,
    rowCount: rows.length,
    dataFreshness: 'unknown',
    latestEventAt: null,
    readAt: new Date().toISOString(),
  };
}

/** Projection rows plus the freshness envelope the legacy row-only hook drops. */
export function useProjectionSnapshotQuery<T>(options: ProjectionSnapshotQueryOptions) {
  const source = useSnapshotSource();
  const globalInterval = useFrameStore((state) => state.globalFilters.autoRefreshInterval);
  const refetchInterval = globalInterval === null
    ? false
    : (globalInterval ?? options.refetchInterval);
  const paramsKey = JSON.stringify(options.params ?? {});

  return useQuery<ProjectionSnapshot<T>>({
    queryKey: [...options.queryKey, paramsKey],
    queryFn: () => readSnapshot<T>(source, options.topic, options.params),
    enabled: options.enabled ?? true,
    refetchInterval,
  });
}
