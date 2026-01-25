/**
 * useIntentStream Hook
 *
 * Manages WebSocket connection for real-time intent classification updates.
 * Subscribes to intent topics and maintains in-memory state for intents
 * and distribution counts.
 *
 * Part of OMN-1458: Real-time Intent Dashboard Panel
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import type { IntentClassifiedEvent, IntentStoredEvent } from '@shared/intent-types';

/**
 * Generate a correlation ID for event deduplication.
 * crypto.randomUUID() is available in all modern browsers (Chrome 92+, Safari 15.4+, Firefox 95+).
 */
function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Default maximum number of intents to keep in memory.
 */
export const DEFAULT_MAX_INTENTS = 100;

/**
 * Multiplier for seenEventIds cleanup threshold.
 * When seenEventIds.size exceeds maxItems * this multiplier,
 * the Set is pruned to only contain IDs currently in the intents array.
 */
export const SEEN_EVENT_IDS_CLEANUP_MULTIPLIER = 5;

/**
 * Intent event types received from WebSocket
 */
export type IntentEventType =
  | 'INTENT_CLASSIFIED'
  | 'INTENT_STORED'
  | 'INTENT_DISTRIBUTION'
  | 'INTENT_SESSION'
  | 'INTENT_RECENT';

/**
 * Processed intent for display in the UI
 */
export interface ProcessedIntent {
  /** Unique identifier for deduplication */
  id: string;
  /** Session that generated this intent */
  sessionId: string;
  /** Classified category (e.g., "debugging", "code_generation") */
  category: string;
  /** Classification confidence score (0.0-1.0) */
  confidence: number;
  /** When the intent was classified */
  timestamp: Date;
  /** Correlation ID for tracing */
  correlationId: string;
  /** Raw event data for detail views */
  raw: IntentClassifiedEvent | IntentStoredEvent;
}

/**
 * Options for the useIntentStream hook
 */
export interface UseIntentStreamOptions {
  /**
   * Maximum number of intents to keep in memory
   * @default 100
   */
  maxItems?: number;

  /**
   * Whether to automatically connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Callback fired when a new intent is received
   */
  onIntent?: (intent: ProcessedIntent) => void;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Return type for the useIntentStream hook
 */
export interface UseIntentStreamReturn {
  /**
   * Recent intents (most recent first)
   */
  intents: ProcessedIntent[];

  /**
   * Intent category distribution counts
   */
  distribution: Record<string, number>;

  /**
   * Whether the WebSocket is connected
   */
  isConnected: boolean;

  /**
   * Connection error if any
   */
  error: Error | null;

  /**
   * Manually connect to WebSocket
   */
  connect: () => void;

  /**
   * Manually disconnect from WebSocket
   */
  disconnect: () => void;

  /**
   * Clear all intents and reset distribution
   */
  clearIntents: () => void;

  /**
   * Current connection status
   */
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';

  /**
   * Statistics about received intents
   */
  stats: {
    totalReceived: number;
    byCategory: Record<string, number>;
    lastEventTime: Date | null;
  };
}

/**
 * Hook for managing WebSocket connection to intent classification events.
 *
 * @example Basic usage
 * ```tsx
 * const { intents, distribution, isConnected } = useIntentStream();
 *
 * return (
 *   <div>
 *     <LiveIndicator isConnected={isConnected} />
 *     <PieChart data={distribution} />
 *     <ul>
 *       {intents.map(intent => (
 *         <li key={intent.id}>{intent.category} ({intent.confidence})</li>
 *       ))}
 *     </ul>
 *   </div>
 * );
 * ```
 *
 * @example With callback
 * ```tsx
 * const { intents } = useIntentStream({
 *   onIntent: (intent) => {
 *     console.log('New intent:', intent.category);
 *     playNotificationSound();
 *   }
 * });
 * ```
 */
export function useIntentStream(options: UseIntentStreamOptions = {}): UseIntentStreamReturn {
  const { maxItems = DEFAULT_MAX_INTENTS, autoConnect = true, onIntent, debug = false } = options;

  // State
  const [intents, setIntents] = useState<ProcessedIntent[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<UseIntentStreamReturn['stats']>({
    totalReceived: 0,
    byCategory: {},
    lastEventTime: null,
  });

  // Track if we've subscribed to avoid duplicate subscriptions
  const hasSubscribed = useRef(false);

  // Track seen event IDs to deduplicate events
  const seenEventIds = useRef(new Set<string>());

  // Track callback ref to avoid stale closures
  const onIntentRef = useRef(onIntent);
  useEffect(() => {
    onIntentRef.current = onIntent;
  }, [onIntent]);

  /**
   * Process an incoming WebSocket message into a ProcessedIntent
   */
  const processIntentEvent = useCallback(
    (
      eventData: IntentClassifiedEvent | IntentStoredEvent,
      eventType: string
    ): ProcessedIntent | null => {
      // Extract fields based on event type
      let id: string;
      let sessionId: string;
      let category: string;
      let confidence: number;
      let timestamp: string;
      let correlationId: string;

      if (eventType === 'INTENT_CLASSIFIED' || eventType === 'IntentClassified') {
        const classified = eventData as IntentClassifiedEvent;
        id = classified.correlation_id || generateCorrelationId();
        sessionId = classified.session_id || '';
        category = classified.intent_category || 'unknown';
        confidence = classified.confidence ?? 0;
        timestamp = classified.timestamp || new Date().toISOString();
        correlationId = classified.correlation_id || id;
      } else if (eventType === 'INTENT_STORED') {
        const stored = eventData as IntentStoredEvent;
        id = stored.intent_id || stored.correlation_id || generateCorrelationId();
        sessionId = stored.session_ref || '';
        category = stored.intent_category || 'unknown';
        confidence = stored.confidence ?? 0;
        timestamp = stored.stored_at || new Date().toISOString();
        correlationId = stored.correlation_id || id;
      } else {
        return null;
      }

      return {
        id,
        sessionId,
        category,
        confidence,
        timestamp: new Date(timestamp),
        correlationId,
        raw: eventData,
      };
    },
    []
  );

  /**
   * Handle incoming WebSocket messages.
   */
  const handleMessage = useCallback(
    (message: { type: string; data?: unknown; timestamp: string }) => {
      try {
        // Check if this is an intent event
        const intentEventTypes = ['INTENT_CLASSIFIED', 'IntentClassified', 'INTENT_STORED'];

        if (!intentEventTypes.includes(message.type)) {
          return;
        }

        const eventData = message.data as IntentClassifiedEvent | IntentStoredEvent | undefined;
        if (!eventData) {
          return;
        }

        // Process the event
        const processedIntent = processIntentEvent(eventData, message.type);
        if (!processedIntent) {
          return;
        }

        // Deduplicate events
        if (seenEventIds.current.has(processedIntent.id)) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.log('[IntentStream] Skipping duplicate event:', processedIntent.id);
          }
          return;
        }
        seenEventIds.current.add(processedIntent.id);

        if (debug) {
          // eslint-disable-next-line no-console
          console.log(
            '[IntentStream] Received intent:',
            processedIntent.category,
            processedIntent.confidence
          );
        }

        // Update intents array
        setIntents((prev) => {
          const updated = [processedIntent, ...prev].slice(0, maxItems);

          // Memory cleanup: prevent unbounded growth of seenEventIds
          if (seenEventIds.current.size > maxItems * SEEN_EVENT_IDS_CLEANUP_MULTIPLIER) {
            const currentIds = new Set(updated.map((i) => i.id));
            seenEventIds.current = currentIds;
          }

          return updated;
        });

        // Update distribution
        setDistribution((prev) => ({
          ...prev,
          [processedIntent.category]: (prev[processedIntent.category] || 0) + 1,
        }));

        // Update stats
        setStats((prev) => ({
          totalReceived: prev.totalReceived + 1,
          byCategory: {
            ...prev.byCategory,
            [processedIntent.category]: (prev.byCategory[processedIntent.category] || 0) + 1,
          },
          lastEventTime: new Date(),
        }));

        // Clear any previous error on successful event
        setError(null);

        // Call callback if provided
        onIntentRef.current?.(processedIntent);
      } catch (err) {
        if (debug) {
          console.error('[IntentStream] Error processing message:', err, message);
        }
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [debug, maxItems, processIntentEvent]
  );

  /**
   * Handle WebSocket errors
   */
  const handleError = useCallback(
    (event: Event) => {
      setError(new Error('WebSocket connection error'));
      if (debug) {
        console.error('[IntentStream] WebSocket error:', event);
      }
    },
    [debug]
  );

  // Use the base WebSocket hook
  const {
    isConnected,
    connectionStatus,
    error: wsError,
    subscribe,
    unsubscribe,
    reconnect,
  } = useWebSocket({
    onMessage: handleMessage,
    onError: handleError,
    debug,
  });

  // Subscribe to intent topics when connected
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    if (isConnected && !hasSubscribed.current) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[IntentStream] Subscribing to intent topics');
      }
      // Subscribe to both main intent topic and stored events
      subscribe(['intents', 'intents-stored']);
      hasSubscribed.current = true;
    }

    // Reset subscription flag when disconnected
    if (!isConnected) {
      hasSubscribed.current = false;
    }

    // Cleanup: unsubscribe when unmounting
    return () => {
      if (hasSubscribed.current && isConnected) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[IntentStream] Unsubscribing from intent topics');
        }
        unsubscribe(['intents', 'intents-stored']);
        hasSubscribed.current = false;
      }
    };
  }, [isConnected, autoConnect, subscribe, unsubscribe, debug]);

  /**
   * Clear all intents and reset state
   */
  const clearIntents = useCallback(() => {
    setIntents([]);
    setDistribution({});
    setStats({
      totalReceived: 0,
      byCategory: {},
      lastEventTime: null,
    });
    seenEventIds.current.clear();
    setError(null);
  }, []);

  /**
   * Manually trigger connection
   */
  const connect = useCallback(() => {
    reconnect();
  }, [reconnect]);

  /**
   * Disconnect is handled by the base hook on unmount.
   * This function clears state and resets subscription flag.
   */
  const disconnect = useCallback(() => {
    hasSubscribed.current = false;
    // Note: The actual WebSocket close is handled by useWebSocket cleanup
  }, []);

  // Combine errors from both this hook and the WebSocket hook
  const combinedError = error || (wsError ? new Error(wsError) : null);

  return {
    intents,
    distribution,
    isConnected,
    error: combinedError,
    connect,
    disconnect,
    clearIntents,
    connectionStatus,
    stats,
  };
}
