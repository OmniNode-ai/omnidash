/**
 * Utility functions and constants for useEventBusStream hook.
 *
 * Extracted for better separation of concerns and testability.
 * These utilities handle event processing, ID generation, and data normalization.
 */

import { getTopicLabel } from '@/lib/configs/event-bus-dashboard';
import { extractParsedDetails, type ParsedDetails } from '@/components/event-bus/eventDetailUtils';
import {
  SUFFIX_NODE_INTROSPECTION,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_NODE_REGISTRATION,
  SUFFIX_REQUEST_INTROSPECTION,
} from '@shared/topics';
import type {
  WireEventData,
  ProcessedEvent,
  EventPriority,
  EventIngestResult,
} from './useEventBusStream.types';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum number of events to keep in memory */
export const DEFAULT_MAX_ITEMS = 500;

/** Default interval for flushing pending events to state (ms) */
export const DEFAULT_FLUSH_INTERVAL_MS = 100;

/**
 * Multiplier for dedupe set size relative to maxItems.
 *
 * The seenIds Set is used for O(1) duplicate detection. It must be larger than
 * maxItems to provide effective deduplication across the sliding event window.
 *
 * With default values (maxItems=500, multiplier=5):
 * - maxDedupIds = 2500 (Set cleanup threshold)
 * - After cleanup, Set is rebuilt from visible events (~500-600 entries)
 *
 * Cleanup triggers:
 * 1. On event ingestion when Set exceeds maxDedupIds (immediate)
 * 2. Periodically every 10 seconds as a safeguard (when event flow stops)
 */
export const DEDUPE_SET_CLEANUP_MULTIPLIER = 5;

/** Maximum timestamp entries for throughput calculation */
export const MAX_TIMESTAMP_ENTRIES = 30000;

/** Maximum errors to keep in ring buffer */
export const MAX_ERRORS = 50;

/** Time series bucket size in milliseconds (15 seconds) */
export const TIME_SERIES_BUCKET_MS = 15000;

/**
 * Maximum characters to hash for performance.
 * For very long strings, we sample first + last chars and include length.
 * This provides sufficient uniqueness while maintaining O(1) time complexity
 * for very long inputs (e.g., large event payloads).
 */
export const MAX_HASH_INPUT_LENGTH = 500;

/** Topics to map from message type to canonical ONEX topic suffix */
export const NODE_TOPIC_MAP: Record<string, string> = {
  NODE_INTROSPECTION: SUFFIX_NODE_INTROSPECTION,
  NODE_HEARTBEAT: SUFFIX_NODE_HEARTBEAT,
  NODE_STATE_CHANGE: SUFFIX_NODE_REGISTRATION,
  NODE_REGISTRY_UPDATE: SUFFIX_REQUEST_INTROSPECTION,
};

// ============================================================================
// Shared Windowing Helpers
// ============================================================================

/**
 * Get cutoff timestamp for a given window.
 * All computation sites should use this instead of inline `now - windowMs`.
 * Returns 0 when windowMs exceeds now (e.g., app just started with a large window)
 * so that all events pass the subsequent filter.
 */
export function getWindowCutoff(now: number, windowMs: number): number {
  return Math.max(0, now - windowMs);
}

/** Filter events to those within the window (timestamp >= cutoff) */
export function filterEventsInWindow(events: ProcessedEvent[], cutoff: number): ProcessedEvent[] {
  return events.filter((e) => e.timestamp.getTime() >= cutoff);
}

/** Compute events/sec rate from a count and window duration */
export function computeRate(count: number, windowMs: number): number {
  const windowSeconds = windowMs / 1000;
  if (windowSeconds <= 0) return 0;
  return Math.round((count / windowSeconds) * 10) / 10;
}

/** Compute error-rate percentage with consistent 2-decimal rounding */
export function errorRatePercent(errorCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return Math.round((errorCount / totalCount) * 100 * 100) / 100;
}

/** Compute error rate (%) from windowed events */
export function computeErrorRate(windowedEvents: ProcessedEvent[]): number {
  if (windowedEvents.length === 0) return 0;
  const errorCount = windowedEvents.filter((e) => e.priority === 'critical').length;
  return errorRatePercent(errorCount, windowedEvents.length);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple string hash function for generating stable event IDs.
 * Uses djb2 algorithm - fast and produces good distribution.
 *
 * For very long strings, samples first + last characters and includes length
 * to maintain O(1) time complexity while preserving good uniqueness.
 */
export function hashString(str: string): string {
  // For very long strings, sample first + last chars and include length for uniqueness
  let input = str;
  if (str.length > MAX_HASH_INPUT_LENGTH) {
    const half = MAX_HASH_INPUT_LENGTH / 2;
    input = `${str.slice(0, half)}${str.slice(-half)}:${str.length}`;
  }

  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Convert to unsigned 32-bit integer and return as hex string
  return (hash >>> 0).toString(16);
}

/**
 * Generate a stable event ID from event data.
 * Prefers server-assigned ID, falls back to content hash.
 *
 * @param event - Wire event data
 * @param topic - Topic string
 * @param eventType - Event type string
 * @returns Stable event ID
 */
export function getEventId(event: WireEventData, topic: string, eventType: string): string {
  // Prefer server-assigned ID if present
  if (event.id) return event.id;
  if (event.correlationId) return event.correlationId;

  // Fallback: stable hash over normalized subset
  const timestamp = event.createdAt || event.timestamp || '';
  const payloadSig = JSON.stringify(event).slice(0, 100);

  const normalized = JSON.stringify({
    topic,
    eventType,
    timestamp,
    sig: payloadSig,
  });

  return `h-${hashString(normalized)}`;
}

/**
 * Extract priority from event data with fallbacks.
 */
export function extractPriority(data: WireEventData): EventPriority {
  const priority = data.priority ?? data.severity ?? data.headers?.priority;

  if (
    priority === 'critical' ||
    priority === 'high' ||
    priority === 'normal' ||
    priority === 'low'
  ) {
    return priority;
  }

  // Infer from action type
  if (data.actionType === 'error') {
    return 'critical';
  }

  return 'normal';
}

/**
 * Extract source from event data with fallbacks.
 */
export function extractSource(data: WireEventData): string {
  const d = data as Record<string, unknown>;
  const payload = (data.payload ?? data) as Record<string, unknown>;
  return (
    data.agentName ||
    data.sourceAgent ||
    data.selectedAgent ||
    (typeof d.source === 'string' && d.source ? d.source : undefined) ||
    (typeof payload.node_id === 'string' ? payload.node_id : undefined) ||
    (typeof d.node_id === 'string' ? d.node_id : undefined) ||
    'system'
  );
}

/**
 * Normalize timestamp to ISO string.
 */
export function normalizeTimestamp(timestamp: string | number | undefined): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === 'number') return new Date(timestamp).toISOString();
  return timestamp;
}

/**
 * Generate a one-line human-readable summary from parsed event details.
 * Called once during processEvent(), not on each render.
 */
export function generateSummary(
  eventType: string,
  parsedDetails: ParsedDetails | null,
  data: WireEventData
): string {
  if (!parsedDetails) {
    // Fallback: use actionName or eventType
    const actionName =
      data.actionType || data.actionName || (data as Record<string, unknown>).action_type;
    if (actionName && typeof actionName === 'string') {
      return actionName.length > 60 ? actionName.slice(0, 57) + '...' : actionName;
    }
    return eventType.length > 60 ? eventType.slice(0, 57) + '...' : eventType;
  }

  // Tool content events: "{tool_name} {basename(file_path)}"
  if (parsedDetails.toolName) {
    const filePath = parsedDetails.filePath ?? findFilePathInData(data);
    if (filePath) {
      const basename = filePath.split('/').pop() || filePath;
      return `${parsedDetails.toolName} ${basename}`;
    }
    return parsedDetails.toolName;
  }

  // Heartbeat events: "{node_id} — {health_status}"
  if (parsedDetails.nodeId) {
    const healthStatus = parsedDetails.healthStatus || parsedDetails.status || 'healthy';
    return `${parsedDetails.nodeId} — ${healthStatus}`;
  }

  // Routing decisions: "Selected {selectedAgent} ({confidence}%)"
  if (parsedDetails.selectedAgent) {
    const conf = parsedDetails.confidence;
    const confStr = typeof conf === 'number' ? ` (${Math.round(conf * 100)}%)` : '';
    return `Selected ${parsedDetails.selectedAgent}${confStr}`;
  }

  // Errors: "{error_type}: {truncated(error_message)}"
  if (parsedDetails.error) {
    const errorType = parsedDetails.actionType || 'Error';
    const msg =
      parsedDetails.error.length > 50
        ? parsedDetails.error.slice(0, 47) + '...'
        : parsedDetails.error;
    return `${errorType}: ${msg}`;
  }

  // Agent action with action name
  if (parsedDetails.actionName) {
    return parsedDetails.actionName.length > 60
      ? parsedDetails.actionName.slice(0, 57) + '...'
      : parsedDetails.actionName;
  }

  // Fallback
  return eventType.length > 60 ? eventType.slice(0, 57) + '...' : eventType;
}

/**
 * Search for file_path in event data (handles nested payload structures).
 */
function findFilePathInData(data: WireEventData): string | undefined {
  const d = data as Record<string, unknown>;
  if (typeof d.file_path === 'string') return d.file_path;
  if (typeof d.filePath === 'string') return d.filePath;
  // Check nested payload
  const payload = d.payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.file_path === 'string') return p.file_path;
    if (typeof p.filePath === 'string') return p.filePath;
  }
  // Check nested content/details
  for (const wrapper of ['content', 'details', 'actionDetails', 'action_details', 'data']) {
    if (d[wrapper] && typeof d[wrapper] === 'object') {
      const nested = d[wrapper] as Record<string, unknown>;
      if (typeof nested.file_path === 'string') return nested.file_path;
      if (typeof nested.filePath === 'string') return nested.filePath;
    }
  }
  return undefined;
}

/**
 * Compute a normalized type suitable for chart grouping.
 * Instead of showing "tool-content" for everything, break down by tool_name.
 */
export function computeNormalizedType(
  eventType: string,
  parsedDetails: ParsedDetails | null
): string {
  // For tool events, use the tool name as the type
  if (parsedDetails?.toolName) {
    return parsedDetails.toolName;
  }
  // For routing decisions, use the selected agent
  if (parsedDetails?.selectedAgent) {
    return `route:${parsedDetails.selectedAgent}`;
  }
  // Skip version suffixes (v1, v2, etc.) — these leak from canonical topic parsing
  if (/^v\d+$/.test(eventType)) {
    return (
      parsedDetails?.toolName ||
      parsedDetails?.actionName ||
      parsedDetails?.actionType ||
      parsedDetails?.nodeId ||
      'unknown'
    );
  }
  // Default to eventType
  return eventType;
}

/**
 * Compute a group key for collapsing similar events.
 * Format: "{normalizedType}:{distinguishing_detail}:{status}"
 */
export function computeGroupKey(
  normalizedType: string,
  parsedDetails: ParsedDetails | null,
  data: WireEventData
): string {
  const parts = [normalizedType];

  if (parsedDetails?.toolName) {
    const filePath = findFilePathInData(data);
    if (filePath) {
      parts.push(filePath.split('/').pop() || filePath);
    }
    if (parsedDetails.status) {
      parts.push(parsedDetails.status);
    }
  } else if (parsedDetails?.nodeId) {
    parts.push(parsedDetails.nodeId);
    if (parsedDetails.status) {
      parts.push(parsedDetails.status);
    }
  } else if (parsedDetails?.selectedAgent) {
    parts.push(parsedDetails.selectedAgent);
  }

  return parts.join(':');
}

/**
 * Process raw event data into ProcessedEvent format.
 *
 * @param eventType - Event type string
 * @param data - Raw event data
 * @param topic - Raw topic string
 * @returns EventIngestResult
 */
export function processEvent(
  eventType: string,
  data: WireEventData,
  topic: string
): EventIngestResult {
  try {
    const id = getEventId(data, topic, eventType);
    const timestampRaw = normalizeTimestamp(data.createdAt || data.timestamp);

    const payloadStr = JSON.stringify(data);
    const parsedDetails = extractParsedDetails(payloadStr, eventType);
    const normalizedType = computeNormalizedType(eventType, parsedDetails);

    const event: ProcessedEvent = {
      id,
      topic: getTopicLabel(topic),
      topicRaw: topic,
      eventType,
      priority: extractPriority(data),
      timestamp: new Date(timestampRaw),
      timestampRaw,
      source: extractSource(data),
      correlationId: data.correlationId,
      payload: payloadStr,
      summary: generateSummary(eventType, parsedDetails, data),
      normalizedType,
      groupKey: computeGroupKey(normalizedType, parsedDetails, data),
      parsedDetails,
    };

    return { status: 'success', event };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error processing event',
      raw: data,
    };
  }
}
