/**
 * useProjectionStream — Client hook for Snapshot + Invalidation projections (OMN-2097)
 *
 * Fetches an initial snapshot via REST using TanStack Query, then subscribes to
 * WebSocket invalidation events via useWebSocket. On each invalidation, the
 * query cache is invalidated which triggers a re-fetch. When the WebSocket
 * disconnects, TanStack Query's refetchInterval provides automatic polling fallback.
 *
 * NOTE: Each useProjectionStream instance creates its own useWebSocket hook call,
 * which opens a dedicated /ws connection. This is consistent with how other
 * pages use useWebSocket (one connection per hook instance). For the current
 * single-consumer usage in NodeRegistry, this is fine. If multiple projection
 * consumers are needed on the same page, consider extracting a shared
 * WebSocket context provider.
 *
 * Usage:
 * ```tsx
 * const { data, cursor, isLoading, error, isConnected } = useProjectionStream<NodeRegistryPayload>(
 *   'node-registry'
 * );
 * ```
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ProjectionResponse } from '@/hooks/useProjectionStream.types';

export type { ProjectionResponse };

interface UseProjectionStreamOptions {
  /** Disable automatic polling fallback (default: enabled at 10s) */
  disablePolling?: boolean;
  /** Polling interval in ms when WebSocket is disconnected (default: 10000) */
  pollingIntervalMs?: number;
}

interface UseProjectionStreamReturn<T> {
  /** The projection payload, or null before first load */
  data: T | null;
  /** Current cursor position (max ingestSeq in snapshot) */
  cursor: number;
  /** True during initial fetch */
  isLoading: boolean;
  /** Error message, or null */
  error: string | null;
  /** True when WebSocket is delivering invalidation events */
  isConnected: boolean;
  /** Manually trigger a re-fetch */
  refresh: () => void;
}

async function fetchSnapshot<T>(viewId: string): Promise<ProjectionResponse<T>> {
  const response = await fetch(`/api/projections/${viewId}/snapshot`);
  if (!response.ok) {
    throw new Error(`Snapshot fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Subscribe to a server-side projection view with automatic refresh.
 *
 * **Important**: Each call opens its own WebSocket connection. If you need
 * multiple projection streams on the same page, consider extracting a shared
 * WebSocket context provider to avoid redundant connections.
 */
export function useProjectionStream<T>(
  viewId: string,
  options?: UseProjectionStreamOptions
): UseProjectionStreamReturn<T> {
  const queryClient = useQueryClient();

  const pollingIntervalMs = options?.pollingIntervalMs ?? 10_000;
  const disablePolling = options?.disablePolling ?? false;

  // Use a ref to track whether we've subscribed to avoid duplicate subscribe calls
  const subscribedRef = useRef(false);

  // Uses the project's established useWebSocket pattern for reconnection, stabilization,
  // and anti-flicker. Each hook instance opens its own /ws connection (see module comment).
  // reconnectInterval: 1000ms for fast initial reconnect on transient disconnects.
  const { isConnected, subscribe } = useWebSocket({
    onMessage: useCallback(
      (message: { type: string; data?: { viewId?: string } }) => {
        if (message.type === 'PROJECTION_INVALIDATE' && message.data?.viewId === viewId) {
          queryClient.invalidateQueries({ queryKey: ['projection', viewId, 'snapshot'] });
        }
      },
      [viewId, queryClient]
    ),
    reconnectInterval: 1000,
  });

  // Track the viewId that subscribedRef corresponds to
  const subscribedViewIdRef = useRef<string | null>(null);

  // Subscribe to the projection topic when connected (or when viewId changes)
  useEffect(() => {
    if (isConnected && (!subscribedRef.current || subscribedViewIdRef.current !== viewId)) {
      subscribe([`projection:${viewId}`]);
      subscribedRef.current = true;
      subscribedViewIdRef.current = viewId;
    }
    if (!isConnected) {
      subscribedRef.current = false;
      subscribedViewIdRef.current = null;
    }
  }, [isConnected, subscribe, viewId]);

  const {
    data: snapshot,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['projection', viewId, 'snapshot'],
    queryFn: () => fetchSnapshot<T>(viewId),
    // When WebSocket is connected, don't poll — invalidation triggers refetch.
    // When disconnected, fall back to interval polling.
    refetchInterval: !isConnected && !disablePolling ? pollingIntervalMs : false,
    staleTime: 5_000, // Treat data as fresh for 5s to avoid redundant fetches
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projection', viewId, 'snapshot'] });
  }, [queryClient, viewId]);

  return {
    data: snapshot?.payload ?? null,
    cursor: snapshot?.cursor ?? 0,
    isLoading,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : 'Failed to fetch snapshot'
      : null,
    isConnected,
    refresh,
  };
}
