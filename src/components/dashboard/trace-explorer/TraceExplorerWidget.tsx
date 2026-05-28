import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { NodePill } from '@/components/primitives';
import { Text } from '@/components/ui/typography';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

// ── Data types ───────────────────────────────────────────────────────

export interface TraceGroup {
  correlation_id: string;
  nodes_involved: string[];
  event_count: number;
  first_event_at: string;
  last_event_at: string;
  duration_ms: number;
  has_error: boolean;
  is_running: boolean;
  latest_message: string;
}

export interface TraceEvent {
  entry_id: string;
  timestamp: string;
  node_name: string;
  function_name: string;
  level: string;
  message: string;
  duration_ms: number | null;
  metadata: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'ERROR': return 'var(--bad)';
    case 'WARNING': return '#d97706';
    case 'DEBUG': return 'var(--text-tertiary)';
    default: return 'var(--text-secondary)';
  }
}

function matchesTrace(trace: TraceGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    trace.correlation_id,
    trace.latest_message,
    ...trace.nodes_involved,
  ].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function traceRowKey(trace: TraceGroup, index: number): string {
  return `${trace.correlation_id}:${trace.first_event_at}:${trace.last_event_at}:${index}`;
}

// ── Timeline panel ───────────────────────────────────────────────────

function TimelinePanel({ events, isLoading }: { events: TraceEvent[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 120 }}>
        <Text size="sm" color="tertiary">Loading events…</Text>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 120 }}>
        <Text size="sm" color="tertiary">No events for this trace</Text>
      </div>
    );
  }
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {events.map((ev, i) => (
        <details
          key={ev.entry_id}
          data-testid="trace-event-row"
          open={i === 0}
          style={{
            borderBottom: '1px solid var(--line-2)',
            borderLeft: `3px solid ${levelColor(ev.level)}`,
          }}
        >
          <summary
            style={{
              display: 'grid',
              gridTemplateColumns: '100px minmax(120px, 1fr) 60px minmax(200px, 2fr)',
              gap: 10,
              alignItems: 'center',
              padding: '7px 12px',
              cursor: 'pointer',
              listStyle: 'none',
            }}
          >
            <Text size="xs" color="tertiary" family="mono">
              {formatTimestamp(ev.timestamp)}
            </Text>
            <NodePill kind="compute">{ev.node_name}</NodePill>
            <Text
              size="xs"
              family="mono"
              style={{ color: levelColor(ev.level) }}
            >
              {ev.level.toUpperCase()}
            </Text>
            <Text size="xs" color="secondary" truncate title={ev.message}>
              {ev.message}
            </Text>
          </summary>
          <div style={{ padding: '6px 12px 10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ev.duration_ms !== null && (
              <Text size="xs" color="tertiary" family="mono">
                duration: {ev.duration_ms}ms · fn: {ev.function_name}
              </Text>
            )}
            {Object.keys(ev.metadata).length > 0 && (
              <Text
                as="pre"
                size="xs"
                color="secondary"
                family="mono"
                style={{
                  maxHeight: 160,
                  overflow: 'auto',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid var(--line)',
                  background: 'var(--bg-sunken)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}
              >
                {JSON.stringify(ev.metadata, null, 2)}
              </Text>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────

export default function TraceExplorerWidget() {
  const { data: traces, isLoading, error } = useProjectionQuery<TraceGroup>({
    topic: TOPICS.traceExplorer,
    queryKey: ['trace-explorer'],
    refetchInterval: 15_000,
  });

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const dataSourceMode = useDataSourceMode();

  const traceList = useMemo(() => {
    if (!traces || traces.length === 0) return [];
    return [...traces].sort(
      (a, b) => new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime(),
    );
  }, [traces]);

  const filteredTraces = useMemo(
    () => traceList.filter((t) => matchesTrace(t, query)),
    [traceList, query],
  );

  const handleSelectTrace = async (trace: TraceGroup, rowKey: string) => {
    if (selectedId === rowKey) {
      setSelectedId(null);
      setTraceEvents([]);
      setEventsLoading(false);
      return;
    }

    setSelectedId(rowKey);
    setEventsLoading(true);
    setTraceEvents([]);
    try {
      // Fetch events for this correlation_id from the log-entries projection endpoint.
      // In file-source mode this falls back to empty gracefully.
      const url = `/api/projections/log-entries?correlation_id=${encodeURIComponent(trace.correlation_id)}`;
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const rows: TraceEvent[] = Array.isArray(body)
          ? (body as TraceEvent[])
          : Array.isArray((body as { rows?: TraceEvent[] }).rows)
            ? ((body as { rows: TraceEvent[] }).rows)
            : [];
        setTraceEvents(rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      }
    } catch {
      // File-mode: no HTTP endpoint available; show empty timeline
    } finally {
      setEventsLoading(false);
    }
  };

  const runningCount = traceList.filter((t) => t.is_running).length;
  const errorCount = traceList.filter((t) => t.has_error).length;

  return (
    <ComponentWrapper
      title="Trace Explorer"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={traceList.length === 0}
      emptyMessage="No traces"
      emptyHint="Traces appear after log entries are written with correlation IDs. In file mode, add fixture files under fixtures/onex.snapshot.projection.traces.v1/"
      isLive={isLiveDataSource(dataSourceMode)}
      fileMode={!isLiveDataSource(dataSourceMode)}
      headerExtra={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Text size="xs" color="tertiary" family="mono">
            {traceList.length} traces · {runningCount} running · {errorCount} errors
          </Text>
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            border: '1px solid var(--line)',
            borderRadius: '6px 6px 0 0',
            background: 'var(--panel-2)',
          }}
        >
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by correlation ID, node, message"
            aria-label="Filter traces"
            className="text-input-md"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent' }}
          />
        </div>

        <div
          style={{
            border: '1px solid var(--line)',
            borderTop: 0,
            borderRadius: '0 0 6px 6px',
            overflow: 'hidden',
            background: 'var(--panel)',
          }}
        >
          {filteredTraces.length === 0 && (
            <div style={{ padding: 16 }}>
              <Text size="sm" color="tertiary" align="center">No matching traces</Text>
            </div>
          )}

          {filteredTraces.map((trace, traceIndex) => {
            const rowKey = traceRowKey(trace, traceIndex);
            const isExpanded = rowKey === selectedId;
            const statusColor = trace.has_error
              ? 'var(--bad)'
              : trace.is_running
                ? 'var(--good)'
                : 'var(--text-tertiary)';

            return (
              <div key={rowKey} style={{ borderBottom: '1px solid var(--line-2)' }}>
                <div
                  data-testid="trace-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => { void handleSelectTrace(trace, rowKey); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSelectTrace(trace, rowKey); }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '18px minmax(0, 1fr) 100px 80px 60px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '9px 12px',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--accent-soft)' : 'transparent',
                    borderLeft: `3px solid ${isExpanded ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    transition: 'transform .15s',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'var(--text-tertiary)',
                  }}>
                    ›
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: statusColor,
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs" weight="bold" color="primary" family="mono" truncate title={trace.correlation_id}>
                      {truncateId(trace.correlation_id)}
                    </Text>
                    <Text size="xs" color="secondary" truncate title={trace.latest_message}>
                      {trace.latest_message}
                    </Text>
                  </div>
                  <Text
                    size="xs"
                    color="tertiary"
                    family="mono"
                    truncate
                    title={`${trace.nodes_involved.length} node${trace.nodes_involved.length !== 1 ? 's' : ''} · ${trace.event_count} evt`}
                    style={{ minWidth: 0 }}
                  >
                    {trace.nodes_involved.length} node{trace.nodes_involved.length !== 1 ? 's' : ''} · {trace.event_count} evt
                  </Text>
                  <Text
                    size="xs"
                    color="tertiary"
                    family="mono"
                    truncate
                    title={formatDuration(trace.duration_ms)}
                    style={{ minWidth: 0 }}
                  >
                    {formatDuration(trace.duration_ms)}
                  </Text>
                  <Text
                    size="xs"
                    color="tertiary"
                    family="mono"
                    truncate
                    title={trace.is_running ? 'running' : trace.has_error ? 'error' : 'done'}
                    style={{ minWidth: 0 }}
                  >
                    {trace.is_running ? 'running' : trace.has_error ? 'error' : 'done'}
                  </Text>
                </div>

                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid var(--line)',
                    background: 'var(--bg-sunken)',
                    padding: '4px 0',
                  }}>
                    <TimelinePanel events={traceEvents} isLoading={eventsLoading} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ComponentWrapper>
  );
}
