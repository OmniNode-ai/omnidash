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

// ── Synthetic event templates ───────────────────────────────────────

const EVENT_TEMPLATES = [
  { type: 'cmd', node: 'orchestrator', topic: 'onex.cmd.omnimarket.route.v3', text: 'build_loop · ticket-4471 → market' },
  { type: 'classify', node: 'compute', topic: 'onex.evt.omniintelligence.classified.v2', text: 'intent=code_generation · conf 0.94' },
  { type: 'route', node: 'effect', topic: 'onex.evt.omnimarket.routed.v3', text: '→ qwen3-coder-30b · $0.000' },
  { type: 'receipt', node: 'reducer', topic: 'onex.evt.receipts.signed.v1', text: 'verifier=deepseek-r1-32b · ok' },
  { type: 'merge', node: 'effect', topic: 'onex.cmd.github.merge.v1', text: 'PR #4471 merged · 47 gates green' },
  { type: 'projection', node: 'reducer', topic: 'onex.evt.projection.updated.v1', text: 'cost_by_model · +1 row' },
  { type: 'cmd', node: 'orchestrator', topic: 'onex.cmd.omnimarket.route.v3', text: 'merge_sweep · 3 PRs queued' },
  { type: 'classify', node: 'compute', topic: 'onex.evt.omniintelligence.classified.v2', text: 'intent=debugging · conf 0.81' },
  { type: 'route', node: 'effect', topic: 'onex.evt.omnimarket.routed.v3', text: '→ deepseek-r1-32b · $0.000' },
  { type: 'guard', node: 'compute', topic: 'onex.evt.immune.flagged.v1', text: 'verifier == worker · REJECTED' },
  { type: 'receipt', node: 'reducer', topic: 'onex.evt.receipts.signed.v1', text: '12 artifacts hash-bound · ok' },
  { type: 'route', node: 'effect', topic: 'onex.evt.omnimarket.routed.v3', text: '→ claude-sonnet-4-5 · $0.118' },
];

interface SyntheticEvent {
  id: string;
  type: string;
  node: string;
  topic: string;
  text: string;
  t: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function nowStamp(offset = 0): string {
  const d = new Date(Date.now() - offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

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

// ── Live events hook (synthetic) ────────────────────────────────────

function useLiveEvents({ max = 12, baseInterval = 1100 } = {}): SyntheticEvent[] {
  const [events, setEvents] = useState<SyntheticEvent[]>(() =>
    EVENT_TEMPLATES.slice(0, 8).map((e, i) => ({
      ...e,
      id: 'seed-' + i,
      t: nowStamp((8 - i) * 900),
    })),
  );

  useEffect(() => {
    let cancelled = false;
    let counter = 0;
    const tick = () => {
      if (cancelled) return;
      const e = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
      setEvents((prev) =>
        [{ ...e, id: 'e-' + (++counter) + '-' + Math.random(), t: nowStamp() }, ...prev].slice(0, max),
      );
      setTimeout(tick, baseInterval + Math.random() * 300);
    };
    const id = setTimeout(tick, baseInterval);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [max, baseInterval]);

  return events;
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
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--ink-3)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
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

  // Convert projection data to display format, or use synthetic events
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

  // Use synthetic live events for the demo experience
  const syntheticEvents = useLiveEvents({ max: 12 });
  const events = projectionEvents.length > 0 ? projectionEvents : syntheticEvents;

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
      isEmpty={false}
      isLive
      headerExtra={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{events.length} evt/min</span>
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
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                  {e.t.slice(0, 8)}
                </span>
                <NodePill kind={kind}>{e.type}</NodePill>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.topic}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
