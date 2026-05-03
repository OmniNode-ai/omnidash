import { useState, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  topic: string;
  summary: string;
  payload: string;
}

const MAX_EVENTS = 100;

const TYPE_COLORS: Record<string, string> = {
  ROUTING: '#3b82f6',
  ACTION: '#22c55e',
  TRANSFORMATION: '#a855f7',
  ERROR: '#ef4444',
};

function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? '#6b7280';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function EventRow({ event }: { event: LiveEvent }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = colorForType(event.type);

  return (
    <div
      data-testid="live-event-row"
      style={{
        borderLeft: `3px solid ${typeColor}`,
        borderBottom: '1px solid var(--line-2)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Timestamp */}
        <Text size="md" family="mono" tabularNums color="tertiary" style={{ flexShrink: 0 }}>
          {formatTimestamp(event.timestamp)}
        </Text>

        {/* Type badge */}
        <Text
          size="xs"
          weight="semibold"
          style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: 4,
            background: typeColor,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {event.type}
        </Text>

        {/* Summary */}
        <Text size="md" truncate style={{ flex: 1 }}>
          {event.summary}
        </Text>

        {/* Expand indicator */}
        <Text size="sm" color="tertiary" style={{ flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </Text>
      </button>

      {expanded && (
        <div
          style={{
            padding: '8px 12px 12px 42px',
            borderTop: '1px solid var(--line-2)',
            background: 'var(--panel-2)',
          }}
        >
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            <div>
              <Text size="xs" weight="semibold" color="secondary" transform="uppercase">Source</Text>
              <Text as="div" size="md" family="mono">{event.source}</Text>
            </div>
            <div>
              <Text size="xs" weight="semibold" color="secondary" transform="uppercase">Topic</Text>
              <Text as="div" size="md" family="mono" truncate>{event.topic}</Text>
            </div>
          </div>
          {event.payload && (
            <div>
              <Text as="div" size="xs" weight="semibold" color="secondary" transform="uppercase" style={{ marginBottom: 4 }}>
                Payload
              </Text>
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  borderRadius: 4,
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                <Text as="span" size="sm" family="mono" color="secondary">
                  {tryFormatJson(event.payload)}
                </Text>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveEventStreamWidget() {
  const { data, isLoading, error } = useProjectionQuery<LiveEvent>({
    topic: TOPICS.liveEvents,
    queryKey: ['live-event-stream'],
    refetchInterval: 10_000,
  });

  const events = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sorted.slice(0, MAX_EVENTS);
  }, [data]);

  const isEmpty = events.length === 0 && !isLoading;

  return (
    <ComponentWrapper
      title="Live Event Stream"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No live events"
      emptyHint="Events appear when the system is actively processing"
      isLive
    >
      <div
        style={{
          maxHeight: 400,
          overflowY: 'auto',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          background: 'var(--panel)',
        }}
      >
        {events.map((ev) => (
          <EventRow key={ev.id} event={ev} />
        ))}
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <Text size="sm" family="mono" color="secondary">
          {events.length} / {MAX_EVENTS} events
        </Text>
        <Text size="sm" family="mono" color="tertiary">
          refreshing every 10s
        </Text>
      </div>
    </ComponentWrapper>
  );
}
