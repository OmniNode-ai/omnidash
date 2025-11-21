// client/src/lib/useWebSocket.ts
import { useEffect, useState, useRef, useCallback } from 'react';

interface WebSocketMessage {
  topic: string;
  event: any;
  timestamp: string;
}

interface UseWebSocketReturn {
  messages: WebSocketMessage[];
  lastMessage: WebSocketMessage | null;
  connected: boolean;
  error: Error | null;
  sendMessage: (message: any) => void;
}

export function useWebSocket(
  url: string = `ws://${window.location.hostname}:${window.location.port || 5000}/ws`
): UseWebSocketReturn {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          // Ignore connection acknowledgment messages
          if ((message as any).type === 'connected') {
            return;
          }

          setLastMessage(message);
          setMessages((prev) => [...prev.slice(-99), message]); // Keep last 100 messages
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);

        // Attempt reconnection after 5 seconds (only if component is still mounted)
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket connection error'));
        setConnected(false);
      };
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError(err as Error);
    }
  }, [url]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount - prevent reconnection
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    messages,
    lastMessage,
    connected,
    error,
    sendMessage,
  };
}

// Topic-specific hook for filtering messages by topic
export function useWebSocketTopic(topic: string): {
  messages: any[];
  lastMessage: any | null;
  connected: boolean;
} {
  const { messages, lastMessage, connected } = useWebSocket();

  const filteredMessages = messages.filter((msg) => msg.topic === topic).map((msg) => msg.event);

  const filteredLastMessage = lastMessage?.topic === topic ? lastMessage.event : null;

  return {
    messages: filteredMessages,
    lastMessage: filteredLastMessage,
    connected,
  };
}
