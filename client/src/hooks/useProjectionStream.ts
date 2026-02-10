/**
 * useProjectionStream — Client hook for Snapshot + Invalidation projections (OMN-2097)
 *
 * Fetches an initial snapshot via REST using TanStack Query, then subscribes to
 * WebSocket invalidation events via the shared useWebSocket hook. On each
 * invalidation, the query cache is invalidated which triggers a re-fetch.
 * When the WebSocket disconnects, TanStack Query's refetchInterval provides
 * automatic polling fallback.
 *
 * Uses the existing useWebSocket hook internally to share a single /ws
 * connection across all components rather than opening a separate connection.
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

export function useProjectionStream<T>(
  viewId: string,
  options?: UseProjectionStreamOptions
): UseProjectionStreamReturn<T> {
  const queryClient = useQueryClient();

  const pollingIntervalMs = options?.pollingIntervalMs ?? 10_000;
  const disablePolling = options?.disablePolling ?? false;

  // Use a ref to track whether we've subscribed to avoid duplicate subscribe calls
  const subscribedRef = useRef(false);

  // Reuse the shared useWebSocket hook to avoid opening a separate /ws connection.
  // Uses the project's established reconnection pattern (stabilization, anti-flicker).
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

  // Subscribe to the projection topic when connected
  useEffect(() => {
    if (isConnected && !subscribedRef.current) {
      subscribe([`projection:${viewId}`]);
      subscribedRef.current = true;
    }
    if (!isConnected) {
      subscribedRef.current = false;
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
