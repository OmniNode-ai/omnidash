import { useEffect, useState, useRef, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  timestamp: string;
}

interface UseWebSocketOptions {
  url?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  debug?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: string | null;
  send: (message: any) => void;
  subscribe: (topics: string[]) => void;
  unsubscribe: (topics: string[]) => void;
  reconnect: () => void;
}

/**
 * Custom hook for managing WebSocket connections with automatic reconnection
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection status tracking
 * - Type-safe message handling
 * - Subscription management
 * - Debug logging
 *
 * @example
 * ```tsx
 * const { isConnected, connectionStatus, subscribe } = useWebSocket({
 *   onMessage: (msg) => {
 *     if (msg.type === 'AGENT_METRIC_UPDATE') {
 *       queryClient.invalidateQueries(['/api/intelligence/agents/summary']);
 *     }
 *   }
 * });
 *
 * // Subscribe to specific event types
 * useEffect(() => {
 *   subscribe(['metrics', 'actions']);
 * }, []);
 * ```
 */
export function useWebSocket({
  url,
  onMessage,
  onError,
  onOpen,
  onClose,
  reconnectInterval = 5000,
  reconnectAttempts = 10,
  debug = false,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Stabilization: Track connection state changes to prevent flickering
  const disconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const stableConnectionRef = useRef(false);
  const connectionTimestampRef = useRef<number>(0);

  // Use refs for callbacks to avoid reconnection on every render
  // This prevents the "WebSocket is closed before connection is established" error
  // when callbacks are defined inline in the component
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  // Update refs when callbacks change (without triggering reconnection)
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Default to current host with /ws path
  const wsUrl =
    url || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  const log = useCallback(
    (...args: any[]) => {
      if (debug) {
        // Debug logging - intentionally using console.log for development debugging
        // eslint-disable-next-line no-console
        console.log('[WebSocket]', ...args);
      }
    },
    [debug]
  );

  const send = useCallback(
    (message: any) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
        log('Sent message:', message);
      } else {
        console.warn('[WebSocket] Cannot send message - WebSocket not connected');
      }
    },
    [log]
  );

  const subscribe = useCallback(
    (topics: string[]) => {
      send({ action: 'subscribe', topics });
    },
    [send]
  );

  const unsubscribe = useCallback(
    (topics: string[]) => {
      send({ action: 'unsubscribe', topics });
    },
    [send]
  );

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectCountRef.current = 0;
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      log('Connecting to', wsUrl);
      setConnectionStatus('connecting');
      setError(null);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;

        log('WebSocket connected');

        // Clear any pending disconnect timeout
        if (disconnectTimeoutRef.current) {
          clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = undefined;
        }

        // Mark connection as stable after 2 seconds of being connected
        connectionTimestampRef.current = Date.now();
        const stabilizationDelay = setTimeout(() => {
          if (mountedRef.current) {
            stableConnectionRef.current = true;
            log('Connection stabilized');
          }
        }, 2000);

        setIsConnected(true);
        setConnectionStatus('connected');
        setError(null);
        reconnectCountRef.current = 0;

        onOpenRef.current?.();

        // Clean up stabilization timeout
        return () => clearTimeout(stabilizationDelay);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          log('Received message:', message.type);

          onMessageRef.current?.(message);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
          setError('Failed to parse message');
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;

        console.error('[WebSocket] Connection error:', event);
        setConnectionStatus('error');
        setError('Connection error');

        onErrorRef.current?.(event);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        const wasStable = stableConnectionRef.current;
        const connectionDuration = Date.now() - connectionTimestampRef.current;

        log(`WebSocket disconnected (was stable: ${wasStable}, duration: ${connectionDuration}ms)`);

        // Reset stable flag
        stableConnectionRef.current = false;

        // If connection was very brief (<1s), it's likely a connection issue
        // Don't show disconnected immediately - wait 3 seconds to avoid flickering
        const isTransientDisconnect = connectionDuration < 1000 || !wasStable;
        const disconnectDelay = isTransientDisconnect ? 3000 : 0;

        if (disconnectDelay > 0) {
          log(`Delaying disconnect UI update for ${disconnectDelay}ms to prevent flickering`);
          disconnectTimeoutRef.current = setTimeout(() => {
            if (
              !mountedRef.current ||
              !wsRef.current ||
              wsRef.current.readyState !== WebSocket.OPEN
            ) {
              setIsConnected(false);
              setConnectionStatus('disconnected');
            }
          }, disconnectDelay);
        } else {
          setIsConnected(false);
          setConnectionStatus('disconnected');
        }

        onCloseRef.current?.();

        // Attempt reconnection with exponential backoff
        if (reconnectCountRef.current < reconnectAttempts) {
          const delay = Math.min(
            reconnectInterval * Math.pow(1.5, reconnectCountRef.current),
            30000 // Max 30 seconds
          );

          log(
            `Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current + 1}/${reconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectCountRef.current++;
            connect();
          }, delay);
        } else {
          setError(`Failed to reconnect after ${reconnectAttempts} attempts`);
          setConnectionStatus('error');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConnectionStatus('error');
    }
  }, [wsUrl, reconnectInterval, reconnectAttempts, log]);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected,
    connectionStatus,
    error,
    send,
    subscribe,
    unsubscribe,
    reconnect,
  };
}
