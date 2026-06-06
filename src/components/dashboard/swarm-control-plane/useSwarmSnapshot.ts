import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { SwarmRunRow } from './swarm-control-plane.types';

const REFRESH_INTERVAL_MS = 5_000;

export interface SwarmSnapshot {
  runs: SwarmRunRow[];
  isLoading: boolean;
  hasAnyData: boolean;
  error: Error | null;
  capturedAt: string | null;
}

export function useSwarmSnapshot(): SwarmSnapshot {
  const query = useProjectionQuery<SwarmRunRow>({
    queryKey: ['swarm-control-plane', 'runs'],
    topic: TOPICS.swarmRuns,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const runs: SwarmRunRow[] = query.data != null ? query.data : [];
  const capturedAt = runs.length > 0 ? (runs[0].created_at != null ? runs[0].created_at : null) : null;

  return {
    runs,
    isLoading: query.isLoading,
    hasAnyData: runs.length > 0,
    error: (query.error as Error | null) ?? null,
    capturedAt,
  };
}
