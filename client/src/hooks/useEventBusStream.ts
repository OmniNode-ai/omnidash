/**
 * useEventBusStream Hook
 *
 * Manages WebSocket connection for real-time Kafka event streaming.
 * Provides bounded event storage, deduplication, and derived metrics.
 *
 * Features:
 * - Deduplication with stable event identity
 * - Memory-bounded storage with threshold-based cleanup
 * - Ref buffering for backpressure handling
 * - Derived metrics computed via useMemo
 * - Debug logging (off by default)
 *
 * Part of Event Bus Monitor refactor - see plan at:
 * ~/.claude/plans/typed-honking-nygaard.md
 */

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getTopicLabel, getEventMonitoringConfig } from '@/lib/configs/event-bus-dashboard';
import type {
  WireEventMessage,
  WireEventData,
  WireInitialState,
  WirePerformanceMetricData,
  ProcessedEvent,
  EventIngestResult,
  TopicBreakdownItem,
  EventTypeBreakdownItem,
  TimeSeriesItem,
  ProcessedStreamError,
  UseEventBusStreamOptions,
  UseEventBusStreamReturn,
  EventBusStreamStats,
  EventBusStreamMetrics,
  EventBusConnectionStatus,
} from './useEventBusStream.types';

// Import utilities and constants from separate module
import {
  DEFAULT_MAX_ITEMS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEDUPE_SET_CLEANUP_MULTIPLIER,
  MAX_TIMESTAMP_ENTRIES,
  MAX_ERRORS,
  TIME_SERIES_BUCKET_MS,
  NODE_TOPIC_MAP,
  getEventId,
  processEvent,
} from './useEventBusStream.utils';

// Re-export utilities and constants for public API
export {
  DEFAULT_MAX_ITEMS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEDUPE_SET_CLEANUP_MULTIPLIER,
  MAX_TIMESTAMP_ENTRIES,
  MAX_ERRORS,
  TIME_SERIES_BUCKET_MS,
  getEventId,
  processEvent,
} from './useEventBusStream.utils';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing WebSocket connection to Kafka event stream.
 *
 * @example
 * ```tsx
 * const {
 *   events,
 *   metrics,
 *   topicBreakdown,
 *   connectionStatus,
 *   connect,
 *   disconnect,
 * } = useEventBusStream({ maxItems: 200 });
 *
 * return (
 *   <div>
 *     <span>Events/sec: {metrics.eventsPerSecond}</span>
 *     <EventTable events={events} />
 *   </div>
 * );
 * ```
 */
export function useEventBusStream(options: UseEventBusStreamOptions = {}): UseEventBusStreamReturn {
  // Get config defaults
  const eventConfig = getEventMonitoringConfig();

  const {
    maxItems = DEFAULT_MAX_ITEMS,
    maxDedupIds = maxItems * DEDUPE_SET_CLEANUP_MULTIPLIER,
    autoConnect = true,
    timeSeriesWindowMs = eventConfig.time_series_window_ms,
    throughputWindowMs = eventConfig.throughput_window_ms,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    debug = false,
  } = options;

  // ============================================================================
  // State
  // ============================================================================

  const [events, setEvents] = useState<ProcessedEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<EventBusConnectionStatus>('idle');
  const [lastError, setLastError] = useState<ProcessedStreamError | null>(null);
  const [errors, setErrors] = useState<ProcessedStreamError[]>([]);
  const [stats, setStats] = useState<EventBusStreamStats>({
    totalReceived: 0,
    totalDeduped: 0,
    totalDropped: 0,
    lastEventAt: null,
    reconnectCount: 0,
  });

  // ============================================================================
  // Refs (for buffering and deduplication - no re-renders)
  // ============================================================================

  /** Pending events waiting to be flushed to state */
  const pendingEventsRef = useRef<ProcessedEvent[]>([]);

  /** Set of seen event IDs for deduplication */
  const seenIdsRef = useRef<Set<string>>(new Set());

  /** Timestamps for throughput calculation (sliding window) */
  const timestampsRef = useRef<number[]>([]);

  /** Flag to track if we've subscribed */
  const hasSubscribedRef = useRef(false);

  /** Current events ref for cleanup operations */
  const eventsRef = useRef<ProcessedEvent[]>([]);

  /** Stats ref to avoid stale closures */
  const statsRef = useRef(stats);

  // Keep refs in sync
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // ============================================================================
  // Debug Logging
  // ============================================================================

  /**
   * Conditional debug logger for event bus stream operations.
   *
   * Note: Using console.debug directly (wrapped with debug flag check) is the appropriate
   * pattern for client-side debug logging. The server-side intentLogger is not available
   * in client-side code. This pattern provides:
   * - Zero overhead when debug=false (default)
   * - Prefixed output for easy filtering in browser console
   * - Consistent logging across the hook
   */
  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) {
        // eslint-disable-next-line no-console
        console.debug('[EventBusStream]', ...args);
      }
    },
    [debug]
  );

  // ============================================================================
  // Event Ingestion
  // ============================================================================

  /**
   * Ingest a processed event into the pending buffer.
   * Handles deduplication and stats tracking.
   */
  const ingestEvent = useCallback(
    (result: EventIngestResult): void => {
      if (result.status === 'error') {
        setErrors((prev) => {
          const error: ProcessedStreamError = {
            at: Date.now(),
            message: result.message,
            details: result.raw,
          };
          return [error, ...prev].slice(0, MAX_ERRORS);
        });
        setLastError({
          at: Date.now(),
          message: result.message,
          details: result.raw,
        });
        return;
      }

      if (result.status === 'duplicate') {
        setStats((prev) => ({
          ...prev,
          totalDeduped: prev.totalDeduped + 1,
        }));
        return;
      }

      const { event } = result;

      // Dedupe check
      if (seenIdsRef.current.has(event.id)) {
        setStats((prev) => ({
          ...prev,
          totalDeduped: prev.totalDeduped + 1,
        }));
        return;
      }

      // Add to seen set
      seenIdsRef.current.add(event.id);

      // Add to pending buffer
      pendingEventsRef.current.push(event);

      // Update timestamps for throughput
      const now = Date.now();
      timestampsRef.current.push(now);

      /**
       * Enforce timestamp array cap with 50% retention strategy.
       *
       * When timestamps exceed MAX_TIMESTAMP_ENTRIES (10,000), we keep only
       * the most recent 50% (5,000 entries) rather than trimming to exactly
       * the limit. This design choice balances two concerns:
       *
       * 1. Memory efficiency: Prevents unbounded growth of the timestamps array
       * 2. Throughput accuracy: Retains enough history for accurate events/sec
       *    calculation across the throughput window (default 5 seconds)
       *
       * Why 50% (half) instead of another fraction:
       * - Aggressive enough: Reduces 10K to 5K entries per cleanup
       * - Conservative enough: At 100 events/sec, 5K entries = 50 seconds of
       *   history, far exceeding the 5-second throughput window
       * - Amortizes cleanup cost: Fewer cleanup operations vs trimming to exact limit
       */
      if (timestampsRef.current.length > MAX_TIMESTAMP_ENTRIES) {
        timestampsRef.current = timestampsRef.current.slice(-MAX_TIMESTAMP_ENTRIES / 2);
      }

      // Update stats
      setStats((prev) => ({
        ...prev,
        totalReceived: prev.totalReceived + 1,
        lastEventAt: now,
      }));

      /**
       * Threshold-based cleanup of seenIds Set
       *
       * Strategy: When the deduplication Set exceeds maxDedupIds (default: 2500),
       * rebuild it from only the currently visible events + pending buffer.
       *
       * This ensures:
       * 1. Memory is bounded - Set size is capped at maxDedupIds before cleanup triggers
       * 2. After cleanup, Set contains only IDs of events still in memory (maxItems + pending)
       * 3. Old event IDs are naturally discarded when they're no longer in the events array
       *
       * The 5x multiplier (DEDUPE_SET_CLEANUP_MULTIPLIER) provides headroom:
       * - Allows seenIds to track more IDs than visible events for better deduplication
       * - Prevents premature cleanup that could cause duplicate events to appear
       * - Typical cleanup reduces ~2500 entries to ~500-600 (events + pending)
       */
      if (seenIdsRef.current.size > maxDedupIds) {
        const currentIds = new Set([
          ...eventsRef.current.map((e) => e.id),
          ...pendingEventsRef.current.map((e) => e.id),
        ]);
        seenIdsRef.current = currentIds;
        log('Rebuilt seenIds set, new size:', currentIds.size);
      }
    },
    [maxDedupIds, log]
  );

  /**
   * Process and ingest a single event from WebSocket message.
   */
  const processAndIngest = useCallback(
    (eventType: string, data: WireEventData, topic: string): void => {
      const result = processEvent(eventType, data, topic);

      // Check for duplicate before full processing
      if (result.status === 'success' && seenIdsRef.current.has(result.event.id)) {
        ingestEvent({ status: 'duplicate', id: result.event.id });
        return;
      }

      ingestEvent(result);
    },
    [ingestEvent]
  );

  // ============================================================================
  // Flush Interval (batched state updates)
  // ============================================================================

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingEventsRef.current.length === 0) return;

      const pending = pendingEventsRef.current;
      pendingEventsRef.current = [];

      setEvents((prev) => {
        // Merge pending (most recent first) with existing
        const merged = [...pending.reverse(), ...prev];

        // Enforce maxItems cap
        if (merged.length > maxItems) {
          const dropped = merged.length - maxItems;
          setStats((s) => ({
            ...s,
            totalDropped: s.totalDropped + dropped,
          }));
          return merged.slice(0, maxItems);
        }

        return merged;
      });
    }, flushIntervalMs);

    return () => clearInterval(interval);
  }, [flushIntervalMs, maxItems]);

  // ============================================================================
  // Message Handlers
  // ============================================================================

  /**
   * Handle INITIAL_STATE message - batch hydration.
   *
   * Note: We do NOT filter events by time here. Historical events from the
   * database should be displayed regardless of age. Time-based filtering
   * is only applied to:
   * - Time series chart data (in timeSeries useMemo)
   * - Throughput calculation (using throughputWindowMs)
   */
  const handleInitialState = useCallback(
    (state: WireInitialState): void => {
      const now = Date.now();

      // Process all events from initial state
      const recentActions = (state.recentActions || []).map((a) =>
        processEvent(a.actionType || 'action', a, 'agent-actions')
      );
      const routingDecisions = (state.routingDecisions || []).map((d) =>
        processEvent('routing', d, 'agent-routing-decisions')
      );
      const recentTransformations = (state.recentTransformations || []).map((t) =>
        processEvent('transformation', t, 'agent-transformation-events')
      );

      // Combine and filter successful results (no time filter - show all historical data)
      const allResults = [...recentActions, ...routingDecisions, ...recentTransformations];
      const processed = allResults
        .filter((r): r is { status: 'success'; event: ProcessedEvent } => r.status === 'success')
        .map((r) => r.event)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, maxItems);

      // Rebuild seenIds from hydrated events
      seenIdsRef.current = new Set(processed.map((e) => e.id));

      // Populate timestamps for throughput (only recent events count toward throughput)
      const throughputCutoff = now - throughputWindowMs;
      const recentTimestamps = processed
        .map((e) => e.timestamp.getTime())
        .filter((t) => t > throughputCutoff);
      timestampsRef.current = recentTimestamps.slice(-MAX_TIMESTAMP_ENTRIES);

      // Populate time series with initial data so charts show historical data
      // The timeSeries useMemo will filter by timeSeriesWindowMs when computing

      // Single state commit
      setEvents(processed);
      setStats((prev) => ({
        ...prev,
        totalReceived: prev.totalReceived + processed.length,
        lastEventAt: processed.length > 0 ? processed[0].timestamp.getTime() : prev.lastEventAt,
      }));

      log('INITIAL_STATE hydrated', processed.length, 'events');
    },
    [maxItems, throughputWindowMs, log]
  );

  /**
   * Handle incoming WebSocket messages.
   */
  const handleMessage = useCallback(
    (message: { type: string; data?: unknown; timestamp?: string }): void => {
      const wireMessage = message as WireEventMessage;

      switch (wireMessage.type) {
        // System messages - ignore
        case 'CONNECTED':
        case 'SUBSCRIPTION_UPDATED':
        case 'PONG':
        case 'CONSUMER_STATUS':
          return;

        case 'INITIAL_STATE':
          handleInitialState(wireMessage.data as WireInitialState);
          break;

        case 'AGENT_ACTION': {
          const action = wireMessage.data as WireEventData;
          if (action) {
            processAndIngest(action.actionType || 'action', action, 'agent-actions');
          }
          break;
        }

        case 'ROUTING_DECISION': {
          const decision = wireMessage.data as WireEventData;
          if (decision) {
            processAndIngest('routing', decision, 'agent-routing-decisions');
          }
          break;
        }

        case 'AGENT_TRANSFORMATION': {
          const transformation = wireMessage.data as WireEventData;
          if (transformation) {
            processAndIngest('transformation', transformation, 'agent-transformation-events');
          }
          break;
        }

        case 'PERFORMANCE_METRIC': {
          const { metric } = (wireMessage.data as WirePerformanceMetricData) || {};
          if (metric) {
            processAndIngest('performance', metric, 'router-performance-metrics');
          }
          break;
        }

        case 'NODE_INTROSPECTION':
        case 'NODE_HEARTBEAT':
        case 'NODE_STATE_CHANGE':
        case 'NODE_REGISTRY_UPDATE': {
          const nodeData = wireMessage.data as WireEventData;
          if (nodeData) {
            const topic = NODE_TOPIC_MAP[wireMessage.type] || 'node.events';
            const eventType = wireMessage.type.toLowerCase().replace('node_', '');
            processAndIngest(eventType, nodeData, topic);
          }
          break;
        }

        case 'AGENT_METRIC_UPDATE':
          // Metrics update - not a discrete event, skip
          break;

        case 'ERROR': {
          const error = wireMessage.data as { message?: string };
          if (error) {
            processAndIngest('error', { message: error.message, actionType: 'error' }, 'errors');
          }
          break;
        }

        default:
          if (debug) {
            log('Unknown message type:', wireMessage.type);
          }
      }
    },
    [handleInitialState, processAndIngest, debug, log]
  );

  /**
   * Handle WebSocket errors.
   */
  const handleError = useCallback(
    (event: Event): void => {
      const error: ProcessedStreamError = {
        at: Date.now(),
        message: 'WebSocket connection error',
        details: event,
      };
      setLastError(error);
      setErrors((prev) => [error, ...prev].slice(0, MAX_ERRORS));
      setConnectionStatus('error');
      log('WebSocket error:', event);
    },
    [log]
  );

  /**
   * Handle WebSocket open.
   */
  const handleOpen = useCallback((): void => {
    setConnectionStatus('connected');
    log('Connected');
  }, [log]);

  /**
   * Handle WebSocket close.
   */
  const handleClose = useCallback((): void => {
    setConnectionStatus('idle');
    hasSubscribedRef.current = false;
    setStats((prev) => ({
      ...prev,
      reconnectCount: prev.reconnectCount + 1,
    }));
    log('Disconnected');
  }, [log]);

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  const {
    isConnected,
    connectionStatus: wsConnectionStatus,
    subscribe,
    unsubscribe,
    reconnect,
    close: closeWebSocket,
  } = useWebSocket({
    onMessage: handleMessage,
    onError: handleError,
    onOpen: handleOpen,
    onClose: handleClose,
    debug,
  });

  // Map WebSocket status to our status
  useEffect(() => {
    if (wsConnectionStatus === 'connecting') {
      setConnectionStatus('connecting');
    } else if (wsConnectionStatus === 'connected') {
      setConnectionStatus('connected');
    } else if (wsConnectionStatus === 'error') {
      setConnectionStatus('error');
    } else if (wsConnectionStatus === 'disconnected') {
      setConnectionStatus('idle');
    }
  }, [wsConnectionStatus]);

  // Subscribe to all events when connected
  useEffect(() => {
    if (!autoConnect) return;

    if (isConnected && !hasSubscribedRef.current) {
      log('Subscribing to all events');
      subscribe(['all']);
      hasSubscribedRef.current = true;
    }

    if (!isConnected) {
      hasSubscribedRef.current = false;
    }

    return () => {
      if (hasSubscribedRef.current && isConnected) {
        log('Unsubscribing from events');
        unsubscribe(['all']);
        hasSubscribedRef.current = false;
      }
    };
  }, [isConnected, autoConnect, subscribe, unsubscribe, log]);

  // ============================================================================
  // Periodic Cleanup (throughput accuracy + seenIds memory management when idle)
  // ============================================================================

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - throughputWindowMs;

      // Clean stale timestamps for accurate throughput calculation
      if (timestampsRef.current.length > 0) {
        timestampsRef.current = timestampsRef.current.filter((t) => t > cutoff);
      }

      /**
       * Periodic seenIds cleanup - safeguard for when event flow stops
       *
       * This ensures memory remains bounded even if:
       * - Event flow stops while seenIds is large
       * - The threshold-based cleanup in ingestEvent never triggers
       *
       * Runs every 10 seconds, only triggers if Set exceeds threshold.
       */
      if (seenIdsRef.current.size > maxDedupIds) {
        const currentIds = new Set([
          ...eventsRef.current.map((e) => e.id),
          ...pendingEventsRef.current.map((e) => e.id),
        ]);
        seenIdsRef.current = currentIds;
        log('Periodic cleanup: rebuilt seenIds set, new size:', currentIds.size);
      }
    }, eventConfig.periodic_cleanup_interval_ms); // From config

    return () => clearInterval(cleanupInterval);
  }, [throughputWindowMs, maxDedupIds, log, eventConfig.periodic_cleanup_interval_ms]);

  // ============================================================================
  // Derived Data (useMemo for performance)
  // ============================================================================

  /**
   * Calculate events per second from timestamps ref.
   *
   * Dependency Note: The dependency array includes `events` which triggers
   * recalculation, even though we read from `timestampsRef.current` which
   * is not tracked in deps. This works correctly because:
   *
   * 1. Both `events` state and `timestampsRef.current` are updated together
   *    in the `ingestEvent` function (timestamp pushed, then stats updated)
   * 2. The flush interval that commits pending events to state also triggers
   *    this recalculation via the `events` dependency
   * 3. We intentionally avoid adding `timestampsRef` to deps because refs
   *    don't trigger re-renders - we rely on `events` as a proxy signal
   *
   * This pattern ensures throughput is recalculated whenever new events arrive.
   */
  const eventsPerSecond = useMemo(() => {
    const now = Date.now();
    const cutoff = now - throughputWindowMs;
    const recentCount = timestampsRef.current.filter((t) => t > cutoff).length;
    const windowSeconds = throughputWindowMs / 1000;
    return Math.round((recentCount / windowSeconds) * 10) / 10;
  }, [events, throughputWindowMs]);

  /**
   * Topic breakdown computed from current events.
   */
  const topicBreakdown = useMemo((): TopicBreakdownItem[] => {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.topicRaw] = (counts[event.topicRaw] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([topic, count]) => ({
        name: getTopicLabel(topic),
        topic,
        eventCount: count,
      }))
      .sort((a, b) => b.eventCount - a.eventCount);
  }, [events]);

  /**
   * Event type breakdown computed from current events.
   */
  const eventTypeBreakdown = useMemo((): EventTypeBreakdownItem[] => {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([eventType, count]) => ({
        name: eventType,
        eventType,
        eventCount: count,
      }))
      .sort((a, b) => b.eventCount - a.eventCount);
  }, [events]);

  /**
   * Time series computed from current events.
   *
   * For initial load with historical data, we expand the window to show
   * all events if none fall within the default time window. This ensures
   * the chart displays useful data even when events are older than 5 minutes.
   */
  const timeSeries = useMemo((): TimeSeriesItem[] => {
    if (events.length === 0) {
      return [];
    }

    const now = Date.now();
    const defaultCutoff = now - timeSeriesWindowMs;

    // First, check if any events fall within the default time window
    const hasRecentEvents = events.some((e) => e.timestamp.getTime() > defaultCutoff);

    // If no recent events, expand window to include all events (historical data)
    // Use the oldest event timestamp as the cutoff
    let cutoff: number;
    if (hasRecentEvents) {
      cutoff = defaultCutoff;
    } else {
      // Find the oldest event and expand window to show all data
      const oldestTimestamp = Math.min(...events.map((e) => e.timestamp.getTime()));
      cutoff = oldestTimestamp - TIME_SERIES_BUCKET_MS; // Include oldest bucket
    }

    const buckets: Record<number, number> = {};
    for (const event of events) {
      const eventTime = event.timestamp.getTime();
      if (eventTime > cutoff) {
        const bucketTime = Math.floor(eventTime / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;
        buckets[bucketTime] = (buckets[bucketTime] || 0) + 1;
      }
    }

    return Object.entries(buckets)
      .map(([time, count]) => ({
        time: Number(time),
        timestamp: new Date(Number(time)).toLocaleTimeString(),
        events: count,
      }))
      .sort((a, b) => a.time - b.time);
  }, [events, timeSeriesWindowMs]);

  /**
   * Computed metrics.
   */
  const metrics = useMemo((): EventBusStreamMetrics => {
    const errorCount = events.filter((e) => e.priority === 'critical').length;
    const errorRate = events.length > 0 ? (errorCount / events.length) * 100 : 0;

    return {
      totalEvents: events.length,
      eventsPerSecond,
      errorRate: Math.round(errorRate * 100) / 100,
      activeTopics: topicBreakdown.length,
    };
  }, [events, eventsPerSecond, topicBreakdown.length]);

  // ============================================================================
  // Controls
  // ============================================================================

  const connect = useCallback((): void => {
    log('Manual connect requested');
    reconnect();
  }, [reconnect, log]);

  const disconnect = useCallback((): void => {
    log('Disconnecting');
    if (hasSubscribedRef.current && isConnected) {
      unsubscribe(['all']);
    }
    hasSubscribedRef.current = false;
    closeWebSocket();
  }, [isConnected, unsubscribe, closeWebSocket, log]);

  const clearEvents = useCallback((): void => {
    log('Clearing events');
    setEvents([]);
    pendingEventsRef.current = [];
    seenIdsRef.current.clear();
    timestampsRef.current = [];
    setErrors([]);
    setLastError(null);
    setStats({
      totalReceived: 0,
      totalDeduped: 0,
      totalDropped: 0,
      lastEventAt: null,
      reconnectCount: statsRef.current.reconnectCount,
    });
  }, [log]);

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      pendingEventsRef.current = [];
      seenIdsRef.current.clear();
      timestampsRef.current = [];
    };
  }, []);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    events,
    metrics,
    topicBreakdown,
    eventTypeBreakdown,
    timeSeries,
    connectionStatus,
    lastError,
    stats,
    errors,
    connect,
    disconnect,
    clearEvents,
  };
}
