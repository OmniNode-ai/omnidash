/**
 * useDemoProjectionStream (OMN-2298)
 *
 * Demo-mode-aware wrapper around useProjectionStream.
 *
 * When demo mode is active, returns a static canned snapshot instead of
 * polling the server. The return type is identical to useProjectionStream
 * so callers can swap the two hooks without changing downstream code.
 *
 * Usage (EventBusMonitor):
 *   const { data, isLoading, isConnected } = useDemoProjectionStream<EventBusPayload>(
 *     'event-bus',
 *     getDemoEventBusSnapshot,
 *     fetchEventBusSnapshot,
 *     { limit: maxEvents, refetchInterval: 2000 }
 *   );
 */

import { useMemo } from 'react';
import { useProjectionStream, type UseProjectionStreamOptions } from '@/hooks/useProjectionStream';
import { useDemoMode } from '@/contexts/DemoModeContext';
import type { ProjectionResponse } from '@/hooks/useProjectionStream.types';

type SnapshotFetcher<T> = (params: { limit?: number }) => Promise<ProjectionResponse<T>>;

export interface UseDemoProjectionStreamReturn<T> {
  data: ProjectionResponse<T> | undefined;
  isLoading: boolean;
  error: Error | null;
  cursor: number;
  isConnected: boolean;
  refresh: () => void;
  /** True when the data is sourced from the canned demo dataset. */
  isDemo: boolean;
}

/**
 * Returns demo data when demo mode is active; delegates to useProjectionStream
 * for live data otherwise.
 *
 * @param viewId - Projection view identifier (e.g. 'event-bus')
 * @param demoPayloadFactory - Returns the canned T payload for demo mode
 * @param liveFetcher - Passed through to useProjectionStream when live
 * @param options - Standard projection stream options
 */
export function useDemoProjectionStream<T>(
  viewId: string,
  demoPayloadFactory: () => T,
  liveFetcher?: SnapshotFetcher<T>,
  options: UseProjectionStreamOptions = {}
): UseDemoProjectionStreamReturn<T> {
  const { isDemoMode } = useDemoMode();

  // Build a static demo snapshot whenever demo mode is on.
  // Re-computed each render so timestamps stay fresh.
  const demoSnapshot = useMemo((): ProjectionResponse<T> | undefined => {
    if (!isDemoMode) return undefined;
    return {
      viewId,
      cursor: 9999,
      snapshotTimeMs: Date.now(),
      payload: demoPayloadFactory(),
    };
    // demoPayloadFactory is a stable module-level function; no dep needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, viewId]);

  // Always call useProjectionStream (hooks must not be conditional).
  // Disable it when demo mode is on so we don't waste network connections.
  const liveStream = useProjectionStream<T>(viewId, liveFetcher, {
    ...options,
    enabled: !isDemoMode,
  });

  if (isDemoMode) {
    return {
      data: demoSnapshot,
      isLoading: false,
      error: null,
      cursor: 9999,
      isConnected: false,
      refresh: () => {},
      isDemo: true,
    };
  }

  return { ...liveStream, isDemo: false };
}
