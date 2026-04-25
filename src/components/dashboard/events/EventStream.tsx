import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowUp, Search } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useTimezone } from '@/hooks/useTimezone';
import { Text } from '@/components/ui/typography';
import { getWebSocketUrl } from '@/data-source';

export interface StreamEvent {
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

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000];
const SCROLL_HEIGHT = 320;
const SCROLL_UP_THRESHOLD_PX = 40;

// ---------- Helpers ----------

/**
 * Compact timestamp for log rows. Shows HH:MM:SS for events within the
 * last 24h (the typical case in a live tail); falls back to MM/DD HH:MM
 * for older events so the date isn't lost. The title attribute on each
 * row exposes the full local string for developers debugging a specific
 * event.
 *
 * `timeZone` is the dashboard-level zone (`useTimezone()`); both the
 * MM/DD calendar parts and the HH:MM clock parts must come from the
 * same zone so they can never disagree at a day boundary.
 */
function formatEventTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ageMs = Date.now() - d.getTime();
  if (ageMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { timeZone, hour12: false });
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

/**
 * Deterministic hue per source string. Lets the source pill pick up a
 * stable color for each distinct source without a hardcoded map —
 * easier to scan a stream when `omnimarket` is always the same shade
 * and `omnibase` is always another.
 */
function hueForSource(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0; // force int32
  }
  return Math.abs(hash) % 360;
}

// ---------- WebSocket hook (unchanged semantics) ----------

function useEventWebSocket(onEvent: (e: StreamEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const ws = new WebSocket(getWebSocketUrl());
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
      } catch {
        /* ignore malformed frames */
      }
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

// ---------- Component ----------

export default function EventStream({ config }: { config: EventStreamConfig }) {
  const maxEvents = config.maxEvents ?? 200;
  const autoScroll = config.autoScroll ?? true;
  const tz = useTimezone();

  const { data: initialData, isLoading, error } = useProjectionQuery<StreamEvent>({
    topic: TOPICS.registration,
    queryKey: ['events-recent'],
  });

  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [seenIds] = useState(() => new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Search + paused-scroll state. `userScrolledUp` was previously a
  // ref, which meant the UI couldn't react to the paused state — no
  // "new events" indicator was possible. Lifted to React state.
  const [query, setQuery] = useState('');
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  // Length of the events array at the moment the user scrolled up. The
  // "N new events" counter is the difference between the current
  // length and this watermark, so it reflects arrivals *since* the
  // pause regardless of filtering.
  const [pausedAtLength, setPausedAtLength] = useState<number | null>(null);

  useEffect(() => {
    if (initialData) {
      setEvents(initialData.slice(0, maxEvents));
      initialData.forEach((e) => seenIds.add(e.id));
    }
  }, [initialData, maxEvents, seenIds]);

  const handleNewEvent = useCallback(
    (e: StreamEvent) => {
      if (seenIds.has(e.id)) return;
      seenIds.add(e.id);
      setEvents((prev) => {
        const next = [e, ...prev];
        return next.length > maxEvents ? next.slice(0, maxEvents) : next;
      });
    },
    [seenIds, maxEvents],
  );

  useEventWebSocket(handleNewEvent);

  // Auto-scroll — skip while the user has scrolled up so we don't
  // yank them back to the top mid-read.
  useEffect(() => {
    if (!autoScroll || userScrolledUp) return;
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [events.length, autoScroll, userScrolledUp]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isUp = el.scrollTop > SCROLL_UP_THRESHOLD_PX;
    if (isUp && !userScrolledUp) {
      setUserScrolledUp(true);
      setPausedAtLength(events.length);
    } else if (!isUp && userScrolledUp) {
      setUserScrolledUp(false);
      setPausedAtLength(null);
    }
  };

  const jumpToTop = () => {
    setUserScrolledUp(false);
    setPausedAtLength(null);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.event_type.toLowerCase().includes(q) ||
        ev.source.toLowerCase().includes(q) ||
        ev.correlation_id.toLowerCase().includes(q),
    );
  }, [events, query]);

  const newSincePause =
    pausedAtLength !== null ? Math.max(0, events.length - pausedAtLength) : 0;

  const isEmpty = events.length === 0 && !isLoading;
  const bufferFull = events.length >= maxEvents;

  // Shared grid template so header + rows stay column-aligned.
  const ROW_COLUMNS = '96px 1fr 140px';

  return (
    <ComponentWrapper
      title="Event Stream"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No events"
      emptyHint="Events appear as Kafka messages arrive"
      isLive
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Search input — filters event_type, source, correlation_id. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0.625rem',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--panel-2)',
          }}
        >
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter events…"
            aria-label="Filter event stream"
            className="text-input-md"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
            }}
          />
        </div>

        {/* Scroll region with sticky column header. */}
        <div style={{ position: 'relative' }}>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              height: SCROLL_HEIGHT,
              overflowY: 'auto',
              border: '1px solid var(--line-2)',
              borderRadius: 6,
              background: 'var(--panel)',
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'grid',
                gridTemplateColumns: ROW_COLUMNS,
                gap: '0.5rem',
                padding: '6px 10px',
                background: 'var(--panel-2)',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">Time</Text>
              <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">Event</Text>
              <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">Source</Text>
            </div>

            {filtered.map((ev) => {
              const hue = hueForSource(ev.source);
              const sourceColor = `hsl(${hue}, 40%, 55%)`;
              return (
                <div
                  key={ev.id}
                  data-testid="event-row"
                  title={`${ev.event_type}\nsource: ${ev.source}\ncorrelation: ${ev.correlation_id}\n${new Date(ev.timestamp).toLocaleString(undefined, { timeZone: tz })}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: ROW_COLUMNS,
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--line-2)',
                  }}
                >
                  <Text size="md" family="mono" color="tertiary" tabularNums>
                    {formatEventTime(ev.timestamp, tz)}
                  </Text>
                  <Text size="md" family="mono" truncate>
                    {ev.event_type}
                  </Text>
                  <Text
                    size="xs"
                    family="mono"
                    truncate
                    style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      borderRadius: 3,
                      border: `1px solid ${sourceColor}`,
                      color: sourceColor,
                      justifySelf: 'start',
                      maxWidth: '100%',
                    }}
                  >
                    {ev.source}
                  </Text>
                </div>
              );
            })}

            {filtered.length === 0 && events.length > 0 && (
              <div
                style={{
                  padding: '2rem 0.5rem',
                  textAlign: 'center',
                }}
              >
                <Text size="lg" color="tertiary">No events match "{query}"</Text>
              </div>
            )}
          </div>

          {/* Floating "N new events" button — shown when the user has
              scrolled up and events have arrived since then. Click to
              jump back to top and resume auto-scroll. */}
          {newSincePause > 0 && (
            <button
              type="button"
              onClick={jumpToTop}
              style={{
                position: 'absolute',
                top: 40,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '4px 10px',
                background: 'var(--brand-soft)',
                color: 'var(--brand-ink)',
                border: '1px solid var(--brand)',
                borderRadius: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <ArrowUp size={12} />
              <Text size="sm">{newSincePause} new {newSincePause === 1 ? 'event' : 'events'}</Text>
            </button>
          )}
        </div>

        {/* Status row — buffer usage + search-filter info. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text size="sm" family="mono" color="secondary">
            {filtered.length === events.length
              ? `${events.length} / ${maxEvents}`
              : `${filtered.length} shown · ${events.length} / ${maxEvents} buffered`}
            {bufferFull && <Text size="sm" family="mono" color="tertiary"> · buffer full</Text>}
          </Text>
          {userScrolledUp && (
            <Text size="sm" family="mono" color="tertiary">auto-scroll paused</Text>
          )}
        </div>
      </div>
    </ComponentWrapper>
  );
}
