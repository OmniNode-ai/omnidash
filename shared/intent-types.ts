/**
 * Intent Event Types
 *
 * TypeScript interfaces and Zod schemas for intent event models matching omnibase_core 0.9.4 Python models.
 * Used for Kafka event consumption and API responses in the Real-time Intent Dashboard.
 *
 * This module provides:
 * - TypeScript interfaces for compile-time type checking
 * - Zod schemas for runtime validation
 * - Factory functions for creating events
 * - Type guards for event discrimination
 * - Shared constants (VALID_INTENT_CATEGORIES, topic names)
 *
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

import { z } from 'zod';
import { generateUUID } from './uuid';

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
 *
 * NOTE: Topic name vs event_type distinction:
 * - Topic name (this constant): Used for Kafka routing, follows ONEX canonical naming
 *   Format: dev.onex.{evt|cmd}.{owner}.{event-name}.v{n}
 * - event_type field: Short identifier within the event payload (e.g., "IntentClassified")
 *
 * The IntentClassifiedEvent.event_type field contains "IntentClassified" (the event type name),
 * NOT this topic constant. See isIntentClassifiedEvent() type guard for usage.
 */
export const INTENT_CLASSIFIED_TOPIC = 'dev.onex.evt.omniintelligence.intent-classified.v1';

// ============================================================================
// WebSocket Channel Constants
// ============================================================================

/**
 * WebSocket channel for intent classified events.
 * Used by useIntentStream hook to subscribe to real-time intent classifications.
 *
 * NOTE: This is a WebSocket subscription channel name, NOT a Kafka topic.
 * The server maps this channel to the appropriate Kafka topic internally.
 */
export const WS_CHANNEL_INTENTS = 'intents';

/**
 * WebSocket channel for intent stored events.
 * Used by useIntentStream hook to subscribe to real-time intent storage notifications.
 *
 * NOTE: This is a WebSocket subscription channel name, NOT a Kafka topic.
 * The server maps this channel to the appropriate Kafka topic internally.
 */
export const WS_CHANNEL_INTENTS_STORED = 'intents-stored';

// ============================================================================
// Event Type Names (distinct from topic names)
// These are the values that appear in the event_type field of event payloads
// ============================================================================

/**
 * Event type names used in the event_type field of event payloads.
 *
 * NOTE: These are DIFFERENT from Kafka topic constants:
 * - Topic names (INTENT_*_TOPIC): Used for Kafka routing
 * - Event type names (EVENT_TYPE_NAMES.*): Values in event payloads
 */
export const EVENT_TYPE_NAMES = {
  /** Event type for intent classification events */
  INTENT_CLASSIFIED: 'IntentClassified',
  /** Event type for intent stored events */
  INTENT_STORED: 'IntentStored',
  /** Event type for intent query request events */
  INTENT_QUERY_REQUESTED: 'IntentQueryRequested',
  /** Event type for intent query response events */
  INTENT_QUERY_RESPONSE: 'IntentQueryResponse',
} as const;

// ============================================================================
// Valid Intent Categories
// ============================================================================

/**
 * Valid intent categories supported by the system.
 * This is the canonical list of categories used for classification.
 *
 * Usage:
 * - Import and use for validation: `VALID_INTENT_CATEGORIES.includes(category)`
 * - Use with Zod: `z.enum(VALID_INTENT_CATEGORIES)`
 *
 * @example
 * ```typescript
 * import { VALID_INTENT_CATEGORIES } from '@shared/intent-types';
 *
 * function isValidCategory(category: string): boolean {
 *   return VALID_INTENT_CATEGORIES.includes(category as IntentCategory);
 * }
 * ```
 */
export const VALID_INTENT_CATEGORIES = [
  'debugging',
  'code_generation',
  'refactoring',
  'testing',
  'documentation',
  'analysis',
  'pattern_learning',
  'quality_assessment',
  'semantic_analysis',
  'deployment',
  'configuration',
  'question',
  'unknown',
] as const;

/**
 * Type for valid intent categories
 */
export type IntentCategory = (typeof VALID_INTENT_CATEGORIES)[number];

// ============================================================================
// Enums / Union Types with Zod Schemas
// ============================================================================

/**
 * Types of intent queries supported.
 * - 'distribution': Get category distribution counts
 * - 'session': Get intents for a specific session
 * - 'recent': Get recent intents across all sessions
 * - 'search': Search intents by keywords (server-only)
 */
export const IntentQueryTypeSchema = z.enum(['distribution', 'session', 'recent', 'search']);
export type IntentQueryType = z.infer<typeof IntentQueryTypeSchema>;

/**
 * Status of an intent query response.
 * - 'success': Query completed successfully
 * - 'error': Query failed with an error
 * - 'partial': Query returned partial results (server-only)
 * - 'not_found': Requested resource not found
 * - 'no_results': Query succeeded but returned no results
 */
export const IntentQueryStatusSchema = z.enum([
  'success',
  'error',
  'partial',
  'not_found',
  'no_results',
]);
export type IntentQueryStatus = z.infer<typeof IntentQueryStatusSchema>;

/**
 * Status of an intent storage operation
 */
export const IntentStoredStatusSchema = z.enum(['success', 'error']);
export type IntentStoredStatus = z.infer<typeof IntentStoredStatusSchema>;

/**
 * Zod schema for IntentCategory validation.
 * Uses the VALID_INTENT_CATEGORIES array for enum validation.
 */
export const IntentCategorySchema = z.enum(VALID_INTENT_CATEGORIES);

// ============================================================================
// Payload Types with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentRecordPayload
 * Used for runtime validation of intent records from API responses and Kafka events.
 */
export const IntentRecordPayloadSchema = z.object({
  /** Unique identifier for the intent (UUID) */
  intent_id: z.string().uuid(),
  /** Session reference that generated this intent */
  session_ref: z.string().min(1),
  /** Classified category (e.g., "debugging", "code_generation") */
  intent_category: z.string().min(1),
  /** Classification confidence score (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** Extracted keywords from the intent */
  keywords: z.array(z.string()),
  /** When the intent was created (ISO-8601) */
  created_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

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
// Query Request Events with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentQueryRequestedEvent
 * Used for runtime validation of query request events.
 */
export const IntentQueryRequestedEventSchema = z.object({
  /** Event type identifier (= INTENT_QUERY_REQUESTED_TOPIC) */
  event_type: z.string(),
  /** Correlation ID for request tracing (UUID, optional) */
  correlation_id: z.string().uuid().optional(),
  /** Unique query identifier (UUID) */
  query_id: z.string().uuid(),
  /** Type of query to execute */
  query_type: IntentQueryTypeSchema,
  /** Session reference for session queries (optional) */
  session_ref: z.string().optional(),
  /** Time range in hours to query (default: 24) */
  time_range_hours: z.number().positive(),
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence: z.number().min(0).max(1),
  /** Maximum number of results (default: 100) */
  limit: z.number().positive().int(),
  /** Name of the requesting service (e.g., "omnidash") */
  requester_name: z.string().min(1),
  /** When the request was made (ISO-8601) */
  requested_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

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
// Query Response Events with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentCategoryDistribution (array format used by server).
 * This format includes pre-calculated percentages.
 */
export const IntentCategoryDistributionSchema = z.object({
  /** Category name */
  category: z.string(),
  /** Count of intents in this category */
  count: z.number().int().nonnegative(),
  /** Percentage of total intents */
  percentage: z.number().min(0).max(100),
});

/**
 * Intent category distribution entry (array format).
 * Used by server/intent-events.ts for distribution responses.
 */
export interface IntentCategoryDistribution {
  /** Category name */
  category: string;
  /** Count of intents in this category */
  count: number;
  /** Percentage of total intents */
  percentage: number;
}

/**
 * Zod schema for distribution field - supports both Record and Array formats.
 * - Record<string, number>: Simple category -> count mapping (from Kafka)
 * - IntentCategoryDistribution[]: Array with category, count, percentage (from server)
 */
export const DistributionFieldSchema = z.union([
  z.record(z.string(), z.number()),
  z.array(IntentCategoryDistributionSchema),
]);

/**
 * Type for distribution field - supports both Record and Array formats.
 */
export type DistributionField = Record<string, number> | IntentCategoryDistribution[];

/**
 * Zod schema for IntentQueryResponseEvent
 * Used for runtime validation of query response events.
 *
 * NOTE: distribution and intents are optional because they depend on query_type:
 * - distribution queries return distribution (Record or Array format)
 * - session/recent queries return intents
 * - search queries return intents
 *
 * The distribution field can be either:
 * - Record<string, number>: Simple category -> count mapping (from Kafka)
 * - IntentCategoryDistribution[]: Array with category, count, percentage (from server)
 *
 * Use distributionToArray() to normalize Record format to array format.
 */
export const IntentQueryResponseEventSchema = z.object({
  /** Event type identifier (= INTENT_QUERY_RESPONSE_TOPIC) */
  event_type: z.string(),
  /** Correlation ID matching the request (UUID, optional) */
  correlation_id: z.string().uuid().optional(),
  /** Query ID matching the request (UUID) */
  query_id: z.string().uuid(),
  /** Type of query that was executed */
  query_type: IntentQueryTypeSchema,
  /** Status of the query execution */
  status: IntentQueryStatusSchema,
  /** Category distribution for distribution queries - supports Record or Array format */
  distribution: DistributionFieldSchema.optional(),
  /** Intent records for session/recent/search queries - optional for distribution queries */
  intents: z.array(IntentRecordPayloadSchema).optional(),
  /** Number of results returned */
  total_count: z.number().int().nonnegative(),
  /** Total intents across all categories (for distribution queries) - optional for non-distribution queries */
  total_intents: z.number().int().nonnegative().optional(),
  /** Time range that was queried (hours) - optional, not all queries use it */
  time_range_hours: z.number().positive().optional(),
  /** Query execution time in milliseconds - optional, may not be tracked */
  execution_time_ms: z.number().nonnegative().optional(),
  /** When the response was generated (ISO-8601) - optional for backward compatibility */
  responded_at: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  /** Error message if status is "error" */
  error_message: z.string().optional(),
});

/**
 * Intent query response event - response to a query request
 * Published to INTENT_QUERY_RESPONSE_TOPIC
 *
 * NOTE: Field optionality aligned with server/intent-events.ts IntentQueryResponseEvent.
 * - distribution: Optional, only present for distribution queries (supports Record or Array format)
 * - intents: Optional, only present for session/recent/search queries
 * - total_intents: Optional, only meaningful for distribution queries
 * - time_range_hours: Optional, not all query types use it
 * - execution_time_ms: Optional, may not be tracked by all producers
 * - responded_at: Optional, for backward compatibility
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
  /**
   * Category distribution for distribution queries.
   * Supports two formats:
   * - Record<string, number>: Simple category -> count mapping (from Kafka)
   * - IntentCategoryDistribution[]: Array with category, count, percentage (from server)
   */
  distribution?: DistributionField;
  /** Intent records for session/recent/search queries */
  intents?: IntentRecordPayload[];
  /** Number of results returned */
  total_count: number;
  /** Total intents across all categories (for distribution queries) */
  total_intents?: number;
  /** Time range that was queried (hours) */
  time_range_hours?: number;
  /** Query execution time in milliseconds */
  execution_time_ms?: number;
  /** When the response was generated (ISO-8601) */
  responded_at?: string;
  /** Error message if status is "error" */
  error_message?: string;
}

// ============================================================================
// Write Path Events with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentStoredEvent
 * Used for runtime validation of intent stored events from Kafka.
 */
export const IntentStoredEventSchema = z.object({
  /** Event type identifier (= INTENT_STORED_TOPIC) */
  event_type: z.string(),
  /** Correlation ID for request tracing (UUID, optional) */
  correlation_id: z.string().uuid().optional(),
  /** Unique identifier for the stored intent (UUID) */
  intent_id: z.string().uuid(),
  /** Session reference that generated this intent */
  session_ref: z.string().min(1),
  /** Classified category */
  intent_category: z.string().min(1),
  /** Classification confidence score (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** Extracted keywords */
  keywords: z.array(z.string()),
  /** True if newly created, false if merged with existing */
  created: z.boolean(),
  /** When the intent was stored (ISO-8601) */
  stored_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  /** Storage operation time in milliseconds */
  execution_time_ms: z.number().nonnegative(),
  /** Status of the storage operation */
  status: IntentStoredStatusSchema,
  /** Error message if status is "error" */
  error_message: z.string().optional(),
});

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
// Classification Pipeline Events with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentClassifiedEvent
 * Used for runtime validation of intent classification events from Kafka.
 *
 * NOTE: Uses EVENT_TYPE_NAMES.INTENT_CLASSIFIED for event_type validation,
 * NOT the topic constant (INTENT_CLASSIFIED_TOPIC). The event_type field
 * contains the event type name, while the topic is used for Kafka routing.
 */
export const IntentClassifiedEventSchema = z.object({
  /** Event type identifier ("IntentClassified") */
  event_type: z.literal(EVENT_TYPE_NAMES.INTENT_CLASSIFIED),
  /** Session that generated this intent */
  session_id: z.string().min(1),
  /** Correlation ID for request tracing (UUID) */
  correlation_id: z.string().uuid(),
  /** Classified category */
  intent_category: z.string().min(1),
  /** Classification confidence score (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** When the classification occurred (ISO-8601) */
  timestamp: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

/**
 * Intent classified event - emitted when an intent is classified
 * Published to INTENT_CLASSIFIED_TOPIC
 *
 * NOTE: The event_type field contains EVENT_TYPE_NAMES.INTENT_CLASSIFIED ("IntentClassified"),
 * NOT the Kafka topic name. See isIntentClassifiedEvent() type guard for correct usage.
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
 * Zod schema for DistributionQueryOptions.
 * Used for runtime validation of distribution query parameters.
 */
export const DistributionQueryOptionsSchema = z.object({
  /** Time range in hours (default: 24) */
  time_range_hours: z.number().positive().optional(),
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence: z.number().min(0).max(1).optional(),
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id: z.string().uuid().optional(),
});

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
 * Zod schema for SessionQueryOptions.
 * Used for runtime validation of session query parameters.
 */
export const SessionQueryOptionsSchema = z.object({
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence: z.number().min(0).max(1).optional(),
  /** Maximum number of results (default: 100) */
  limit: z.number().positive().int().optional(),
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id: z.string().uuid().optional(),
});

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
 * Zod schema for RecentQueryOptions.
 * Used for runtime validation of recent query parameters.
 */
export const RecentQueryOptionsSchema = z.object({
  /** Time range in hours (default: 24) */
  time_range_hours: z.number().positive().optional(),
  /** Maximum number of results (default: 100) */
  limit: z.number().positive().int().optional(),
  /** Minimum confidence threshold (default: 0.0) */
  min_confidence: z.number().min(0).max(1).optional(),
  /** Correlation ID for tracing (auto-generated if not provided) */
  correlation_id: z.string().uuid().optional(),
});

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
 * Type guard to check if an event is an IntentQueryRequestedEvent.
 * Uses INTENT_QUERY_REQUESTED_TOPIC constant for consistent event_type matching.
 */
export function isIntentQueryRequestedEvent(event: unknown): event is IntentQueryRequestedEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'event_type' in event &&
    (event as IntentQueryRequestedEvent).event_type === INTENT_QUERY_REQUESTED_TOPIC
  );
}

/**
 * Type guard to check if an event is an IntentQueryResponseEvent.
 * Uses INTENT_QUERY_RESPONSE_TOPIC constant for consistent event_type matching.
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
 * Type guard to check if an event is an IntentStoredEvent.
 * Uses INTENT_STORED_TOPIC constant for consistent event_type matching.
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
 * Type guard to check if an event is an IntentClassifiedEvent.
 *
 * Uses EVENT_TYPE_NAMES.INTENT_CLASSIFIED (event type name in payload),
 * not INTENT_CLASSIFIED_TOPIC (Kafka topic for routing).
 *
 * NOTE: IntentClassifiedEvent uses a different pattern - the event_type field
 * contains the event type name ("IntentClassified"), not the Kafka topic.
 * This is because classified events may be routed through different topics
 * but always have the same event_type value.
 */
export function isIntentClassifiedEvent(event: unknown): event is IntentClassifiedEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'event_type' in event &&
    (event as IntentClassifiedEvent).event_type === EVENT_TYPE_NAMES.INTENT_CLASSIFIED
  );
}

// ============================================================================
// Utility Types with Zod Schemas
// ============================================================================

/**
 * Zod schema for IntentEvent union type.
 * Validates any of the four intent event types.
 *
 * NOTE: Uses z.union() with the event type schemas for comprehensive validation.
 */
export const IntentEventSchema = z.union([
  IntentQueryRequestedEventSchema,
  IntentQueryResponseEventSchema,
  IntentStoredEventSchema,
  IntentClassifiedEventSchema,
]);

/**
 * All intent event types union
 */
export type IntentEvent =
  | IntentQueryRequestedEvent
  | IntentQueryResponseEvent
  | IntentStoredEvent
  | IntentClassifiedEvent;

/**
 * Zod schema for IntentCategoryCount (alias of IntentCategoryDistributionSchema)
 * Used for runtime validation of distribution data in visualization components.
 *
 * @deprecated Use IntentCategoryDistributionSchema instead
 */
export const IntentCategoryCountSchema = IntentCategoryDistributionSchema;

/**
 * Intent category with count - useful for distribution visualization.
 * This is an alias of IntentCategoryDistribution for backward compatibility.
 *
 * @see IntentCategoryDistribution - The canonical type
 */
export type IntentCategoryCount = IntentCategoryDistribution;

/**
 * Convert distribution record to array with percentages
 *
 * @param distribution - Record mapping category names to counts
 * @param totalIntents - Total number of intents for percentage calculation
 * @returns Array of IntentCategoryCount sorted by count descending
 *
 * @example
 * ```typescript
 * const distribution = { debugging: 50, code_generation: 30, testing: 20 };
 * const array = distributionToArray(distribution, 100);
 * // Returns: [
 * //   { category: 'debugging', count: 50, percentage: 50 },
 * //   { category: 'code_generation', count: 30, percentage: 30 },
 * //   { category: 'testing', count: 20, percentage: 20 }
 * // ]
 * ```
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

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate an intent category against VALID_INTENT_CATEGORIES.
 *
 * @param category - The category string to validate
 * @returns true if the category is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidIntentCategory('debugging') // true
 * isValidIntentCategory('invalid_category') // false
 * ```
 */
export function isValidIntentCategory(category: string): category is IntentCategory {
  return VALID_INTENT_CATEGORIES.includes(category as IntentCategory);
}

/**
 * Parse and validate an IntentRecordPayload using Zod schema.
 *
 * @param data - The data to validate
 * @returns Parsed IntentRecordPayload or throws ZodError
 *
 * @example
 * ```typescript
 * const payload = parseIntentRecord(rawData);
 * // Throws if validation fails
 * ```
 */
export function parseIntentRecord(data: unknown): IntentRecordPayload {
  return IntentRecordPayloadSchema.parse(data);
}

/**
 * Safely parse an IntentRecordPayload using Zod schema.
 *
 * @param data - The data to validate
 * @returns Result object with success status and data or error
 *
 * @example
 * ```typescript
 * const result = safeParseIntentRecord(rawData);
 * if (result.success) {
 *   console.log(result.data.intent_id);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeParseIntentRecord(
  data: unknown
): z.SafeParseReturnType<unknown, IntentRecordPayload> {
  return IntentRecordPayloadSchema.safeParse(data);
}

// ============================================================================
// Timestamp Validation Utilities
// ============================================================================

/**
 * Validate an ISO-8601 timestamp string.
 *
 * @param timestamp - The timestamp string to validate
 * @returns true if the timestamp is valid ISO-8601, false otherwise
 *
 * @example
 * ```typescript
 * isValidTimestamp('2026-01-26T10:30:00Z') // true
 * isValidTimestamp('2026-01-26T10:30:00.123Z') // true
 * isValidTimestamp('2026-01-26T10:30:00+05:00') // true
 * isValidTimestamp('invalid') // false
 * isValidTimestamp('') // false
 * ```
 */
export function isValidTimestamp(timestamp: string): boolean {
  if (!timestamp || typeof timestamp !== 'string') {
    return false;
  }

  // Try parsing as a Date and check if it's valid
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return false;
  }

  // Additional check: ISO-8601 format validation
  // This regex matches common ISO-8601 formats including:
  // - 2026-01-26T10:30:00Z (UTC)
  // - 2026-01-26T10:30:00.123Z (with milliseconds)
  // - 2026-01-26T10:30:00+05:00 (with offset)
  // - 2026-01-26T10:30:00-05:00 (with negative offset)
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/;
  return iso8601Regex.test(timestamp);
}

/**
 * Parse a timestamp string safely, returning null for invalid timestamps.
 *
 * @param timestamp - The timestamp string to parse
 * @returns Date object if valid, null otherwise
 *
 * @example
 * ```typescript
 * const date = safeParseTimestamp('2026-01-26T10:30:00Z');
 * if (date) {
 *   console.log(date.toISOString());
 * }
 * ```
 */
export function safeParseTimestamp(timestamp: string): Date | null {
  if (!isValidTimestamp(timestamp)) {
    return null;
  }
  return new Date(timestamp);
}

/**
 * Get a valid timestamp or a fallback value.
 * Useful for ensuring a valid timestamp in event processing.
 *
 * @param timestamp - The timestamp string to validate
 * @param fallback - Optional fallback value (defaults to current time)
 * @returns Valid ISO-8601 timestamp string
 *
 * @example
 * ```typescript
 * const ts = getValidTimestamp(event.timestamp);
 * // Returns event.timestamp if valid, otherwise current time
 *
 * const ts2 = getValidTimestamp(event.timestamp, '2026-01-01T00:00:00Z');
 * // Returns event.timestamp if valid, otherwise the fallback
 * ```
 */
export function getValidTimestamp(timestamp: string | undefined | null, fallback?: string): string {
  if (timestamp && isValidTimestamp(timestamp)) {
    return timestamp;
  }
  if (fallback && isValidTimestamp(fallback)) {
    return fallback;
  }
  return new Date().toISOString();
}

// ============================================================================
// Distribution Normalization Utilities
// ============================================================================

/**
 * Check if distribution is in array format (IntentCategoryDistribution[]).
 *
 * @param distribution - The distribution to check
 * @returns true if array format, false if record format
 */
export function isDistributionArray(
  distribution: DistributionField
): distribution is IntentCategoryDistribution[] {
  return Array.isArray(distribution);
}

/**
 * Normalize distribution to array format with percentages.
 * Handles both Record<string, number> and IntentCategoryDistribution[] formats.
 *
 * @param distribution - Distribution in either format
 * @param totalIntents - Total intents for percentage calculation (required for Record format)
 * @returns Array of IntentCategoryDistribution sorted by count descending
 *
 * @example
 * ```typescript
 * // From Record format
 * const arr1 = normalizeDistribution({ debugging: 50, testing: 30 }, 80);
 *
 * // From Array format (passes through, recalculates if totalIntents differs)
 * const arr2 = normalizeDistribution([{ category: 'debugging', count: 50, percentage: 62.5 }]);
 * ```
 */
export function normalizeDistribution(
  distribution: DistributionField,
  totalIntents?: number
): IntentCategoryDistribution[] {
  if (isDistributionArray(distribution)) {
    // Already in array format
    if (totalIntents !== undefined) {
      // Recalculate percentages with provided total
      return distribution
        .map((d) => ({
          category: d.category,
          count: d.count,
          percentage: totalIntents > 0 ? (d.count / totalIntents) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
    }
    // Return as-is, already has percentages
    return [...distribution].sort((a, b) => b.count - a.count);
  }

  // Record format - convert to array
  const total = totalIntents ?? Object.values(distribution).reduce((sum, count) => sum + count, 0);
  return Object.entries(distribution)
    .map(([category, count]) => ({
      category,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
