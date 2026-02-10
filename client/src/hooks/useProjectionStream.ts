/**
 * useProjectionStream — Client hook for Snapshot + Invalidation projections (OMN-2097)
 *
 * Fetches an initial snapshot via REST, then subscribes to WebSocket invalidation
 * events. On each invalidation, the snapshot is re-fetched (not incrementally patched).
 * This keeps the client implementation simple while the server handles all
 * materialization and merge ordering.
 *
 * Usage:
 * ```tsx
 * const { data, cursor, isLoading, error, isConnected } = useProjectionStream<NodeRegistryPayload>(
 *   'node-registry'
 * );
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ProjectionResponse } from './useProjectionStream.types';

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

export function useProjectionStream<T>(
  viewId: string,
  options?: UseProjectionStreamOptions
): UseProjectionStreamReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [cursor, setCursor] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchInFlightRef = useRef(false);

  const pollingIntervalMs = options?.pollingIntervalMs ?? 10000;
  const disablePolling = options?.disablePolling ?? false;

  // Fetch snapshot from REST API
  const fetchSnapshot = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    try {
      const response = await fetch(`/api/projections/${viewId}/snapshot`);
      if (!response.ok) {
        throw new Error(`Snapshot fetch failed: ${response.status} ${response.statusText}`);
      }

      const snapshot: ProjectionResponse<T> = await response.json();

      if (mountedRef.current) {
        setData(snapshot.payload);
        setCursor(snapshot.cursor);
        setError(null);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch snapshot');
        setIsLoading(false);
      }
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [viewId]);

  // WebSocket connection for invalidation events
  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    fetchSnapshot();

    // Connect to WebSocket
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    const connect = () => {
      if (!mountedRef.current) return;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttempts = 0;

        // Subscribe to this projection's invalidation events
        ws.send(
          JSON.stringify({
            action: 'subscribe',
            topics: [`projection:${viewId}`],
          })
        );

        // Stop polling when connected
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message = JSON.parse(event.data);

          if (message.type === 'PROJECTION_INVALIDATE' && message.data?.viewId === viewId) {
            // Re-fetch snapshot on invalidation
            fetchSnapshot();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);

        // Start polling fallback
        if (!disablePolling && !pollingRef.current) {
          pollingRef.current = setInterval(fetchSnapshot, pollingIntervalMs);
        }

        // Reconnect with backoff
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

    // Start polling fallback immediately (will be cleared when WS connects)
    if (!disablePolling) {
      pollingRef.current = setInterval(fetchSnapshot, pollingIntervalMs);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [viewId, fetchSnapshot, disablePolling, pollingIntervalMs]);

  return {
    data,
    cursor,
    isLoading,
    error,
    isConnected,
    refresh: fetchSnapshot,
  };
}
