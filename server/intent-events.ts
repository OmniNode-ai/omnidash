import { EventEmitter } from 'events';

// ============================================================================
// Intent Event Types
// ============================================================================

/**
 * Event type constants for intent-related WebSocket broadcasts
 */
export const IntentEventType = {
  INTENT_STORED: 'intentStored',
  INTENT_DISTRIBUTION: 'intentDistribution',
  INTENT_SESSION: 'intentSession',
  INTENT_RECENT: 'intentRecent',
} as const;

export type IntentEventTypeValue = (typeof IntentEventType)[keyof typeof IntentEventType];

// ============================================================================
// TypeScript Interfaces (based on canonical models from omnibase_core)
// ============================================================================

/**
 * Intent record payload - represents a stored intent
 * Based on: omnibase_core IntentRecordPayload
 */
export interface IntentRecordPayload {
  intent_id: string;
  session_ref: string;
  intent_category: string;
  confidence: number;
  keywords: string[];
  created_at: string;
}

/**
 * Intent category distribution entry
 */
export interface IntentCategoryDistribution {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Intent query response event - response from intent queries
 * Based on: omnibase_core ModelIntentQueryResponseEvent
 */
export interface IntentQueryResponseEvent {
  query_id: string;
  query_type: 'distribution' | 'recent' | 'session' | 'search';
  status: 'success' | 'error' | 'partial';
  distribution?: IntentCategoryDistribution[];
  intents?: IntentRecordPayload[];
  total_count: number;
  error_message?: string;
}

/**
 * Session intent summary - intents grouped by session
 */
export interface SessionIntentSummary {
  session_ref: string;
  intent_count: number;
  categories: string[];
  first_intent_at: string;
  last_intent_at: string;
}

// ============================================================================
// Event Payload Interfaces
// ============================================================================

/**
 * Payload for INTENT_STORED events
 */
export interface IntentStoredEventPayload {
  intent: IntentRecordPayload;
  timestamp: string;
}

/**
 * Payload for INTENT_DISTRIBUTION events
 */
export interface IntentDistributionEventPayload {
  distribution: IntentCategoryDistribution[];
  total_count: number;
  timestamp: string;
}

/**
 * Payload for INTENT_SESSION events
 */
export interface IntentSessionEventPayload {
  session: SessionIntentSummary;
  intents?: IntentRecordPayload[];
  timestamp: string;
}

/**
 * Payload for INTENT_RECENT events
 */
export interface IntentRecentEventPayload {
  intents: IntentRecordPayload[];
  total_count: number;
  timestamp: string;
}

/**
 * Union type for all intent event payloads
 */
export type IntentEventPayload =
  | IntentStoredEventPayload
  | IntentDistributionEventPayload
  | IntentSessionEventPayload
  | IntentRecentEventPayload;

// ============================================================================
// IntentEventEmitter Class
// ============================================================================

/**
 * IntentEventEmitter provides WebSocket event broadcasting for intent-related updates.
 *
 * This class emits events that can be consumed by the WebSocket server to broadcast
 * real-time intent updates to connected clients. It follows the same pattern as
 * EventConsumer for consistency.
 *
 * @extends EventEmitter
 *
 * @fires IntentEventEmitter#intentStored - When a new intent is stored
 * @fires IntentEventEmitter#intentDistribution - When category distribution is updated
 * @fires IntentEventEmitter#intentSession - When session intent summary is updated
 * @fires IntentEventEmitter#intentRecent - When recent intents list is updated
 * @fires IntentEventEmitter#intentEvent - General event for all intent updates (includes eventType)
 *
 * @example
 * ```typescript
 * const emitter = getIntentEventEmitter();
 *
 * // Listen for specific intent events
 * emitter.on('intentStored', (payload) => {
 *   console.log('New intent stored:', payload.intent.intent_id);
 * });
 *
 * // Listen for all intent events
 * emitter.on('intentEvent', (eventType, payload) => {
 *   console.log(`Intent event: ${eventType}`, payload);
 * });
 *
 * // Emit an intent stored event
 * emitter.emitIntentStored({
 *   intent_id: 'int_123',
 *   session_ref: 'sess_456',
 *   intent_category: 'code_generation',
 *   confidence: 0.95,
 *   keywords: ['python', 'fastapi'],
 *   created_at: new Date().toISOString(),
 * });
 * ```
 */
export class IntentEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Set max listeners to avoid memory leak warnings with many WebSocket clients
    this.setMaxListeners(100);
  }

  /**
   * Emit a general intent event that routes to both the general 'intentEvent' topic
   * and the specific event type topic.
   *
   * This allows consumers to either:
   * 1. Listen to all intent events via 'intentEvent'
   * 2. Listen to specific event types via the eventType parameter
   *
   * @param eventType - The type of intent event (e.g., 'intentStored', 'intentDistribution')
   * @param data - The event payload
   *
   * @example
   * ```typescript
   * emitter.emitIntentEvent(IntentEventType.INTENT_STORED, {
   *   intent: { intent_id: '123', ... },
   *   timestamp: new Date().toISOString(),
   * });
   * ```
   */
  emitIntentEvent(eventType: IntentEventTypeValue, data: IntentEventPayload): void {
    // Emit to the general 'intentEvent' topic with event type included
    this.emit('intentEvent', eventType, data);

    // Also emit to the specific event type topic for targeted subscriptions
    this.emit(eventType, data);

    if (process.env.DEBUG_INTENT_EVENTS === 'true') {
      console.log(`[IntentEventEmitter] Emitted ${eventType} event`);
    }
  }

  /**
   * Emit an event when a new intent is stored.
   *
   * @param intent - The stored intent record
   *
   * @fires IntentEventEmitter#intentStored
   * @fires IntentEventEmitter#intentEvent
   *
   * @example
   * ```typescript
   * emitter.emitIntentStored({
   *   intent_id: 'int_abc123',
   *   session_ref: 'sess_xyz789',
   *   intent_category: 'debugging',
   *   confidence: 0.92,
   *   keywords: ['error', 'fix', 'traceback'],
   *   created_at: new Date().toISOString(),
   * });
   * ```
   */
  emitIntentStored(intent: IntentRecordPayload): void {
    const payload: IntentStoredEventPayload = {
      intent,
      timestamp: new Date().toISOString(),
    };

    this.emitIntentEvent(IntentEventType.INTENT_STORED, payload);
  }

  /**
   * Emit an event when the intent category distribution is updated.
   *
   * @param distribution - Array of category distribution entries
   * @param totalCount - Total number of intents across all categories
   *
   * @fires IntentEventEmitter#intentDistribution
   * @fires IntentEventEmitter#intentEvent
   *
   * @example
   * ```typescript
   * emitter.emitDistributionUpdate([
   *   { category: 'code_generation', count: 150, percentage: 45.5 },
   *   { category: 'debugging', count: 100, percentage: 30.3 },
   *   { category: 'documentation', count: 80, percentage: 24.2 },
   * ], 330);
   * ```
   */
  emitDistributionUpdate(distribution: IntentCategoryDistribution[], totalCount?: number): void {
    const total = totalCount ?? distribution.reduce((sum, d) => sum + d.count, 0);

    const payload: IntentDistributionEventPayload = {
      distribution,
      total_count: total,
      timestamp: new Date().toISOString(),
    };

    this.emitIntentEvent(IntentEventType.INTENT_DISTRIBUTION, payload);
  }

  /**
   * Emit an event when session intent data is updated.
   *
   * @param session - The session intent summary
   * @param intents - Optional array of intents for this session
   *
   * @fires IntentEventEmitter#intentSession
   * @fires IntentEventEmitter#intentEvent
   *
   * @example
   * ```typescript
   * emitter.emitSessionUpdate({
   *   session_ref: 'sess_xyz789',
   *   intent_count: 5,
   *   categories: ['code_generation', 'debugging'],
   *   first_intent_at: '2026-01-25T10:00:00Z',
   *   last_intent_at: '2026-01-25T10:30:00Z',
   * });
   * ```
   */
  emitSessionUpdate(session: SessionIntentSummary, intents?: IntentRecordPayload[]): void {
    const payload: IntentSessionEventPayload = {
      session,
      intents,
      timestamp: new Date().toISOString(),
    };

    this.emitIntentEvent(IntentEventType.INTENT_SESSION, payload);
  }

  /**
   * Emit an event when recent intents list is refreshed.
   *
   * @param intents - Array of recent intent records
   * @param totalCount - Total count of intents available
   *
   * @fires IntentEventEmitter#intentRecent
   * @fires IntentEventEmitter#intentEvent
   *
   * @example
   * ```typescript
   * emitter.emitRecentIntents([
   *   { intent_id: 'int_1', ... },
   *   { intent_id: 'int_2', ... },
   * ], 1500);
   * ```
   */
  emitRecentIntents(intents: IntentRecordPayload[], totalCount: number): void {
    const payload: IntentRecentEventPayload = {
      intents,
      total_count: totalCount,
      timestamp: new Date().toISOString(),
    };

    this.emitIntentEvent(IntentEventType.INTENT_RECENT, payload);
  }

  /**
   * Emit an event from an IntentQueryResponseEvent (typically from Kafka)
   *
   * This method routes the response to the appropriate event type based on
   * the query_type field.
   *
   * @param response - The intent query response event
   *
   * @example
   * ```typescript
   * emitter.emitFromQueryResponse({
   *   query_id: 'q_123',
   *   query_type: 'distribution',
   *   status: 'success',
   *   distribution: [...],
   *   total_count: 500,
   * });
   * ```
   */
  emitFromQueryResponse(response: IntentQueryResponseEvent): void {
    if (response.status === 'error') {
      console.warn(
        `[IntentEventEmitter] Query ${response.query_id} failed: ${response.error_message}`
      );
      return;
    }

    switch (response.query_type) {
      case 'distribution':
        if (response.distribution) {
          this.emitDistributionUpdate(response.distribution, response.total_count);
        }
        break;

      case 'recent':
        if (response.intents) {
          this.emitRecentIntents(response.intents, response.total_count);
        }
        break;

      case 'session':
        // Session queries typically return intents for a specific session
        // We'd need additional context to emit a proper session update
        if (response.intents && response.intents.length > 0) {
          const firstIntent = response.intents[0];
          // NOTE: Assumes intents are sorted newest-first (descending by created_at).
          // first_intent_at = oldest = last in array, last_intent_at = newest = first in array
          const sessionSummary: SessionIntentSummary = {
            session_ref: firstIntent.session_ref,
            intent_count: response.total_count,
            categories: Array.from(new Set(response.intents.map((i) => i.intent_category))),
            first_intent_at: response.intents[response.intents.length - 1].created_at,
            last_intent_at: firstIntent.created_at,
          };
          this.emitSessionUpdate(sessionSummary, response.intents);
        }
        break;

      case 'search':
        // Search results can be treated as recent intents
        if (response.intents) {
          this.emitRecentIntents(response.intents, response.total_count);
        }
        break;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let intentEventEmitterInstance: IntentEventEmitter | null = null;

/**
 * Get the singleton IntentEventEmitter instance.
 *
 * This follows the lazy initialization pattern used by EventConsumer
 * for consistency across the codebase.
 *
 * @returns IntentEventEmitter singleton instance
 *
 * @example
 * ```typescript
 * const emitter = getIntentEventEmitter();
 * emitter.on('intentStored', (payload) => {
 *   // Handle new intent
 * });
 * ```
 */
export function getIntentEventEmitter(): IntentEventEmitter {
  if (!intentEventEmitterInstance) {
    intentEventEmitterInstance = new IntentEventEmitter();
    if (process.env.DEBUG_INTENT_EVENTS === 'true') {
      console.log('[IntentEventEmitter] Initialized singleton instance');
    }
  }
  return intentEventEmitterInstance;
}

/**
 * Singleton instance for backward compatibility and direct import.
 *
 * Prefer using getIntentEventEmitter() for consistency with other
 * event emitters in the codebase.
 */
export const intentEventEmitter = getIntentEventEmitter();

// ============================================================================
// Compatibility Exports for intent-routes.ts
// ============================================================================

/**
 * IntentRecord type alias for camelCase field naming convention.
 * Maps to IntentRecordPayload with camelCase fields.
 */
export interface IntentRecord {
  intentId: string;
  sessionRef: string;
  intentCategory: string;
  confidence: number;
  keywords: string[];
  createdAt: string;
}

/**
 * Convert IntentRecord (camelCase) to IntentRecordPayload (snake_case)
 */
function toSnakeCase(intent: IntentRecord): IntentRecordPayload {
  return {
    intent_id: intent.intentId,
    session_ref: intent.sessionRef,
    intent_category: intent.intentCategory,
    confidence: intent.confidence,
    keywords: intent.keywords,
    created_at: intent.createdAt,
  };
}

/**
 * Helper function to emit an intent update event.
 * Wrapper around intentEventEmitter.emitIntentStored() for convenience.
 *
 * @param intent - The intent record in camelCase format
 */
export function emitIntentUpdate(intent: IntentRecord): void {
  intentEventEmitter.emitIntentStored(toSnakeCase(intent));
}

/**
 * Intent distribution summary for compatibility with intent-routes.ts
 */
export interface IntentDistribution {
  distribution: Record<string, number>;
  total_intents: number;
  time_range_hours: number;
}

/**
 * Helper function to emit a distribution update event.
 * Wrapper around intentEventEmitter.emitDistributionUpdate() for convenience.
 *
 * @param distribution - The distribution summary
 */
export function emitIntentDistributionUpdate(distribution: IntentDistribution): void {
  // Convert Record<string, number> to IntentCategoryDistribution[]
  const total = distribution.total_intents;
  const categories: IntentCategoryDistribution[] = Object.entries(distribution.distribution).map(
    ([category, count]) => ({
      category,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    })
  );

  intentEventEmitter.emitDistributionUpdate(categories, total);
}
