/**
 * useEventBusStream Types
 *
 * Type definitions for the Event Bus Stream hook.
 * Separates wire types (server format) from processed types (UI format).
 *
 * Part of Event Bus Monitor refactor - see plan at:
 * ~/.claude/plans/typed-honking-nygaard.md
 */

import type { ParsedDetails } from '@/components/event-bus/eventDetailUtils';

// ============================================================================
// Wire Types (server format - never used in UI directly)
// ============================================================================

/**
 * WebSocket message types received from the server.
 */
export type WireMessageType =
  | 'AGENT_ACTION'
  | 'INITIAL_STATE'
  | 'PERFORMANCE_METRIC'
  | 'ROUTING_DECISION'
  | 'AGENT_TRANSFORMATION'
  | 'NODE_INTROSPECTION'
  | 'NODE_HEARTBEAT'
  | 'NODE_STATE_CHANGE'
  | 'NODE_REGISTRY_UPDATE'
  | 'EVENT_BUS_EVENT'
  | 'EVENT_BUS_STATUS'
  | 'EVENT_BUS_ERROR'
  | 'ERROR'
  | 'CONNECTED'
  | 'SUBSCRIPTION_UPDATED'
  | 'PONG'
  | 'CONSUMER_STATUS'
  | 'AGENT_METRIC_UPDATE'
  | 'DEMO_STATE_RESET'
  | 'DEMO_STATE_RESTORED'
  | 'EVENT_BUS_EVENT'
  | 'EVENT_BUS_STATUS'
  | 'EVENT_BUS_ERROR';

/**
 * Raw WebSocket event message from server.
 */
export interface WireEventMessage {
  type: WireMessageType;
  id?: string;
  topic?: string;
  eventType?: string;
  timestamp?: string;
  data: unknown;
}

/**
 * Raw event data structure from server (within INITIAL_STATE or individual events).
 */
export interface WireEventData {
  id?: string;
  correlationId?: string;
  actionType?: string;
  agentName?: string;
  sourceAgent?: string;
  selectedAgent?: string;
  createdAt?: string;
  timestamp?: string | number;
  priority?: string;
  severity?: string;
  headers?: { priority?: string };
  message?: string;
  [key: string]: unknown;
}

/**
 * INITIAL_STATE message structure from server.
 */
export interface WireInitialState {
  type: 'INITIAL_STATE';
  recentActions?: WireEventData[];
  routingDecisions?: WireEventData[];
  recentTransformations?: WireEventData[];
}

/**
 * Performance metric message data structure.
 */
export interface WirePerformanceMetricData {
  metric?: WireEventData;
  stats?: {
    totalQueries?: number;
  };
}

// ============================================================================
// Processed Types (UI format - normalized for rendering)
// ============================================================================

/**
 * Event priority levels.
 */
export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Normalized event for rendering in UI components.
 */
export interface ProcessedEvent {
  /** Unique identifier (computed via getEventId) */
  id: string;
  /** Display-friendly topic label */
  topic: string;
  /** Raw topic string (for filtering) */
  topicRaw: string;
  /** Event type name */
  eventType: string;
  /** Event priority level */
  priority: EventPriority;
  /** Parsed timestamp as Date */
  timestamp: Date;
  /** Raw timestamp string */
  timestampRaw: string;
  /** Event source (agent name or system) */
  source: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** JSON stringified payload */
  payload: string;
  /** Parse error if normalization failed */
  parseError?: string;
  /** One-line human-readable description of the event */
  summary: string;
  /** Normalized type for chart grouping (e.g., "Edit" instead of "tool-content") */
  normalizedType: string;
  /** Key for grouping/collapsing similar events (e.g., "Edit:trigger_matching.py:true") */
  groupKey: string;
  /** Pre-parsed payload details (computed once, not on render) */
  parsedDetails: ParsedDetails | null;
}

/**
 * Result of attempting to ingest an event.
 */
export type EventIngestResult =
  | { status: 'success'; event: ProcessedEvent }
  | { status: 'duplicate'; id: string }
  | { status: 'error'; message: string; raw: unknown };

// ============================================================================
// Chart/Breakdown Types
// ============================================================================

/**
 * Topic breakdown item for pie/donut charts.
 */
export interface TopicBreakdownItem {
  /** Display name */
  name: string;
  /** Raw topic string */
  topic: string;
  /** Number of events for this topic */
  eventCount: number;
}

/**
 * Event type breakdown item for pie/donut charts.
 */
export interface EventTypeBreakdownItem {
  /** Display name (same as eventType) */
  name: string;
  /** Event type identifier */
  eventType: string;
  /** Number of events for this type */
  eventCount: number;
}

/**
 * Time series data point for area/line charts.
 */
export interface TimeSeriesItem {
  /** Bucket timestamp in ms (e.g., floor to 10s) */
  time: number;
  /** Human-readable timestamp string */
  timestamp: string;
  /** Display name for chart X-axis (same as timestamp, required by ChartWidget) */
  name: string;
  /** Number of events in this bucket */
  events: number;
}

/**
 * Stream error record.
 */
export interface ProcessedStreamError {
  /** Timestamp when error occurred */
  at: number;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

// ============================================================================
// Hook Options & Return Types
// ============================================================================

/**
 * Options for useEventBusStream hook.
 */
export interface UseEventBusStreamOptions {
  /**
   * Maximum number of events to keep in memory.
   * @default 500
   */
  maxItems?: number;

  /**
   * Maximum size of deduplication ID set.
   * When exceeded, rebuilds from current events.
   * @default maxItems * 5
   */
  maxDedupIds?: number;

  /**
   * Whether to automatically connect on mount.
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Unified monitoring window for all steady-state metrics (ms).
   * @default 300000 (5 minutes)
   */
  monitoringWindowMs?: number;

  /**
   * Interval for flushing pending events to state (ms).
   * Lower values = more responsive, higher values = less re-renders.
   * @default 100
   */
  flushIntervalMs?: number;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;
}

/**
 * Statistics about the event stream (lifetime counters).
 */
export interface EventBusStreamStats {
  /** Total events received since mount */
  totalReceived: number;
  /** Total events skipped due to deduplication */
  totalDeduped: number;
  /** Total events dropped due to capacity limits */
  totalDropped: number;
  /** Timestamp of last received event (ms) */
  lastEventAt: number | null;
  /** Number of reconnection attempts */
  reconnectCount: number;
}

/**
 * Computed metrics from the event stream.
 */
export interface EventBusStreamMetrics {
  /** Total events in memory */
  totalEvents: number;
  /** Events per second (rolling window) */
  eventsPerSecond: number;
  /** Error rate percentage */
  errorRate: number;
  /** Number of active topics */
  activeTopics: number;
}

/**
 * Connection status for the WebSocket.
 */
export type EventBusConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Burst/spike detection info returned from the hook.
 * Used by EventBusMonitor to render burst/error spike banners.
 */
export interface BurstInfo {
  /** Whether a throughput burst is currently detected (includes cooldown) */
  throughputBurst: boolean;
  /** Whether an error spike is currently detected (includes cooldown) */
  errorSpike: boolean;
  /** Raw throughput burst flag before cooldown (used for ref sync in useEffect) */
  rawThroughputBurst: boolean;
  /** Raw error spike flag before cooldown (used for ref sync in useEffect) */
  rawErrorSpike: boolean;
  /** Events/sec in the burst (short) window */
  shortWindowRate: number;
  /** Events/sec in the monitoring (baseline) window */
  baselineRate: number;
  /** Error rate (%) in the burst (short) window */
  shortWindowErrorRate: number;
  /** Error rate (%) in the monitoring (baseline) window */
  baselineErrorRate: number;
  /** Number of events in the burst (short) window */
  shortEventCount: number;
}

/**
 * Return type for useEventBusStream hook.
 */
export interface UseEventBusStreamReturn {
  /** Processed events (bounded by maxItems, most recent first) */
  events: ProcessedEvent[];

  /** Computed metrics from events */
  metrics: EventBusStreamMetrics;

  /** Topic breakdown for charts */
  topicBreakdown: TopicBreakdownItem[];

  /** Event type breakdown for charts */
  eventTypeBreakdown: EventTypeBreakdownItem[];

  /** Time series data for charts */
  timeSeries: TimeSeriesItem[];

  /** WebSocket connection status */
  connectionStatus: EventBusConnectionStatus;

  /** Last error encountered */
  lastError: ProcessedStreamError | null;

  /** Lifetime statistics */
  stats: EventBusStreamStats;

  /** Recent errors (bounded ring buffer) */
  errors: ProcessedStreamError[];

  /** Burst/spike detection info for banner rendering */
  burstInfo: BurstInfo;

  /** Connect to WebSocket */
  connect: () => void;

  /** Disconnect from WebSocket */
  disconnect: () => void;

  /** Clear all events and reset state */
  clearEvents: () => void;
}
