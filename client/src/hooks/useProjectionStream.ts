/**
 * useProjectionStream Hook (OMN-2096)
 *
 * Generic hook for consuming server-side projection snapshots via
 * WebSocket invalidation. One hook, one invalidation subscription,
 * one cache policy.
 *
 * Flow:
 * 1. Fetch initial snapshot via HTTP on mount
 * 2. Subscribe to 'projection-invalidate' on WebSocket
 * 3. On invalidation where viewId matches and cursor > local: re-fetch snapshot
 * 4. On invalidation where cursor <= local: ignore (stale)
 *
 * No polling. WS invalidation is the only trigger for re-fetches.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import type { ProjectionSnapshot } from '@shared/projection-types';

// Re-export for consumers that previously imported from here
export type { ProjectionSnapshot } from '@shared/projection-types';

// ============================================================================
// Types
// ============================================================================

export interface UseProjectionStreamOptions {
  /** Query limit for snapshot requests (default 100, max 500) */
  limit?: number;
  /** Fetch initial snapshot on mount (default true) */
  fetchOnMount?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

export interface UseProjectionStreamReturn<T> {
  /** Current snapshot payload (null until first fetch completes) */
  snapshot: T | null;
  /** Current cursor position */
  cursor: number;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Connection status */
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Error state */
  error: Error | null;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Manually trigger a snapshot refresh */
  refresh: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useProjectionStream<T>(
  viewId: string,
  options: UseProjectionStreamOptions = {}
): UseProjectionStreamReturn<T> {
  const { limit = 100, fetchOnMount = true, debug = false } = options;

  const [snapshot, setSnapshot] = useState<T | null>(null);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cursorRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const viewIdRef = useRef(viewId);
  const hasSubscribed = useRef(false);
  const isConnectedRef = useRef(false);
  const prevViewIdRef = useRef<string | null>(null);

  // Keep viewIdRef in sync so fetchSnapshot can detect stale responses
  viewIdRef.current = viewId;

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(`[ProjectionStream:${viewId}]`, ...args);
      }
    },
    [debug, viewId]
  );

  // Fetch snapshot from REST endpoint
  const fetchSnapshot = useCallback(async () => {
    if (fetchInFlightRef.current) {
      log('Fetch already in flight, skipping');
      return;
    }

    fetchInFlightRef.current = true;
    setIsLoading(true);

    try {
      const url = `/api/projections/${encodeURIComponent(viewId)}/snapshot?limit=${limit}`;
      log('Fetching snapshot:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Snapshot fetch failed: ${response.status} ${response.statusText}`);
      }

      const data: ProjectionSnapshot<T> = await response.json();

      if (!mountedRef.current) return;

      // Guard against stale response from a previous viewId
      if (data.viewId !== viewIdRef.current) {
        log('Stale viewId response ignored, expected:', viewIdRef.current, 'got:', data.viewId);
        return;
      }

      // Only apply if cursor advanced (or first fetch)
      if (data.cursor >= cursorRef.current) {
        cursorRef.current = data.cursor;
        setCursor(data.cursor);
        setSnapshot(data.payload);
        setError(null);
        log('Snapshot applied, cursor:', data.cursor);
      } else {
        log('Stale snapshot ignored, local:', cursorRef.current, 'received:', data.cursor);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);
      log('Fetch error:', fetchError.message);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      fetchInFlightRef.current = false;
    }
  }, [viewId, limit, log]);

  // Handle WebSocket messages — filter for PROJECTION_INVALIDATE matching our viewId
  const handleMessage = useCallback(
    (message: { type: string; data?: unknown; timestamp: string }) => {
      if (message.type !== 'PROJECTION_INVALIDATE') return;

      const data = message.data as { viewId?: string; cursor?: number } | undefined;
      if (!data || data.viewId !== viewId) return;

      const remoteCursor = data.cursor ?? 0;

      if (remoteCursor > cursorRef.current) {
        log('Invalidation received, remote cursor:', remoteCursor, '> local:', cursorRef.current);
        fetchSnapshot().catch(() => {}); // errors handled inside via setError
      } else {
        log('Stale invalidation ignored, remote:', remoteCursor, 'local:', cursorRef.current);
      }
    },
    [viewId, fetchSnapshot, log]
  );

  // Single WebSocket connection
  const {
    isConnected,
    connectionStatus,
    error: wsError,
    subscribe,
    unsubscribe,
  } = useWebSocket({
    onMessage: handleMessage,
    debug,
  });

  // Keep ref in sync for cleanup
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Subscribe to projection-invalidate topic when connected.
  // On reconnection, re-fetch the snapshot to catch up on any events
  // that arrived while the WebSocket was disconnected.
  useEffect(() => {
    if (isConnected && !hasSubscribed.current) {
      const isReconnect = cursorRef.current > 0;
      log('Subscribing to projection-invalidate', isReconnect ? '(reconnect)' : '(initial)');
      subscribe(['projection-invalidate']);
      hasSubscribed.current = true;

      // Catch-up fetch on reconnect to bridge the disconnect gap
      if (isReconnect) {
        log('Reconnect detected, fetching latest snapshot');
        fetchSnapshot().catch(() => {}); // errors handled inside via setError
      }
    }

    if (!isConnected) {
      hasSubscribed.current = false;
    }

    return () => {
      if (hasSubscribed.current && isConnectedRef.current) {
        unsubscribe(['projection-invalidate']);
        hasSubscribed.current = false;
      }
    };
  }, [isConnected, subscribe, unsubscribe, log, fetchSnapshot]);

  // Reset state and fetch. State is only reset when viewId changes (not on
  // limit-only changes) to prevent a flash of empty content. The effect still
  // fires on limit changes (via fetchSnapshot identity) to re-fetch with the
  // new limit, but preserves existing snapshot/cursor during the fetch.
  useEffect(() => {
    mountedRef.current = true;

    // Reset state only when viewId actually changes
    if (prevViewIdRef.current !== null && prevViewIdRef.current !== viewId) {
      cursorRef.current = 0;
      setCursor(0);
      setSnapshot(null);
      setError(null);
      fetchInFlightRef.current = false;
    }
    prevViewIdRef.current = viewId;

    if (fetchOnMount) {
      fetchSnapshot().catch(() => {}); // errors handled inside via setError
    }
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnMount, fetchSnapshot, viewId]);

  const combinedError = error || (wsError ? new Error(wsError) : null);

  return {
    snapshot,
    cursor,
    isConnected,
    connectionStatus,
    error: combinedError,
    isLoading,
    refresh: fetchSnapshot,
  };
}
