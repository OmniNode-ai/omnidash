import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getWebSocketUrl } from '@/data-source';

// Channel → TanStack Query key prefix mapping.
// When the WebSocket bridge sends INVALIDATE for a channel, we invalidate
// the matching query so components re-fetch fresh projection data.
const CHANNEL_TO_QUERY_KEY: Record<string, string[]> = {
  'cost-trends': ['cost-trends'],
  'delegation-summary': ['delegation-summary'],
  'routing-decisions': ['routing-decisions'],
  'baselines-summary': ['baselines-summary'],
  'quality-summary': ['quality-summary'],
  'readiness-summary': ['readiness-summary'],
  'events-recent': ['events-recent'],
};

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * App-level hook. Opens a persistent WebSocket to the /ws bridge and
 * invalidates TanStack Query cache keys when the server emits INVALIDATE
 * messages (triggered by Kafka events arriving at the server).
 *
 * Mount this once inside Providers or App — not per-component.
 */
export function useWebSocketInvalidation() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      // Subscribe to all projection channels
      ws.send(JSON.stringify({ action: 'subscribe', channels: Object.keys(CHANNEL_TO_QUERY_KEY) }));
    };

    ws.onmessage = (e) => {
      try {
        // Validate the inbound frame at the I/O boundary rather than
        // casting straight from JSON.parse(). Anything we can't read
        // as { type: 'INVALIDATE', channel: string } is a malformed
        // frame and gets silently ignored — same observable behavior
        // as the previous catch-all but without the unsafe cast.
        const raw: unknown = JSON.parse(e.data as string);
        if (
          raw &&
          typeof raw === 'object' &&
          (raw as { type?: unknown }).type === 'INVALIDATE'
        ) {
          const channel = (raw as { channel?: unknown }).channel;
          if (typeof channel === 'string') {
            const keys = CHANNEL_TO_QUERY_KEY[channel];
            if (keys) {
              queryClient.invalidateQueries({ queryKey: keys });
            }
          }
        }
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      const delay = RECONNECT_DELAYS[Math.min(retryRef.current, RECONNECT_DELAYS.length - 1)];
      retryRef.current += 1;
      setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);
}
