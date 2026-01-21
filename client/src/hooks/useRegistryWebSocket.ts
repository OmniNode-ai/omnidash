/**
 * useRegistryWebSocket Hook
 *
 * Manages WebSocket connection for registry discovery real-time updates.
 * Automatically subscribes to registry topics and invalidates queries
 * when relevant events are received.
 *
 * Part of OMN-1278: Contract-Driven Dashboard - Registry Discovery (Phase 4)
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

/**
 * Generate a UUID with fallback for non-secure contexts (HTTP).
 * crypto.randomUUID() may not be available in non-HTTPS environments.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator using Math.random()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Default maximum number of recent events to keep in memory.
 * Used as the default value for the maxRecentEvents option.
 */
export const DEFAULT_MAX_RECENT_EVENTS = 50;

/**
 * Maximum number of seen event IDs to track for deduplication.
 * Should be larger than DEFAULT_MAX_RECENT_EVENTS to handle burst scenarios.
 */
export const MAX_SEEN_EVENT_IDS = 100;

/**
 * Registry event types as defined in the WebSocket Event Spec v1.2
 *
 * BOUNDED SET: This union type defines exactly 7 known event types.
 * The eventsByType stats object is bounded by this finite set, preventing
 * memory leaks in long-running sessions. Only events matching these types
 * are processed and counted.
 */
export type RegistryEventType =
  | 'NODE_REGISTERED'
  | 'NODE_STATE_CHANGED'
  | 'NODE_HEARTBEAT'
  | 'NODE_DEREGISTERED'
  | 'INSTANCE_HEALTH_CHANGED'
  | 'INSTANCE_ADDED'
  | 'INSTANCE_REMOVED';

/**
 * Registry event structure received from WebSocket
 */
export interface RegistryEvent {
  type: RegistryEventType;
  timestamp: string;
  correlation_id: string;
  payload: Record<string, unknown>;
}

/**
 * Recent event for display in the event feed
 */
export interface RecentRegistryEvent {
  id: string;
  type: RegistryEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
  correlationId: string;
}

/**
 * Options for the useRegistryWebSocket hook
 */
export interface UseRegistryWebSocketOptions {
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Maximum number of recent events to keep in memory
   * @default 50
   */
  maxRecentEvents?: number;

  /**
   * Whether to automatically subscribe when connected
   * @default true
   */
  autoSubscribe?: boolean;

  /**
   * Callback fired when a registry event is received
   */
  onEvent?: (event: RegistryEvent) => void;
}

/**
 * Return type for the useRegistryWebSocket hook
 */
export interface UseRegistryWebSocketReturn {
  /**
   * Whether the WebSocket is connected
   */
  isConnected: boolean;

  /**
   * Current connection status
   */
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';

  /**
   * Connection error message if any
   */
  error: string | null;

  /**
   * Recent registry events (most recent first)
   */
  recentEvents: RecentRegistryEvent[];

  /**
   * Clear all recent events
   */
  clearEvents: () => void;

  /**
   * Manually reconnect the WebSocket
   */
  reconnect: () => void;

  /**
   * Statistics about received events
   */
  stats: {
    totalEventsReceived: number;
    eventsByType: Record<RegistryEventType, number>;
    lastEventTime: Date | null;
  };
}

/**
 * Hook for managing WebSocket connection to registry discovery events.
 *
 * @example Basic usage
 * ```tsx
 * const { isConnected, recentEvents } = useRegistryWebSocket();
 *
 * return (
 *   <div>
 *     <LiveIndicator isConnected={isConnected} />
 *     <ul>
 *       {recentEvents.map(event => (
 *         <li key={event.id}>{event.type}</li>
 *       ))}
 *     </ul>
 *   </div>
 * );
 * ```
 *
 * @example With event callback
 * ```tsx
 * const { isConnected } = useRegistryWebSocket({
 *   onEvent: (event) => {
 *     console.log('Received event:', event);
 *   }
 * });
 * ```
 */
export function useRegistryWebSocket(
  options: UseRegistryWebSocketOptions = {}
): UseRegistryWebSocketReturn {
  const {
    debug = false,
    maxRecentEvents = DEFAULT_MAX_RECENT_EVENTS,
    autoSubscribe = true,
    onEvent,
  } = options;

  const queryClient = useQueryClient();
  const [recentEvents, setRecentEvents] = useState<RecentRegistryEvent[]>([]);
  const [stats, setStats] = useState<UseRegistryWebSocketReturn['stats']>({
    totalEventsReceived: 0,
    eventsByType: {} as Record<RegistryEventType, number>,
    lastEventTime: null,
  });

  // Track if we've subscribed to avoid duplicate subscriptions
  const hasSubscribed = useRef(false);

  // Track seen event IDs to deduplicate events (server may send same event on multiple topics)
  const seenEventIds = useRef(new Set<string>());

  // Track callback ref to avoid stale closures
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  /**
   * Handle incoming WebSocket messages.
   *
   * Wrapped in try-catch to prevent malformed events from crashing the component.
   * WebSocket messages from external sources may have unexpected structure,
   * invalid timestamps, or missing fields that could cause runtime errors.
   */
  const handleMessage = useCallback(
    (message: { type: string; data?: RegistryEvent; timestamp: string }) => {
      try {
        // Check if this is a registry event
        const registryEventTypes: RegistryEventType[] = [
          'NODE_REGISTERED',
          'NODE_STATE_CHANGED',
          'NODE_HEARTBEAT',
          'NODE_DEREGISTERED',
          'INSTANCE_HEALTH_CHANGED',
          'INSTANCE_ADDED',
          'INSTANCE_REMOVED',
        ];

        if (!registryEventTypes.includes(message.type as RegistryEventType)) {
          return;
        }

        const eventType = message.type as RegistryEventType;
        const eventData = message.data as RegistryEvent | undefined;

        // Create the event object
        const event: RegistryEvent = eventData || {
          type: eventType,
          timestamp: message.timestamp,
          correlation_id: generateUUID(),
          payload: {},
        };

        // Deduplicate events - server may broadcast same event on multiple topics
        // (e.g., 'registry' and 'registry-nodes' both receive NODE_* events)
        const correlationId = event.correlation_id;
        if (correlationId && seenEventIds.current.has(correlationId)) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.log('[RegistryWebSocket] Skipping duplicate event:', correlationId);
          }
          return;
        }
        if (correlationId) {
          seenEventIds.current.add(correlationId);
          // Prevent memory leak: keep only last MAX_SEEN_EVENT_IDS IDs
          if (seenEventIds.current.size > MAX_SEEN_EVENT_IDS) {
            const idsToRemove = Array.from(seenEventIds.current).slice(
              0,
              seenEventIds.current.size - maxRecentEvents
            );
            idsToRemove.forEach((id) => seenEventIds.current.delete(id));
          }
        }

        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[RegistryWebSocket] Received event:', eventType, eventData);
        }

        // Update recent events
        setRecentEvents((prev) => {
          const newEvent: RecentRegistryEvent = {
            id: event.correlation_id || generateUUID(),
            type: event.type,
            timestamp: new Date(event.timestamp),
            payload: event.payload,
            correlationId: event.correlation_id,
          };

          const updated = [newEvent, ...prev].slice(0, maxRecentEvents);
          return updated;
        });

        // Update stats
        // NOTE: eventsByType is bounded to max 7 keys (one per RegistryEventType).
        // This prevents memory leaks in long-running sessions since only events
        // passing the registryEventTypes.includes() check above reach this point.
        setStats((prev) => ({
          totalEventsReceived: prev.totalEventsReceived + 1,
          eventsByType: {
            ...prev.eventsByType,
            [eventType]: (prev.eventsByType[eventType] || 0) + 1,
          },
          lastEventTime: new Date(),
        }));

        // Call event callback if provided
        onEventRef.current?.(event);

        // Invalidate relevant queries based on event type
        switch (eventType) {
          case 'NODE_REGISTERED':
          case 'NODE_STATE_CHANGED':
          case 'NODE_DEREGISTERED':
            // Node-level changes - full refetch
            queryClient.invalidateQueries({ queryKey: ['registry-discovery'] });
            break;

          case 'INSTANCE_HEALTH_CHANGED':
          case 'INSTANCE_ADDED':
          case 'INSTANCE_REMOVED':
            // Instance-level changes - full refetch
            queryClient.invalidateQueries({ queryKey: ['registry-discovery'] });
            break;

          case 'NODE_HEARTBEAT':
            // Heartbeats are frequent and don't change data structure
            // Only update if we want to show "last seen" timestamps
            // For now, we don't trigger a full refetch for heartbeats
            break;
        }
      } catch (err) {
        // Log error in debug mode but don't propagate - component should remain stable
        if (debug) {
          console.error('[RegistryWebSocket] Error processing message:', err, message);
        }
      }
    },
    [debug, maxRecentEvents, queryClient]
  );

  const { isConnected, connectionStatus, error, subscribe, unsubscribe, reconnect } = useWebSocket({
    onMessage: handleMessage,
    debug,
  });

  // Subscribe to registry topics when connected
  useEffect(() => {
    if (isConnected && autoSubscribe && !hasSubscribed.current) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[RegistryWebSocket] Subscribing to registry topics');
      }
      subscribe(['registry']);
      hasSubscribed.current = true;
    }

    // Reset subscription flag when disconnected
    if (!isConnected) {
      hasSubscribed.current = false;
    }

    // Cleanup: unsubscribe when unmounting or when autoSubscribe changes
    return () => {
      if (hasSubscribed.current && isConnected) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[RegistryWebSocket] Unsubscribing from registry topics');
        }
        unsubscribe(['registry']);
        hasSubscribed.current = false;
      }
    };
  }, [isConnected, autoSubscribe, subscribe, unsubscribe, debug]);

  /**
   * Clear all recent events and reset stats.
   * This provides a manual reset mechanism for long-running sessions,
   * though eventsByType is already bounded to 7 keys (one per RegistryEventType).
   */
  const clearEvents = useCallback(() => {
    setRecentEvents([]);
    // Reset all stats including eventsByType counts
    setStats({
      totalEventsReceived: 0,
      eventsByType: {} as Record<RegistryEventType, number>,
      lastEventTime: null,
    });
    // Also clear seen event IDs to allow re-processing if needed
    seenEventIds.current.clear();
  }, []);

  return {
    isConnected,
    connectionStatus,
    error,
    recentEvents,
    clearEvents,
    reconnect,
    stats,
  };
}
