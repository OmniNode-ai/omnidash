import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { NodePill } from '@/components/primitives';
import { Text } from '@/components/ui/typography';
import type { NodeKind } from '@/components/primitives';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

// ── Data type ───────────────────────────────────────────────────────

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  topic: string;
  summary: string;
  payload: string;
  correlation_id?: string;
}

export const SYSTEM_EVENT_REFRESH_INTERVAL_MS = 2_000;
export const LIVE_EVENT_FILTERS_STORAGE_KEY = 'omnidash:system-event-stream:filters:v1';

interface LiveEventFilters {
  query: string;
  eventType: string;
  includeHeartbeats: boolean;
}

const DEFAULT_FILTERS: LiveEventFilters = {
  query: '',
  eventType: 'all',
  includeHeartbeats: false,
};

// ── Helpers ─────────────────────────────────────────────────────────

function nodeKindForEvent(ev: LiveEvent): NodeKind {
  const value = `${ev.type} ${ev.source} ${ev.topic}`.toLowerCase();
  if (value.includes('route') || value.includes('delegation')) return 'orchestrator';
  if (value.includes('generation') || value.includes('transform')) return 'compute';
  if (value.includes('completed') || value.includes('action')) return 'effect';
  if (value.includes('failed') || value.includes('error')) return 'cmd';
  return 'cmd';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function compactTopic(topic: string): string {
  return topic.replace(/^onex\./, '').replace(/^snapshot\.projection\./, 'projection.');
}

function prettyPayload(payload: string): string {
  if (!payload) return '{}';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function matchesEvent(ev: LiveEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    ev.type,
    ev.source,
    ev.topic,
    ev.summary,
    ev.correlation_id,
    ev.payload,
  ].some((value) => String(value ?? '').toLowerCase().includes(q));
}

function isHeartbeatEvent(ev: LiveEvent): boolean {
  return [ev.type, ev.source, ev.topic, ev.summary]
    .some((value) => String(value ?? '').toLowerCase().includes('heartbeat'));
}

function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadFilters(): LiveEventFilters {
  const storage = browserStorage();
  if (!storage) return DEFAULT_FILTERS;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(LIVE_EVENT_FILTERS_STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_FILTERS;
    const record = parsed as Record<string, unknown>;
    return {
      query: typeof record.query === 'string' ? record.query : DEFAULT_FILTERS.query,
      eventType: typeof record.eventType === 'string' ? record.eventType : DEFAULT_FILTERS.eventType,
      includeHeartbeats: typeof record.includeHeartbeats === 'boolean'
        ? record.includeHeartbeats
        : DEFAULT_FILTERS.includeHeartbeats,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(filters: LiveEventFilters): void {
  try {
    browserStorage()?.setItem(LIVE_EVENT_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Persistence is a convenience. The live stream remains usable when storage
    // is unavailable (private mode, policy restrictions, or exhausted quota).
  }
}

// ── Bus column header ───────────────────────────────────────────────

function BusHeader({ template }: { template: string }) {
  const labels = [
    { text: 'TIME', align: 'left' as const },
    { text: 'TYPE', align: 'left' as const },
    { text: 'SOURCE', align: 'left' as const },
    { text: 'TOPIC', align: 'left' as const },
    { text: 'CORRELATION', align: 'left' as const },
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
        <Text
          key={col.text}
          as="div"
          size="xs"
          weight="bold"
          color="tertiary"
          family="mono"
          transform="uppercase"
          style={{ textAlign: col.align }}
        >
          {col.text}
        </Text>
      ))}
    </div>
  );
}

// ── Main widget (Bold variant) ──────────────────────────────────────

export default function LiveEventStreamWidget() {
  const { data, isLoading, error } = useProjectionQuery<LiveEvent>({
    topic: TOPICS.liveEvents,
    queryKey: ['live-event-stream'],
    refetchInterval: SYSTEM_EVENT_REFRESH_INTERVAL_MS,
  });
  const [filters, setFilters] = useState<LiveEventFilters>(loadFilters);
  const dataSourceMode = useDataSourceMode();

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  const events = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [data]);

  const eventTypes = useMemo(() => {
    const types = new Set(events.map((event) => event.type).filter(Boolean));
    if (filters.eventType !== 'all') types.add(filters.eventType);
    return [...types].sort((left, right) => left.localeCompare(right));
  }, [events, filters.eventType]);
  const heartbeatCount = useMemo(
    () => events.filter(isHeartbeatEvent).length,
    [events],
  );
  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => {
          if (!filters.includeHeartbeats && isHeartbeatEvent(event)) return false;
          if (filters.eventType !== 'all' && event.type !== filters.eventType) return false;
          return matchesEvent(event, filters.query);
        })
        .slice(0, 100),
    [events, filters],
  );
  const sourceCount = new Set(filteredEvents.map((ev) => ev.source)).size;
  const newest = filteredEvents[0];
  const newestLabel = newest ? formatTimestamp(newest.timestamp) : '--:--:--';
  const ROW_TEMPLATE = '72px 128px 150px minmax(150px, 1fr) 170px minmax(260px, 2fr)';

  return (
    <ComponentWrapper
      title="System Event Stream"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={events.length === 0}
      emptyMessage="No system events"
      emptyHint="Projected bus, runtime, delegation, and node-generation activity appears here as it is observed."
      isLive={isLiveDataSource(dataSourceMode)}
      fileMode={!isLiveDataSource(dataSourceMode)}
      headerExtra={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Text size="xs" color="tertiary" family="mono">
            {filteredEvents.length} visible · {sourceCount} sources · auto-updating
          </Text>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--good)', boxShadow: '0 0 0 3px rgba(21,128,61,.18)' }} />
        </span>
      }
    >
      <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {[
            ['Messages', events.length.toLocaleString()],
            ['Visible', filteredEvents.length.toLocaleString()],
            ['Sources', sourceCount.toLocaleString()],
            ['Newest', newestLabel],
          ].map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '8px 10px', background: 'var(--panel-2)' }}>
              <Text as="div" size="xs" weight="bold" color="tertiary" family="mono" transform="uppercase">{label}</Text>
              <Text as="div" size="md" weight="bold" color="primary" family="mono" style={{ marginTop: 2 }}>{value}</Text>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div
            style={{
              flex: 1,
              minWidth: 280,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--panel-2)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))}
              placeholder="Filter source, topic, correlation, or payload"
              aria-label="Filter live event messages"
              className="text-input-md"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: 'transparent',
              }}
            />
          </div>
          <select
            value={filters.eventType}
            onChange={(e) => setFilters((current) => ({ ...current, eventType: e.target.value }))}
            aria-label="Filter by event type"
            className="text-input-md"
            style={{
              minHeight: 34,
              padding: '6px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--panel-2)',
              color: 'inherit',
            }}
          >
            <option value="all">All event types</option>
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>{eventType}</option>
            ))}
          </select>
          <label
            style={{
              minHeight: 34,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--panel-2)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={filters.includeHeartbeats}
              onChange={(e) => setFilters((current) => ({ ...current, includeHeartbeats: e.target.checked }))}
            />
            <Text as="span" size="xs" color="secondary">Include heartbeats</Text>
          </label>
          {!filters.includeHeartbeats && heartbeatCount > 0 && (
            <Text as="span" size="xs" color="tertiary" family="mono">
              {heartbeatCount.toLocaleString()} {heartbeatCount === 1 ? 'heartbeat' : 'heartbeats'} hidden
            </Text>
          )}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--panel)' }}>
          <BusHeader template={ROW_TEMPLATE} />

          <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredEvents.map((e, i) => {
              const kind = nodeKindForEvent(e);
              const isNewest = i === 0;
              const payload = prettyPayload(e.payload);
              return (
                <details
                  key={e.id}
                  data-testid="live-event-row"
                  open={i === 0}
                  style={{
                    borderBottom: '1px solid var(--line-2)',
                    borderLeft: `3px solid ${isNewest ? 'var(--accent)' : 'transparent'}`,
                    background: isNewest ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <summary
                    style={{
                      display: 'grid',
                      gridTemplateColumns: ROW_TEMPLATE,
                      gap: 12,
                      alignItems: 'center',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      listStyle: 'none',
                    }}
                  >
                    <Text size="xs" color="tertiary" family="mono">
                      {formatTimestamp(e.timestamp)}
                    </Text>
                    <NodePill kind={kind}>{e.type}</NodePill>
                    <Text size="xs" color="secondary" family="mono" truncate>
                      {e.source}
                    </Text>
                    <Text size="xs" color="brand" family="mono" title={e.topic} truncate>
                      {compactTopic(e.topic)}
                    </Text>
                    <Text size="xs" color="tertiary" family="mono" title={e.correlation_id ?? ''} truncate>
                      {e.correlation_id || 'none'}
                    </Text>
                    <Text size="xs" color="secondary" truncate>
                      {e.summary}
                    </Text>
                  </summary>
                  <Text
                    as="pre"
                    size="xs"
                    color="secondary"
                    family="mono"
                    style={{
                      margin: '0 12px 10px 374px',
                      maxHeight: 220,
                      overflow: 'auto',
                      padding: 10,
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      background: 'var(--bg-sunken)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {payload}
                  </Text>
                </details>
              );
            })}
            {filteredEvents.length === 0 && (
              <Text
                as="div"
                size="sm"
                color="tertiary"
                align="center"
                style={{
                  padding: 18,
                }}
              >
                No matching messages
              </Text>
            )}
          </div>
        </div>
      </div>
    </ComponentWrapper>
  );
}
