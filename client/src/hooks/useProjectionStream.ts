/**
 * useProjectionStream — Generic Projection Polling Hook (OMN-2095)
 *
 * TanStack Query for snapshot polling + WebSocket-driven invalidation.
 *
 * WARNING: Each hook instance creates its own WebSocket connection via useWebSocket.
 * Currently only EventBusMonitor uses this hook — a single connection is fine.
 * Before adding a second consumer, lift the WebSocket connection to a shared
 * React context (e.g. ProjectionWebSocketProvider) to avoid duplicate connections
 * and redundant PROJECTION_INVALIDATE handling.
 *
 * Mount/unmount lifecycle: on unmount, useWebSocket's cleanup effect closes the
 * connection (after a 3-second stabilization delay for rapid navigation). On
 * remount, a fresh WebSocket connects and re-subscribes. During the brief overlap,
 * TanStack Query's refetchInterval ensures data continuity — no events are lost.
 *
 * Usage:
 *   const { data, isLoading, error, cursor } = useProjectionStream<EventBusPayload>(
 *     'event-bus',
 *     (params) => fetchEventBusSnapshot(params),
 *     { limit: 200, refetchInterval: 2000 }
 *   );
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectionResponse } from '@/hooks/useProjectionStream.types';

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
  /** Current cursor position (max ingestSeq in snapshot). Reactive — derived from `data?.cursor`. */
  cursor: number;
  /** Whether the WebSocket connection is active */
  isConnected: boolean;
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
  // Allow cursor=0 so that server-side resets are reflected in the client;
  // otherwise cursorRef would hold a stale high-water-mark after reset.
  useEffect(() => {
    if (data?.cursor != null) {
      cursorRef.current = data.cursor;
    }
  }, [data?.cursor]);

  // Stable callback for PROJECTION_INVALIDATE messages.
  // Uses useCallback so the closure captures current viewId and limit,
  // avoiding stale query-key references if either value changes.
  const handleProjectionMessage = useCallback(
    (msg: { type: string; data?: unknown }) => {
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
    [viewId, limit, queryClient]
  );

  // WebSocket connection with explicit subscription to 'projections' topic.
  // The server uses a subscription model — clients must subscribe to receive
  // messages for a given topic. onOpen fires after each (re)connection.
  //
  // Note: The subscription topic is always ['projections'] regardless of viewId.
  // PROJECTION_INVALIDATE messages include a viewId field that handleProjectionMessage
  // filters on, so a single subscription covers all views. If viewId or limit changes
  // after the WebSocket connects, onOpen won't re-fire, but this is safe because the
  // subscription topic is static. Only handleProjectionMessage (updated via ref) needs
  // the current viewId, and useWebSocket reads callbacks from refs.
  const { isConnected, subscribe } = useWebSocket({
    onOpen: () => {
      subscribe(['projections']);
    },
    onMessage: handleProjectionMessage,
  });

  // Reset cursor when viewId changes
  useEffect(() => {
    cursorRef.current = 0;
  }, [viewId]);

  return {
    data,
    isLoading,
    error: error ?? null,
    cursor: data?.cursor ?? 0,
    isConnected,
  };
}
