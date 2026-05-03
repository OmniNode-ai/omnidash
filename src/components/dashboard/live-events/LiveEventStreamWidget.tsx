/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useState, useMemo, useEffect } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { NodePill, CardHeader } from '@/components/primitives';
import type { NodeKind } from '@/components/primitives';

// ── Data type ───────────────────────────────────────────────────────

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  topic: string;
  summary: string;
  payload: string;
}

interface SyntheticEvent {
  id: string;
  type: string;
  node: string;
  topic: string;
  text: string;
  t: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function nodeKindForType(node: string): NodeKind {
  if (node === 'orchestrator') return 'orchestrator';
  if (node === 'compute') return 'compute';
  if (node === 'effect') return 'effect';
  if (node === 'reducer') return 'reducer';
  return 'cmd';
}

const TYPE_TO_NODE: Record<string, string> = {
  ROUTING: 'orchestrator',
  ACTION: 'effect',
  TRANSFORMATION: 'compute',
  ERROR: 'cmd',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── Bus column header ───────────────────────────────────────────────

function BusHeader({ template }: { template: string }) {
  const labels = [
    { text: 'TIME', align: 'left' as const },
    { text: 'NODE', align: 'left' as const },
    { text: 'TOPIC', align: 'left' as const },
    { text: 'DETAIL', align: 'left' as const },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: template,
        gap: 12,
        padding: '6px 12px',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        marginBottom: 6,
      }}
    >
      {labels.map((col) => (
        <div
          key={col.text}
          className="mono"
          style={{
            "fontSize": 9,
            "fontWeight": 700,
            "color": 'var(--ink-3)',
            "letterSpacing": '0.16em',
            "textTransform": 'uppercase',
            textAlign: col.align,
          }}
        >
          {col.text}
        </div>
      ))}
    </div>
  );
}

// ── Main widget (Bold variant) ──────────────────────────────────────

export default function LiveEventStreamWidget() {
  const { data, isLoading, error } = useProjectionQuery<LiveEvent>({
    topic: TOPICS.liveEvents,
    queryKey: ['live-event-stream'],
    refetchInterval: 10_000,
  });

  // Convert projection data to display format.
  const projectionEvents: SyntheticEvent[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)
      .map((ev) => ({
        id: ev.id,
        type: ev.type,
        node: TYPE_TO_NODE[ev.type] ?? 'reducer',
        topic: ev.topic,
        text: ev.summary,
        t: formatTimestamp(ev.timestamp),
      }));
  }, [data]);

  const events = projectionEvents;

  // Heartbeat strip
  const [pulses, setPulses] = useState<number[]>(() => Array(60).fill(0));
  useEffect(() => {
    setPulses((p) => [Math.random() * 0.8 + 0.2, ...p].slice(0, 60));
  }, [events.length]);

  return (
    <ComponentWrapper
      title="Live Event Stream"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={events.length === 0}
      emptyMessage="No live events"
      emptyHint="Live event rows appear after event bus projections are written"
      isLive
      headerExtra={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ "fontSize": 10, "color": 'var(--ink-3)' }}>{events.length} evt/min</span>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--good)', boxShadow: '0 0 0 3px rgba(21,128,61,.18)' }} />
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
        {/* CardHeader */}
        <CardHeader
          eyebrow="Live event bus · bold"
          title="onex.evt · onex.cmd"
        />

        {/* Heartbeat strip */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36, marginBottom: 14, padding: 8, background: 'var(--bg-sunken)', borderRadius: 6 }}>
          {pulses.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(4, v * 100)}%`,
                background: i === 0 ? 'var(--accent)' : 'var(--accent-soft)',
                borderRadius: 1,
                transition: 'height .2s ease-out',
              }}
            />
          ))}
        </div>

        {/* Column headers */}
        <BusHeader template="76px 96px 200px 1fr" />

        {/* Event rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.slice(0, 8).map((e, i) => {
            const kind = nodeKindForType(e.node);
            const isNewest = i === 0;
            return (
              <div
                key={e.id}
                data-testid="live-event-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '76px 96px 200px 1fr',
                  gap: 12,
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderLeft: `3px solid ${isNewest ? 'var(--accent)' : 'transparent'}`,
                  background: isNewest ? 'var(--accent-soft)' : 'transparent',
                  animation: isNewest ? 'od-slidein .3s ease-out' : 'none',
                  borderRadius: 4,
                }}
              >
                <span className="mono" style={{ "fontSize": 10, "color": 'var(--ink-3)' }}>
                  {e.t.slice(0, 8)}
                </span>
                <NodePill kind={kind}>{e.type}</NodePill>
                <span className="mono" style={{ "fontSize": 11, color: 'var(--accent-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.topic}
                </span>
                <span style={{ "fontSize": 11, "color": 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ComponentWrapper>
  );
}
