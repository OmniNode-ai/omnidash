/**
 * Intent Event Types
 *
 * TypeScript interfaces for intent event models matching omnibase_core 0.9.4 Python models.
 * Used for Kafka event consumption and API responses in the Real-time Intent Dashboard.
 *
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

/**
 * Generate a UUID v4 using native crypto API
 * Works in Node.js 14.17.0+ and modern browsers
 */
function generateUUID(): string {
  // Use crypto.randomUUID() if available (Node.js 19+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Topic Constants (ONEX canonical naming: dev.onex.{evt|cmd}.{owner}.{event-name}.v{n})
// - evt = event (something happened, notification)
// - cmd = command (request to do something)
// ============================================================================

/**
 * Kafka topic for intent query requests (command - requesting data)
 */
export const INTENT_QUERY_REQUESTED_TOPIC = 'dev.onex.cmd.omnimemory.intent-query-requested.v1';

/**
 * Kafka topic for intent query responses (event - response notification)
 */
export const INTENT_QUERY_RESPONSE_TOPIC = 'dev.onex.evt.omnimemory.intent-query-response.v1';

/**
 * Kafka topic for intent stored events (event - write completed)
 */
export const INTENT_STORED_TOPIC = 'dev.onex.evt.omnimemory.intent-stored.v1';

/**
 * Kafka topic for intent classified events (event - classification completed)
 */
export const INTENT_CLASSIFIED_TOPIC = 'dev.onex.evt.omniintelligence.intent-classified.v1';

// ============================================================================
// Enums / Union Types
// ============================================================================

/**
 * Types of intent queries supported
 */
export type IntentQueryType = 'distribution' | 'session' | 'recent';

/**
 * Status of an intent query response
 */
export type IntentQueryStatus = 'success' | 'error' | 'not_found' | 'no_results';

/**
 * Status of an intent storage operation
 */
export type IntentStoredStatus = 'success' | 'error';

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Intent record payload - embedded in query responses
 * Represents a single classified intent with metadata
 */
export interface IntentRecordPayload {
  /** Unique identifier for the intent (UUID) */
  intent_id: string;
  /** Session reference that generated this intent */
  session_ref: string;
  /** Classified category (e.g., "debugging", "code_generation") */
  intent_category: string;
  /** Classification confidence score (0.0-1.0) */
  confidence: number;
  /** Extracted keywords from the intent */
  keywords: string[];
  /** When the intent was created (ISO-8601) */
  created_at: string;
}

// ============================================================================
// Query Request Events
// ============================================================================

/**
 * Intent query request event - sent to request intent data
 * Published to INTENT_QUERY_REQUESTED_TOPIC
 */
export interface IntentQueryRequestedEvent {
  /** Event type identifier (= INTENT_QUERY_REQUESTED_TOPIC) */
  event_type: string;
  /** Correlation ID for request tracing (UUID, optional) */
  correlation_id?: string;
  /** Unique query identifier (UUID) */
  query_id: string;
  /** Type of query to execute */
  query_type: IntentQueryType;
  /** Session reference for session queries (optional) */
  session_ref?: string;
  /** Time range in hours to query (default: 24) */
  time_range_hours: number;
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence: number;
  /** Maximum number of results (default: 100) */
  limit: number;
  /** Name of the requesting service (e.g., "omnidash") */
  requester_name: string;
  /** When the request was made (ISO-8601) */
  requested_at: string;
}

// ============================================================================
// Query Response Events
// ============================================================================

/**
 * Intent query response event - response to a query request
 * Published to INTENT_QUERY_RESPONSE_TOPIC
 */
export interface IntentQueryResponseEvent {
  /** Event type identifier (= INTENT_QUERY_RESPONSE_TOPIC) */
  event_type: string;
  /** Correlation ID matching the request (UUID, optional) */
  correlation_id?: string;
  /** Query ID matching the request (UUID) */
  query_id: string;
  /** Type of query that was executed */
  query_type: IntentQueryType;
  /** Status of the query execution */
  status: IntentQueryStatus;
  /** Category distribution for distribution queries (category -> count) */
  distribution: Record<string, number>;
  /** Intent records for session/recent queries */
  intents: IntentRecordPayload[];
  /** Number of results returned */
  total_count: number;
  /** Total intents across all categories (for distribution queries) */
  total_intents: number;
  /** Time range that was queried (hours) */
  time_range_hours: number;
  /** Query execution time in milliseconds */
  execution_time_ms: number;
  /** When the response was generated (ISO-8601) */
  responded_at: string;
  /** Error message if status is "error" */
  error_message?: string;
}

// ============================================================================
// Write Path Events
// ============================================================================

/**
 * Intent stored event - emitted when an intent is persisted
 * Published to INTENT_STORED_TOPIC
 */
export interface IntentStoredEvent {
  /** Event type identifier (= INTENT_STORED_TOPIC) */
  event_type: string;
  /** Correlation ID for request tracing (UUID, optional) */
  correlation_id?: string;
  /** Unique identifier for the stored intent (UUID) */
  intent_id: string;
  /** Session reference that generated this intent */
  session_ref: string;
  /** Classified category */
  intent_category: string;
  /** Classification confidence score (0.0-1.0) */
  confidence: number;
  /** Extracted keywords */
  keywords: string[];
  /** True if newly created, false if merged with existing */
  created: boolean;
  /** When the intent was stored (ISO-8601) */
  stored_at: string;
  /** Storage operation time in milliseconds */
  execution_time_ms: number;
  /** Status of the storage operation */
  status: IntentStoredStatus;
  /** Error message if status is "error" */
  error_message?: string;
}

// ============================================================================
// Classification Pipeline Events
// ============================================================================

/**
 * Intent classified event - emitted when an intent is classified
 * Published to INTENT_CLASSIFIED_TOPIC
 */
export interface IntentClassifiedEvent {
  /** Event type identifier ("IntentClassified") */
  event_type: string;
  /** Session that generated this intent */
  session_id: string;
  /** Correlation ID for request tracing (UUID) */
  correlation_id: string;
  /** Classified category */
  intent_category: string;
  /** Classification confidence score (0.0-1.0) */
  confidence: number;
  /** When the classification occurred (ISO-8601) */
  timestamp: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Options for creating a distribution query
 */
export interface DistributionQueryOptions {
  /** Time range in hours (default: 24) */
  time_range_hours?: number;
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence?: number;
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id?: string;
}

/**
 * Options for creating a session query
 */
export interface SessionQueryOptions {
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence?: number;
  /** Maximum number of results (default: 100) */
  limit?: number;
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id?: string;
}

/**
 * Options for creating a recent query
 */
export interface RecentQueryOptions {
  /** Time range in hours (default: 24) */
  time_range_hours?: number;
  /** Maximum number of results (default: 100) */
  limit?: number;
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence?: number;
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id?: string;
}

/**
 * Create an intent distribution query request
 *
 * @param options - Query options
 * @returns IntentQueryRequestedEvent configured for distribution query
 *
 * @example
 * ```typescript
 * const query = createDistributionQuery({ time_range_hours: 48 });
 * // Publish to INTENT_QUERY_REQUESTED_TOPIC
 * ```
 */
export function createDistributionQuery(
  options: DistributionQueryOptions = {}
): IntentQueryRequestedEvent {
  const { time_range_hours = 24, min_confidence = 0.0, correlation_id = generateUUID() } = options;

  return {
    event_type: INTENT_QUERY_REQUESTED_TOPIC,
    correlation_id,
    query_id: generateUUID(),
    query_type: 'distribution',
    time_range_hours,
    min_confidence,
    limit: 100, // Not used for distribution but required by interface
    requester_name: 'omnidash',
    requested_at: new Date().toISOString(),
  };
}

/**
 * Create an intent session query request
 *
 * @param session_ref - Session reference to query intents for
 * @param options - Query options
 * @returns IntentQueryRequestedEvent configured for session query
 *
 * @example
 * ```typescript
 * const query = createSessionQuery('session-123', { limit: 50 });
 * // Publish to INTENT_QUERY_REQUESTED_TOPIC
 * ```
 */
export function createSessionQuery(
  session_ref: string,
  options: SessionQueryOptions = {}
): IntentQueryRequestedEvent {
  const { min_confidence = 0.0, limit = 100, correlation_id = generateUUID() } = options;

  return {
    event_type: INTENT_QUERY_REQUESTED_TOPIC,
    correlation_id,
    query_id: generateUUID(),
    query_type: 'session',
    session_ref,
    time_range_hours: 24, // Default for session queries
    min_confidence,
    limit,
    requester_name: 'omnidash',
    requested_at: new Date().toISOString(),
  };
}

/**
 * Create a recent intents query request
 *
 * @param options - Query options
 * @returns IntentQueryRequestedEvent configured for recent query
 *
 * @example
 * ```typescript
 * const query = createRecentQuery({ time_range_hours: 1, limit: 20 });
 * // Publish to INTENT_QUERY_REQUESTED_TOPIC
 * ```
 */
export function createRecentQuery(options: RecentQueryOptions = {}): IntentQueryRequestedEvent {
  const {
    time_range_hours = 24,
    limit = 100,
    min_confidence = 0.0,
    correlation_id = generateUUID(),
  } = options;

  return {
    event_type: INTENT_QUERY_REQUESTED_TOPIC,
    correlation_id,
    query_id: generateUUID(),
    query_type: 'recent',
    time_range_hours,
    min_confidence,
    limit,
    requester_name: 'omnidash',
    requested_at: new Date().toISOString(),
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an event is an IntentQueryResponseEvent
 */
export function isIntentQueryResponse(event: unknown): event is IntentQueryResponseEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'event_type' in event &&
    (event as IntentQueryResponseEvent).event_type === INTENT_QUERY_RESPONSE_TOPIC
  );
}

/**
 * Type guard to check if an event is an IntentStoredEvent
 */
export function isIntentStoredEvent(event: unknown): event is IntentStoredEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'event_type' in event &&
    (event as IntentStoredEvent).event_type === INTENT_STORED_TOPIC
  );
}

/**
 * Type guard to check if an event is an IntentClassifiedEvent
 */
export function isIntentClassifiedEvent(event: unknown): event is IntentClassifiedEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'event_type' in event &&
    (event as IntentClassifiedEvent).event_type === 'IntentClassified'
  );
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * All intent event types union
 */
export type IntentEvent =
  | IntentQueryRequestedEvent
  | IntentQueryResponseEvent
  | IntentStoredEvent
  | IntentClassifiedEvent;

/**
 * Intent category with count - useful for distribution visualization
 */
export interface IntentCategoryCount {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Convert distribution record to array with percentages
 */
export function distributionToArray(
  distribution: Record<string, number>,
  totalIntents: number
): IntentCategoryCount[] {
  return Object.entries(distribution)
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalIntents > 0 ? (count / totalIntents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
