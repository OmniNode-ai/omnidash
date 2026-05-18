import { useEffect, useRef } from 'react';
import { Text } from '@/components/ui/typography';

export interface PipelineEvent {
  id: string;
  type: 'request' | 'validation' | 'success' | 'error';
  timestamp: string;
  source: string;
  message: string;
  correlationId: string;
}

const TYPE_COLORS: Record<PipelineEvent['type'], string> = {
  request: 'var(--accent)',
  validation: 'var(--status-warn)',
  success: 'var(--status-ok)',
  error: 'var(--status-bad)',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function PipelineLogStream({ events }: { events: PipelineEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length]);

  return (
    <div
      style={{
        background: 'var(--bg-sunken)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: 0,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {events.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <Text size="md" color="tertiary">
            Waiting for pipeline events...
          </Text>
        </div>
      ) : (
        events.map((evt) => (
          <div
            key={evt.id}
            data-testid="pipeline-log-entry"
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 80px 1fr',
              gap: 10,
              padding: '6px 12px',
              borderLeft: `3px solid ${TYPE_COLORS[evt.type] ?? 'var(--line)'}`,
              borderBottom: '1px solid var(--line-2)',
            }}
          >
            <Text size="xs" color="tertiary" className="mono">
              {formatTime(evt.timestamp)}
            </Text>
            <Text
              size="xs"
              weight="bold"
              className="mono text-tracked text-upper"
              style={{ color: TYPE_COLORS[evt.type] }}
            >
              {evt.type}
            </Text>
            <Text size="sm" color="secondary">
              {evt.message}
            </Text>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
