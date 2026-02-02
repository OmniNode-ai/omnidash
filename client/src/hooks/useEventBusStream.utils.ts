/**
 * Utility functions and constants for useEventBusStream hook.
 *
 * Extracted for better separation of concerns and testability.
 * These utilities handle event processing, ID generation, and data normalization.
 */

import { getTopicLabel } from '@/lib/configs/event-bus-dashboard';
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
export const MAX_TIMESTAMP_ENTRIES = 10000;

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

/** Topics to map from message type to raw topic string */
export const NODE_TOPIC_MAP: Record<string, string> = {
  NODE_INTROSPECTION: 'dev.omninode_bridge.onex.evt.node-introspection.v1',
  NODE_HEARTBEAT: 'node.heartbeat',
  NODE_STATE_CHANGE: 'dev.onex.evt.registration-completed.v1',
  NODE_REGISTRY_UPDATE: 'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
};

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
  return data.agentName || data.sourceAgent || data.selectedAgent || 'system';
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
      payload: JSON.stringify(data),
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
