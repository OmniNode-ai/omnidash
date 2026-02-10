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
import {
  getTopicLabel,
  getEventTypeLabel,
  getEventMonitoringConfig,
} from '@/lib/configs/event-bus-dashboard';
import {
  LEGACY_AGENT_ACTIONS,
  LEGACY_AGENT_ROUTING_DECISIONS,
  LEGACY_AGENT_TRANSFORMATION_EVENTS,
  LEGACY_ROUTER_PERFORMANCE_METRICS,
} from '@shared/topics';
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
  BurstInfo,
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
  processEvent,
  getWindowCutoff,
  filterEventsInWindow,
  computeRate,
  computeErrorRate,
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
  getWindowCutoff,
  filterEventsInWindow,
  computeRate,
  computeErrorRate,
} from './useEventBusStream.utils';

/** Known benign WebSocket message types that don't need event processing. */
const KNOWN_IGNORED_TYPES = new Set(['pong', 'heartbeat', 'HEARTBEAT', 'PING', 'ACK']);

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
    monitoringWindowMs = eventConfig.monitoring_window_ms,
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

      // Update timestamps for throughput (exclude heartbeats — they're health pings, not traffic)
      const now = Date.now();
      const isHeartbeat =
        event.topicRaw.includes('heartbeat') || event.eventType.toLowerCase().includes('heartbeat');
      if (!isHeartbeat) {
        timestampsRef.current.push(now);
      }

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
  // Trim events when maxItems decreases
  // ============================================================================

  useEffect(() => {
    // Immediately trim events if current count exceeds new maxItems
    setEvents((prev) => {
      if (prev.length > maxItems) {
        log('Trimming events from', prev.length, 'to', maxItems);
        return prev.slice(0, maxItems);
      }
      return prev;
    });
  }, [maxItems, log]);

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
   * - Throughput calculation (using monitoringWindowMs)
   */
  const handleInitialState = useCallback(
    (state: WireInitialState): void => {
      const now = Date.now();

      // Prefer eventBusEvents (raw events with correct topic info) over legacy arrays
      const rawBusEvents = (state as unknown as Record<string, unknown>).eventBusEvents as
        | Array<{
            event_type: string;
            topic: string;
            payload: unknown;
            timestamp?: string;
            source?: string;
            correlation_id?: string;
            event_id?: string;
          }>
        | undefined;

      let allResults: EventIngestResult[];

      if (rawBusEvents && rawBusEvents.length > 0) {
        // Process raw event bus events with correct topic names
        allResults = rawBusEvents.flatMap((e) => {
          let payloadRaw: unknown;
          try {
            payloadRaw = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
          } catch {
            log('Skipping event with malformed JSON payload:', e.event_type);
            return [];
          }
          // Guard: JSON.parse may return null, undefined, a number, a string,
          // or other primitives. Spreading those into an object would throw.
          // Normalize to a safe Record: preserve primitives under a 'value' key.
          const payload: Record<string, unknown> =
            payloadRaw != null && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)
              ? (payloadRaw as Record<string, unknown>)
              : { value: payloadRaw };
          const data: WireEventData = {
            ...payload,
            timestamp: e.timestamp,
            source: e.source,
            correlationId: e.correlation_id,
            id: e.event_id,
          };
          return [processEvent(e.event_type, data, e.topic)];
        });
      } else {
        // Fallback: legacy arrays (recentActions, routingDecisions, transformations)
        const recentActions = (state.recentActions || []).map((a) =>
          processEvent(a.actionType || 'action', a, LEGACY_AGENT_ACTIONS)
        );
        const routingDecisions = (state.routingDecisions || []).map((d) =>
          processEvent('routing', d, LEGACY_AGENT_ROUTING_DECISIONS)
        );
        const recentTransformations = (state.recentTransformations || []).map((t) =>
          processEvent('transformation', t, LEGACY_AGENT_TRANSFORMATION_EVENTS)
        );
        allResults = [...recentActions, ...routingDecisions, ...recentTransformations];
      }

      // Filter successful results (sorting happens after merge below)
      const processed = allResults
        .filter((r): r is { status: 'success'; event: ProcessedEvent } => r.status === 'success')
        .map((r) => r.event);

      // --- Merge with existing real-time events instead of replacing ---
      // Real-time events may have arrived between WS connect and INITIAL_STATE.
      // Drain pending buffer so those events are included in the merge.
      const pendingEvents = pendingEventsRef.current;
      pendingEventsRef.current = [];

      // Use functional setState to correctly chain with any pending flush updates.
      // If the flush interval just called setEvents() but React hasn't rendered yet,
      // the functional form receives the post-flush state as `prev`, preventing loss.
      //
      // Note: seenIdsRef is updated OUTSIDE the updater to avoid ref mutation inside
      // setState, which React Strict Mode may double-invoke.
      setEvents((prev) => {
        const mergedIds = new Set<string>();
        const merged: ProcessedEvent[] = [];

        // Real-time events (pending buffer + already-flushed state) take priority
        for (const event of [...pendingEvents, ...prev]) {
          if (!mergedIds.has(event.id)) {
            mergedIds.add(event.id);
            merged.push(event);
          }
        }
        // Then add INITIAL_STATE events (older, from DB preload)
        for (const event of processed) {
          if (!mergedIds.has(event.id)) {
            mergedIds.add(event.id);
            merged.push(event);
          }
        }

        // Sort newest first, cap at maxItems
        merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const capped = merged.length > maxItems ? merged.slice(0, maxItems) : merged;

        return capped;
      });

      // Rebuild seenIds outside the setState updater to avoid ref mutation
      // inside a function that React Strict Mode may double-invoke.
      // Build from all sources: processed events, pending buffer, and current events.
      // Note: eventsRef.current may be one render behind setEvents due to React batching,
      // but seenIds is rebuilt on every flush cycle so any missed IDs are captured next cycle.
      const allIds = new Set<string>();
      for (const e of processed) allIds.add(e.id);
      for (const e of pendingEvents) allIds.add(e.id);
      for (const e of eventsRef.current) allIds.add(e.id);
      seenIdsRef.current = allIds;

      // Merge timestamps: keep existing real-time timestamps, add INITIAL_STATE ones
      const throughputCutoff = getWindowCutoff(now, monitoringWindowMs);
      const existingTimestamps = timestampsRef.current.filter((t) => t >= throughputCutoff);
      const initialStateTimestamps = processed
        .filter(
          (e) =>
            !e.topicRaw.includes('heartbeat') && !e.eventType.toLowerCase().includes('heartbeat')
        )
        .map((e) => e.timestamp.getTime())
        .filter((t) => t >= throughputCutoff);
      const allTimestamps = [...new Set([...existingTimestamps, ...initialStateTimestamps])].sort(
        (a, b) => a - b
      );
      timestampsRef.current = allTimestamps.slice(-MAX_TIMESTAMP_ENTRIES);

      // Populate time series with initial data so charts show historical data
      // The timeSeries useMemo will filter by monitoringWindowMs when computing

      // Stats: count the new INITIAL_STATE events added
      const newestProcessedAt = processed.reduce(
        (max, e) => Math.max(max, e.timestamp.getTime()),
        0
      );
      setStats((prev) => ({
        ...prev,
        totalReceived: prev.totalReceived + processed.length,
        lastEventAt: Math.max(prev.lastEventAt ?? 0, newestProcessedAt) || null,
      }));

      log(
        'INITIAL_STATE hydrated',
        processed.length,
        'events, merged with',
        pendingEvents.length,
        'pending +',
        eventsRef.current.length,
        'existing'
      );
    },
    [monitoringWindowMs, maxItems, log]
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
          const action = wireMessage.data as WireEventData | undefined;
          if (action !== undefined) {
            processAndIngest(action.actionType || 'action', action, LEGACY_AGENT_ACTIONS);
          }
          break;
        }

        case 'ROUTING_DECISION': {
          const decision = wireMessage.data as WireEventData | undefined;
          if (decision !== undefined) {
            processAndIngest('routing', decision, LEGACY_AGENT_ROUTING_DECISIONS);
          }
          break;
        }

        case 'AGENT_TRANSFORMATION': {
          const transformation = wireMessage.data as WireEventData | undefined;
          if (transformation !== undefined) {
            processAndIngest('transformation', transformation, LEGACY_AGENT_TRANSFORMATION_EVENTS);
          }
          break;
        }

        case 'PERFORMANCE_METRIC': {
          const perfData = wireMessage.data as WirePerformanceMetricData | undefined;
          if (perfData !== undefined) {
            const { metric } = perfData;
            if (metric !== undefined) {
              processAndIngest('performance', metric, LEGACY_ROUTER_PERFORMANCE_METRICS);
            }
          }
          break;
        }

        case 'NODE_INTROSPECTION':
        case 'NODE_HEARTBEAT':
        case 'NODE_STATE_CHANGE':
        case 'NODE_REGISTRY_UPDATE': {
          const nodeData = wireMessage.data as WireEventData | undefined;
          if (nodeData !== undefined) {
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

        case 'EVENT_BUS_EVENT': {
          // Real-time events from EventBusDataSource (mirrors INITIAL_STATE hydration)
          const ebEvent = wireMessage.data as Record<string, unknown> | undefined;
          if (
            ebEvent != null &&
            typeof ebEvent === 'object' &&
            typeof ebEvent.event_type === 'string' &&
            typeof ebEvent.topic === 'string'
          ) {
            let payloadRaw: unknown;
            try {
              payloadRaw =
                typeof ebEvent.payload === 'string' ? JSON.parse(ebEvent.payload) : ebEvent.payload;
            } catch {
              log('EVENT_BUS_EVENT: skipping malformed payload');
              break;
            }
            const payload: Record<string, unknown> =
              payloadRaw != null && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)
                ? (payloadRaw as Record<string, unknown>)
                : { value: payloadRaw };
            const data: WireEventData = {
              ...payload,
              timestamp: ebEvent.timestamp as string | undefined,
              source: ebEvent.source as string | undefined,
              correlationId: ebEvent.correlation_id as string | undefined,
              id: ebEvent.id as string | undefined,
            };
            processAndIngest(ebEvent.event_type as string, data, ebEvent.topic as string);
          }
          break;
        }

        // Status messages from EventBusDataSource — not discrete events
        case 'EVENT_BUS_STATUS':
        case 'EVENT_BUS_ERROR':
          break;

        // Demo mode state management - clear/restore UI state
        case 'DEMO_STATE_RESET':
          // Demo mode started - clear all events for clean playback
          log('Demo mode: clearing events for playback');
          setEvents([]);
          pendingEventsRef.current = [];
          seenIdsRef.current.clear();
          timestampsRef.current = [];
          setStats((prev) => ({
            ...prev,
            totalReceived: 0,
            totalDeduped: 0,
            totalDropped: 0,
            lastEventAt: null,
          }));
          break;

        case 'DEMO_STATE_RESTORED':
          // Demo mode ended - trigger re-fetch of live state
          // Clear current state and request fresh initial state from server
          log('Demo mode: restoring live data');
          setEvents([]);
          pendingEventsRef.current = [];
          seenIdsRef.current.clear();
          timestampsRef.current = [];
          setStats((prev) => ({
            ...prev,
            totalReceived: 0,
            totalDeduped: 0,
            totalDropped: 0,
            lastEventAt: null,
          }));
          // The server will send INITIAL_STATE with restored data
          break;

        default: {
          // Both known-ignored and truly unexpected types use debug logging.
          // Production console noise is avoided; enable `debug: true` to surface.
          if (!KNOWN_IGNORED_TYPES.has(wireMessage.type)) {
            log('Unhandled WebSocket message type:', wireMessage.type);
          }
          break;
        }
      }
    },
    [handleInitialState, processAndIngest, log]
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
      const cutoff = getWindowCutoff(now, monitoringWindowMs);

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
  }, [monitoringWindowMs, maxDedupIds, log, eventConfig.periodic_cleanup_interval_ms]);

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
    const cutoff = getWindowCutoff(now, monitoringWindowMs);
    // Use timestampsRef (lightweight number[]) instead of filtering full events array.
    // Heartbeats are already excluded at insertion time in ingestEvent/handleInitialState.
    const recentCount = timestampsRef.current.filter((t) => t >= cutoff).length;
    return computeRate(recentCount, monitoringWindowMs);
  }, [events, monitoringWindowMs]);

  // ============================================================================
  // Burst / Spike Detection
  // ============================================================================

  /** Track when burst conditions were last met for cooldown */
  const lastBurstTriggeredAtRef = useRef<number>(0);
  const lastErrorSpikeTriggeredAtRef = useRef<number>(0);

  const burstInfo = useMemo((): BurstInfo => {
    const now = Date.now();
    const burstCutoff = getWindowCutoff(now, eventConfig.burst_window_ms);
    const baselineCutoff = getWindowCutoff(now, monitoringWindowMs);

    const burstEvents = filterEventsInWindow(events, burstCutoff);
    const baselineEvents = filterEventsInWindow(events, baselineCutoff);

    const shortWindowRate = computeRate(burstEvents.length, eventConfig.burst_window_ms);
    const baselineRate = computeRate(baselineEvents.length, monitoringWindowMs);
    const shortWindowErrorRate = computeErrorRate(burstEvents);
    const baselineErrorRate = computeErrorRate(baselineEvents);

    // Throughput burst: all 3 conditions
    const rawThroughputBurst =
      shortWindowRate >= eventConfig.burst_throughput_min_rate &&
      baselineRate > 0 &&
      shortWindowRate >= baselineRate * eventConfig.burst_throughput_multiplier;

    // Error spike: either condition, with sample gate
    const rawErrorSpike =
      burstEvents.length >= eventConfig.burst_error_min_events &&
      (shortWindowErrorRate > eventConfig.burst_error_absolute_threshold ||
        (baselineErrorRate > 0 &&
          shortWindowErrorRate > baselineErrorRate * eventConfig.burst_error_multiplier));

    // Update trigger timestamps
    if (rawThroughputBurst) lastBurstTriggeredAtRef.current = now;
    if (rawErrorSpike) lastErrorSpikeTriggeredAtRef.current = now;

    // Apply cooldown
    const throughputBurst =
      rawThroughputBurst || now - lastBurstTriggeredAtRef.current < eventConfig.burst_cooldown_ms;
    const errorSpike =
      rawErrorSpike || now - lastErrorSpikeTriggeredAtRef.current < eventConfig.burst_cooldown_ms;

    return {
      throughputBurst,
      errorSpike,
      shortWindowRate,
      baselineRate,
      shortWindowErrorRate,
      baselineErrorRate,
    };
  }, [
    events,
    monitoringWindowMs,
    eventConfig.burst_window_ms,
    eventConfig.burst_throughput_min_rate,
    eventConfig.burst_throughput_multiplier,
    eventConfig.burst_error_min_events,
    eventConfig.burst_error_absolute_threshold,
    eventConfig.burst_error_multiplier,
    eventConfig.burst_cooldown_ms,
  ]);

  /**
   * Topic breakdown computed from current events.
   * Sorted alphabetically by name for stable legend ordering.
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  /**
   * Event type breakdown computed from current events.
   * Uses getEventTypeLabel for human-readable short labels.
   * Sorted alphabetically by name for stable legend ordering.
   */
  const eventTypeBreakdown = useMemo((): EventTypeBreakdownItem[] => {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([eventType, count]) => ({
        name: getEventTypeLabel(eventType),
        eventType,
        eventCount: count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    const defaultCutoff = getWindowCutoff(now, monitoringWindowMs);

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
      .map(([time, count]) => {
        // Use minute:second format for 15-second buckets (e.g., "14:30")
        const date = new Date(Number(time));
        const formattedTime = `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        return {
          time: Number(time),
          timestamp: formattedTime,
          name: formattedTime, // ChartWidget uses 'name' as XAxis dataKey
          events: count,
        };
      })
      .sort((a, b) => a.time - b.time);
  }, [events, monitoringWindowMs]);

  /**
   * Computed metrics.
   */
  const metrics = useMemo((): EventBusStreamMetrics => {
    // Fix: window the error rate to monitoringWindowMs instead of entire buffer
    const now = Date.now();
    const cutoff = getWindowCutoff(now, monitoringWindowMs);
    const windowedEvents = filterEventsInWindow(events, cutoff);
    const errorRate = computeErrorRate(windowedEvents);

    return {
      totalEvents: events.length,
      eventsPerSecond,
      errorRate,
      activeTopics: topicBreakdown.length,
    };
  }, [events, eventsPerSecond, topicBreakdown.length, monitoringWindowMs]);

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
    burstInfo,
    connect,
    disconnect,
    clearEvents,
  };
}
