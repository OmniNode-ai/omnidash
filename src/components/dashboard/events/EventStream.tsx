import { useState, useEffect, useRef, useCallback } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useThemeColors } from '@/theme';

interface StreamEvent {
  id: string;
  event_type: string;
  source: string;
  correlation_id: string;
  timestamp: string;
}

interface EventStreamConfig {
  maxEvents?: number;
  autoScroll?: boolean;
}

const WS_URL = 'ws://localhost:3002/ws';
const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000];

function useEventWebSocket(onEvent: (e: StreamEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'event-bus' }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'event' && msg.topic === 'event-bus' && msg.data) {
          onEvent(msg.data as StreamEvent);
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
  }, [onEvent]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);
}

export default function EventStream({ config }: { config: EventStreamConfig }) {
  const maxEvents = config.maxEvents ?? 200;
  const autoScroll = config.autoScroll ?? true;

  const { data: initialData, isLoading, error } = useProjectionQuery<StreamEvent>({
    topic: 'onex.snapshot.projection.registration.v1',
    queryKey: ['events-recent'],
  });

  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [seenIds] = useState(() => new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    if (initialData) {
      setEvents(initialData.slice(0, maxEvents));
      initialData.forEach((e) => seenIds.add(e.id));
    }
  }, [initialData, maxEvents, seenIds]);

  const handleNewEvent = useCallback((e: StreamEvent) => {
    if (seenIds.has(e.id)) return;
    seenIds.add(e.id);
    setEvents((prev) => {
      const next = [e, ...prev];
      return next.length > maxEvents ? next.slice(0, maxEvents) : next;
    });
  }, [seenIds, maxEvents]);

  useEventWebSocket(handleNewEvent);

  useEffect(() => {
    if (!autoScroll || userScrolledUp.current) return;
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [events.length, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledUp.current = el.scrollTop > 40;
  };

  const colors = useThemeColors();
  const isEmpty = events.length === 0 && !isLoading;

  return (
    <ComponentWrapper
      title="Event Stream"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No events"
      emptyHint="Events appear as Kafka messages arrive"
    >
      <div ref={scrollRef} onScroll={handleScroll} style={{ height: '100%', overflowY: 'auto' }}>
        {events.map((ev) => (
          <div
            key={ev.id}
            data-testid="event-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr auto',
              gap: '0.5rem',
              padding: '0.25rem 0',
              borderBottom: `1px solid hsl(${colors.border})`,
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: colors.muted }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
            <span style={{ color: colors.foreground, fontFamily: 'monospace' }}>{ev.event_type}</span>
            <span style={{ color: colors.muted }}>{ev.source}</span>
          </div>
        ))}
      </div>
    </ComponentWrapper>
  );
}
