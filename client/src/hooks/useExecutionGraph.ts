/**
 * useExecutionGraph Hook (OMN-2302)
 *
 * Connects the Execution Graph page to live ONEX node events via WebSocket.
 * Maintains a live graph by normalising incoming WS messages through the
 * shared normaliser (normalizeWsEvent / applyEventToGraph).
 *
 * Also fetches historical execution graphs from REST on mount so the user can
 * replay past correlation IDs.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import {
  normalizeWsEvent,
  applyEventToGraph,
  createInitialGraph,
} from '@/components/execution-graph/normalizeGraphEvents';
import type { ExecutionGraph } from '@/components/execution-graph/executionGraphTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One historical execution returned from GET /api/executions/recent */
export interface HistoricalExecution {
  correlationId: string;
  latestTimestamp: string;
  eventCount: number;
  /** Raw WS-shaped events, each with { type, data, timestamp } */
  events: Array<{ type: string; data: unknown; timestamp: string }>;
}

export interface UseExecutionGraphReturn {
  /** Live graph built from the current stream of WS events */
  liveGraph: ExecutionGraph;
  /** Historical executions from REST */
  historicalExecutions: HistoricalExecution[];
  /** Whether the WS connection is active */
  isLive: boolean;
  /** Currently displayed correlation ID (null = live stream) */
  selectedCorrelationId: string | null;
  /** Switch the inspector to a specific historical correlation ID */
  setSelectedCorrelationId: (id: string | null) => void;
  /**
   * When a historical correlation ID is selected, this holds the reconstructed
   * graph for that execution. Null when in live-stream mode.
   */
  selectedHistoricalGraph: ExecutionGraph | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of recent correlation IDs to track in the live ring buffer */
const MAX_RING_SIZE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connects the Execution Graph page to live ONEX node events.
 *
 * Data paths:
 * - **Live**: WebSocket topic `execution-graph` — incoming events are
 *   normalised via `normalizeWsEvent` / `applyEventToGraph` and accumulated
 *   into `liveGraph` in real time.
 * - **Historical**: REST `GET /api/executions/recent` polled every 60 s.
 *   Selecting a past correlation ID reconstructs the full graph from its
 *   stored events and caches the result.
 *
 * @returns {UseExecutionGraphReturn} Live graph, historical executions, WS
 *   connection state, and selection helpers.
 *
 * @example
 * ```tsx
 * function ExecutionGraphPage() {
 *   const {
 *     liveGraph,
 *     historicalExecutions,
 *     isLive,
 *     selectedCorrelationId,
 *     setSelectedCorrelationId,
 *     selectedHistoricalGraph,
 *   } = useExecutionGraph();
 *
 *   const graph = selectedHistoricalGraph ?? liveGraph;
 *   return <GraphCanvas graph={graph} isLive={isLive} />;
 * }
 * ```
 */
export function useExecutionGraph(): UseExecutionGraphReturn {
  // Live graph — always reflects the latest events on the active correlation ID
  const [liveGraph, setLiveGraph] = useState<ExecutionGraph>(() =>
    createInitialGraph(`live-${Date.now()}`)
  );

  // Ring of recent correlation IDs seen in the live stream (capped at MAX_RING_SIZE)
  const correlationRingRef = useRef<string[]>([]);

  // Track which correlation ID the current live graph belongs to
  const activeCorrelationIdRef = useRef<string | null>(null);

  // Inspector selection (null = follow live stream)
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);

  // Historical graph cache: correlationId → reconstructed ExecutionGraph
  const historicalGraphCacheRef = useRef<Map<string, ExecutionGraph>>(new Map());

  // Snapshot of the previous historicalExecutions array used for selective
  // cache invalidation (see the eviction useEffect below).
  const prevExecutionsRef = useRef<HistoricalExecution[]>([]);

  // ─── WebSocket ───────────────────────────────────────────────────────────

  // `handleMessage` is intentionally kept stable via useCallback with an empty
  // dependency array. `useWebSocket` stores the latest `onMessage` callback in
  // an internal ref, so identity changes on this function never cause the WS
  // connection to be torn down and re-established. Registering a new callback
  // instance on every render is therefore safe — duplicate registration is not
  // a risk.
  const handleMessage = useCallback((msg: { type: string; data?: unknown; timestamp: string }) => {
    // We only care about the EXECUTION_GRAPH_EVENT wrapper that websocket.ts
    // sends when actionUpdate / routingUpdate / transformationUpdate fires.
    if (msg.type !== 'EXECUTION_GRAPH_EVENT') return;

    // The inner message is in msg.data (broadcasted as { type, data })
    const inner = msg.data as { type: string; data: unknown } | undefined;
    if (!inner) return;

    // Build the WS-shaped message that normalizeWsEvent expects
    const wsMessage = {
      type: inner.type,
      data: inner.data,
      timestamp: msg.timestamp,
    };

    const graphEvents = normalizeWsEvent(wsMessage);
    if (!graphEvents || graphEvents.length === 0) return;

    // All events in this batch share the same correlationId (first one wins)
    const correlationId = graphEvents[0].correlationId;

    // Update correlation ring buffer
    if (!correlationRingRef.current.includes(correlationId)) {
      correlationRingRef.current = [correlationId, ...correlationRingRef.current].slice(
        0,
        MAX_RING_SIZE
      );
    }

    // Update live graph: if correlationId changes, start a new graph
    setLiveGraph((prev) => {
      let base = prev;
      if (activeCorrelationIdRef.current !== correlationId) {
        activeCorrelationIdRef.current = correlationId;
        base = createInitialGraph(correlationId);
      }
      return graphEvents.reduce((g, e) => applyEventToGraph(g, e), base);
    });
  }, []);

  const { isConnected, subscribe } = useWebSocket({
    onMessage: handleMessage,
  });

  // Re-subscribe to the 'execution-graph' topic every time `isConnected`
  // becomes true. This handles the initial connection as well as automatic
  // re-subscription after a WS reconnection. The server treats duplicate
  // subscribe messages for the same topic as idempotent, so there is no risk
  // of receiving duplicated events if this effect fires more than once.
  useEffect(() => {
    if (isConnected) {
      subscribe(['execution-graph']);
    }
  }, [isConnected, subscribe]);

  // ─── Historical executions ────────────────────────────────────────────────

  const { data: historicalData } = useQuery<{ executions: HistoricalExecution[] }>({
    queryKey: ['/api/executions/recent'],
    queryFn: async () => {
      const res = await fetch('/api/executions/recent');
      if (!res.ok) return { executions: [] };
      return res.json() as Promise<{ executions: HistoricalExecution[] }>;
    },
    // Refresh every 60 seconds — not a hot path
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const historicalExecutions = historicalData?.executions ?? [];

  // ─── Build historical graph on selection ─────────────────────────────────

  // Compute (or retrieve from cache) the reconstructed graph for the selected
  // correlation ID. Cache writes are intentionally omitted here — writing to a
  // ref during render is a side effect that violates React's render-purity
  // contract. The actual cache population happens in the useEffect below.
  const selectedHistoricalGraph = useMemo<ExecutionGraph | null>(() => {
    if (!selectedCorrelationId) return null;

    // Check cache first (read-only during render)
    const cached = historicalGraphCacheRef.current.get(selectedCorrelationId);
    if (cached) return cached;

    // Find the execution in historicalExecutions
    const exec = historicalExecutions.find((e) => e.correlationId === selectedCorrelationId);
    if (!exec) return null;

    // Reconstruct graph from stored WS events
    const initial = createInitialGraph(selectedCorrelationId);
    const reconstructed = exec.events.reduce((graph, wsEv) => {
      const graphEvents = normalizeWsEvent(wsEv);
      if (!graphEvents) return graph;
      return graphEvents.reduce((g, e) => applyEventToGraph(g, e), graph);
    }, initial);

    return reconstructed;
  }, [selectedCorrelationId, historicalExecutions]);

  // Populate the cache after commit so that the next render can short-circuit
  // reconstruction via the cache hit above.
  useEffect(() => {
    if (selectedCorrelationId && selectedHistoricalGraph) {
      historicalGraphCacheRef.current.set(selectedCorrelationId, selectedHistoricalGraph);
    }
  }, [selectedCorrelationId, selectedHistoricalGraph]);

  // Selectively evict stale cache entries when historicalExecutions changes.
  // A blanket .clear() would evict still-valid entries on every TanStack Query
  // refetch (even when data is identical), forcing unnecessary reconstruction.
  // Instead, only evict entries whose execution has been removed or whose
  // eventCount has changed (indicating new events were appended).
  useEffect(() => {
    const prev = prevExecutionsRef.current;
    const prevMap = new Map(prev.map((e) => [e.correlationId, e.eventCount]));

    for (const [id] of historicalGraphCacheRef.current) {
      const newEntry = historicalExecutions.find((e) => e.correlationId === id);
      if (!newEntry) {
        // Execution no longer present in the server response — evict.
        historicalGraphCacheRef.current.delete(id);
      } else if (newEntry.eventCount !== prevMap.get(id)) {
        // Event count changed — the stored events were updated, so evict the
        // cached reconstruction to force a rebuild on next selection.
        historicalGraphCacheRef.current.delete(id);
      }
    }

    prevExecutionsRef.current = historicalExecutions;
  }, [historicalExecutions]);

  return {
    liveGraph,
    historicalExecutions,
    isLive: isConnected,
    selectedCorrelationId,
    setSelectedCorrelationId,
    selectedHistoricalGraph,
  };
}
