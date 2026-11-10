import { useEffect, useState, useMemo } from 'react';
import { Search } from '@/theme/design-system/icons';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { NodePill } from '@/components/primitives';
import { Text } from '@/components/ui/typography';
import type { NodeKind } from '@/components/primitives';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import { formatRedactedEventPayload } from '@/utils/redact-event-payload';
import { localeString as fmtLocaleString } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in LiveEventStreamWidget.static.css.
import './LiveEventStreamWidget.static.css';

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

export const SYSTEM_EVENT_REFRESH_INTERVAL_MS = refreshInterval('live-event-stream');
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
        borderTop: '1px solid var(--ds-line)',
        borderBottom: '1px solid var(--ds-line)',
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
    refetchInterval: refreshInterval('live-event-stream'),
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
        <span className="live-event-stream-widget-s3e5458">
          <Text size="xs" color="tertiary" family="mono">
            {filteredEvents.length} visible · {sourceCount} sources · auto-updating
          </Text>
          <span className="live-event-stream-widget-s5eafdb" />
        </span>
      }
    >
      <div className="live-event-stream-widget-sb993d5" aria-live="polite">
        <div className="live-event-stream-widget-sf9183d"
        >
          {[
            ['Messages', fmtLocaleString(events.length)],
            ['Visible', fmtLocaleString(filteredEvents.length)],
            ['Sources', fmtLocaleString(sourceCount)],
            ['Newest', newestLabel],
          ].map(([label, value]) => (
            <div className="live-event-stream-widget-s9e764a" key={label}>
              <Text as="div" size="xs" weight="bold" color="tertiary" family="mono" transform="uppercase">{label}</Text>
              <Text className="live-event-stream-widget-saeb83f" as="div" size="md" weight="bold" color="primary" family="mono">{value}</Text>
            </div>
          ))}
        </div>

        <div className="live-event-stream-widget-saf15e3">
          <div className="live-event-stream-widget-sa164bf"
          >
            <Search className="live-event-stream-widget-sf6885f" size={14} />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))}
              placeholder="Filter source, topic, correlation, or payload"
              aria-label="Filter live event messages"
              className="text-input-md live-event-stream-widget-sd4d4d7"
            />
          </div>
          <select
            value={filters.eventType}
            onChange={(e) => setFilters((current) => ({ ...current, eventType: e.target.value }))}
            aria-label="Filter by event type"
            className="text-input-md live-event-stream-widget-sed5342"
          >
            <option value="all">All event types</option>
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>{eventType}</option>
            ))}
          </select>
          <label className="live-event-stream-widget-scce571"
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
              {fmtLocaleString(heartbeatCount)} {heartbeatCount === 1 ? 'heartbeat' : 'heartbeats'} hidden
            </Text>
          )}
        </div>

        <div className="live-event-stream-widget-s601b80">
          <BusHeader template={ROW_TEMPLATE} />

          <div className="live-event-stream-widget-s7306f5">
            {filteredEvents.map((e, i) => {
              const kind = nodeKindForEvent(e);
              const isNewest = i === 0;
              const payload = e.payload ? formatRedactedEventPayload(e.payload) : '{}';
              return (
                <details
                  key={e.id}
                  data-testid="live-event-row"
                  open={i === 0}
                  style={{
                    borderBottom: '1px solid var(--ds-line-soft)',
                    borderLeft: `3px solid ${isNewest ? 'var(--ds-brand)' : 'transparent'}`,
                    background: isNewest ? 'var(--ds-brand-soft)' : 'transparent',
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
                  <Text className="live-event-stream-widget-scc9e2c"
                    as="pre"
                    size="xs"
                    color="secondary"
                    family="mono"
                  >
                    {payload}
                  </Text>
                </details>
              );
            })}
            {filteredEvents.length === 0 && (
              <Text className="live-event-stream-widget-s0af041"
                as="div"
                size="sm"
                color="tertiary"
                align="center"
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
