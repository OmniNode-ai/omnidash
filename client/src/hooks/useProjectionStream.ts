/**
 * useProjectionStream — Generic Projection Polling Hook (OMN-2095)
 *
 * TanStack Query for snapshot polling + WebSocket-driven invalidation.
 *
 * Usage:
 *   const { data, isLoading, error, cursor } = useProjectionStream<EventBusPayload>(
 *     'event-bus',
 *     (params) => fetchEventBusSnapshot(params),
 *     { limit: 200, refetchInterval: 2000 }
 *   );
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectionResponse } from './useProjectionStream.types';

export type { ProjectionResponse };

export interface UseProjectionStreamOptions {
  /** Max events in snapshot (view-specific semantics) */
  limit?: number;
  /** Polling interval in ms (default: 2000) */
  refetchInterval?: number;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

export interface UseProjectionStreamReturn<T> {
  /** Current snapshot data */
  data: ProjectionResponse<T> | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Current cursor position (max ingestSeq in snapshot) */
  cursor: number;
}

type SnapshotFetcher<T> = (params: { limit?: number }) => Promise<ProjectionResponse<T>>;

export function useProjectionStream<T>(
  viewId: string,
  fetcher: SnapshotFetcher<T>,
  options: UseProjectionStreamOptions = {}
): UseProjectionStreamReturn<T> {
  const { limit, refetchInterval = 2000, enabled = true } = options;
  const queryClient = useQueryClient();
  const cursorRef = useRef(0);

  // TanStack Query for snapshot polling
  const { data, isLoading, error } = useQuery<ProjectionResponse<T>, Error>({
    queryKey: queryKeys.projections.snapshot(viewId, limit),
    queryFn: () => fetcher({ limit }),
    refetchInterval,
    enabled,
  });

  // Track cursor from latest snapshot
  if (data?.cursor) {
    cursorRef.current = data.cursor;
  }

  // WebSocket listener for PROJECTION_INVALIDATE messages
  // When the server signals that a view has new data and the cursor
  // is ahead of our cached cursor, invalidate the query to trigger refetch.
  const { isConnected } = useWebSocket({
    onMessage: (msg) => {
      if (msg.type === 'PROJECTION_INVALIDATE' && msg.data && typeof msg.data === 'object') {
        const payload = msg.data as { viewId?: string; cursor?: number };
        if (payload.viewId === viewId && payload.cursor != null) {
          if (payload.cursor > cursorRef.current) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.projections.snapshot(viewId, limit),
            });
          }
        }
      }
    },
  });

  // Reset cursor when viewId changes
  useEffect(() => {
    cursorRef.current = 0;
  }, [viewId]);

  // If WebSocket is connected but no invalidation messages arrive,
  // we still have the refetchInterval polling as a fallback.
  void isConnected;

  return {
    data,
    isLoading,
    error: error ?? null,
    cursor: cursorRef.current,
  };
}
