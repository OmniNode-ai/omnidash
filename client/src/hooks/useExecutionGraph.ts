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

import { useState, useCallback, useRef, useEffect } from 'react';
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

  // ─── WebSocket ───────────────────────────────────────────────────────────

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

  // Subscribe to the 'execution-graph' topic once connected
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

  const selectedHistoricalGraph: ExecutionGraph | null = (() => {
    if (!selectedCorrelationId) return null;

    // Check cache first
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

    // Cache for next render
    historicalGraphCacheRef.current.set(selectedCorrelationId, reconstructed);

    return reconstructed;
  })();

  // Invalidate the historical graph cache when new data arrives
  useEffect(() => {
    historicalGraphCacheRef.current.clear();
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
