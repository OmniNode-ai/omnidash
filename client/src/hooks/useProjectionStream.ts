/**
 * useProjectionStream — Client hook for Snapshot + Invalidation projections (OMN-2097)
 *
 * Fetches an initial snapshot via REST using TanStack Query, then subscribes to
 * WebSocket invalidation events. On each invalidation, the query cache is
 * invalidated which triggers a re-fetch. When the WebSocket disconnects,
 * TanStack Query's refetchInterval provides automatic polling fallback.
 *
 * Usage:
 * ```tsx
 * const { data, cursor, isLoading, error, isConnected } = useProjectionStream<NodeRegistryPayload>(
 *   'node-registry'
 * );
 * ```
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const pollingIntervalMs = options?.pollingIntervalMs ?? 10_000;
  const disablePolling = options?.disablePolling ?? false;

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

  // WebSocket connection for invalidation events
  useEffect(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    let mounted = true;

    const connect = () => {
      if (!mounted) return;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mounted) return;
        setIsConnected(true);
        reconnectAttempts = 0;
        ws.send(JSON.stringify({ action: 'subscribe', topics: [`projection:${viewId}`] }));
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'PROJECTION_INVALIDATE' && message.data?.viewId === viewId) {
            queryClient.invalidateQueries({ queryKey: ['projection', viewId, 'snapshot'] });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setIsConnected(false);

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [viewId, queryClient]);

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
