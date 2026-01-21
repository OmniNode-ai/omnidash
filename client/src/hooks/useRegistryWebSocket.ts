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
 * Registry event types as defined in the WebSocket Event Spec v1.2
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
  const { debug = false, maxRecentEvents = 50, autoSubscribe = true, onEvent } = options;

  const queryClient = useQueryClient();
  const [recentEvents, setRecentEvents] = useState<RecentRegistryEvent[]>([]);
  const [stats, setStats] = useState<UseRegistryWebSocketReturn['stats']>({
    totalEventsReceived: 0,
    eventsByType: {} as Record<RegistryEventType, number>,
    lastEventTime: null,
  });

  // Track if we've subscribed to avoid duplicate subscriptions
  const hasSubscribed = useRef(false);

  // Track callback ref to avoid stale closures
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback(
    (message: { type: string; data?: RegistryEvent; timestamp: string }) => {
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

      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[RegistryWebSocket] Received event:', eventType, eventData);
      }

      // Create the event object
      const event: RegistryEvent = eventData || {
        type: eventType,
        timestamp: message.timestamp,
        correlation_id: crypto.randomUUID(),
        payload: {},
      };

      // Update recent events
      setRecentEvents((prev) => {
        const newEvent: RecentRegistryEvent = {
          id: event.correlation_id || crypto.randomUUID(),
          type: event.type,
          timestamp: new Date(event.timestamp),
          payload: event.payload,
          correlationId: event.correlation_id,
        };

        const updated = [newEvent, ...prev].slice(0, maxRecentEvents);
        return updated;
      });

      // Update stats
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
    },
    [debug, maxRecentEvents, queryClient]
  );

  const { isConnected, connectionStatus, error, subscribe, reconnect } = useWebSocket({
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
  }, [isConnected, autoSubscribe, subscribe, debug]);

  /**
   * Clear all recent events
   */
  const clearEvents = useCallback(() => {
    setRecentEvents([]);
    setStats({
      totalEventsReceived: 0,
      eventsByType: {} as Record<RegistryEventType, number>,
      lastEventTime: null,
    });
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
