import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Search, X } from '@/theme/design-system/icons';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { formatRedactedEventPayload } from '@/utils/redact-event-payload';
import { formatAge } from '@/utils/time-format';
import { FreshnessLine } from '@/components/dashboard/lab/FreshnessLine';
import {
  newestFirst,
  type WorkEventRow,
} from '@/components/dashboard/work-events/WorkEventsWidget';
import type { ProjectionSnapshot } from '@/data-source';
import { isTenantNotConfiguredError } from '@/data-source/projection-tenant';
import { TenantNotConfiguredState } from '../TenantNotConfiguredState';
import { fixed as fmtFixed, localeTime as fmtLocaleTime } from '@/theme/format';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in TraceExplorerWidget.static.css.
import './TraceExplorerWidget.static.css';

export const EVENT_TRACE_REFRESH_INTERVAL_MS = refreshInterval('trace-explorer');

export interface LiveEventRow {
  id: string;
  event_id?: string | null;
  type: string;
  timestamp: string;
  source: string;
  topic: string;
  summary: string;
  payload: unknown;
  correlation_id?: string | null;
  created_at?: string | null;
}

export interface DelegationDecisionRow {
  id: string;
  correlation_id: string;
  session_id?: string | null;
  task_type?: string | null;
  delegated_to?: string | null;
  provider?: string | null;
  model_name?: string | null;
  outcome?: string | null;
  quality_gate_passed?: boolean | null;
  created_at: string;
}

export interface TraceFilters {
  query: string;
  correlationId: string;
  eventType: string;
  topic: string;
  start: string;
  end: string;
  includeHeartbeats: boolean;
}

export const DEFAULT_TRACE_FILTERS: TraceFilters = {
  query: '',
  correlationId: '',
  eventType: 'all',
  topic: '',
  start: '',
  end: '',
  includeHeartbeats: false,
};

export function isHeartbeatEvent(event: LiveEventRow): boolean {
  return event.type === 'onex.evt.platform.node-heartbeat.v1'
    || event.topic.endsWith('node-heartbeat.v1');
}

function contains(value: unknown, query: string): boolean {
  return String(value ?? '').toLowerCase().includes(query.toLowerCase());
}

function topicSuffixMatches(topic: string, filter: string): boolean {
  const suffix = filter.trim().toLowerCase();
  return suffix.length === 0 || topic.toLowerCase().endsWith(suffix);
}

export function filterTraceEvents(
  events: LiveEventRow[],
  filters: TraceFilters,
): LiveEventRow[] {
  const startMs = filters.start ? new Date(filters.start).getTime() : null;
  const endMs = filters.end ? new Date(filters.end).getTime() : null;
  return events.filter((event) => {
    if (!filters.includeHeartbeats && isHeartbeatEvent(event)) return false;
    if (filters.correlationId && !contains(event.correlation_id, filters.correlationId)) return false;
    if (filters.eventType !== 'all' && event.type !== filters.eventType) return false;
    if (!topicSuffixMatches(event.topic, filters.topic)) return false;
    const eventMs = new Date(event.timestamp).getTime();
    if (startMs !== null && Number.isFinite(startMs) && eventMs < startMs) return false;
    if (endMs !== null && Number.isFinite(endMs) && eventMs > endMs) return false;
    if (filters.query) {
      const matches = [event.type, event.source, event.topic, event.summary]
        .some((field) => contains(field, filters.query));
      if (!matches) return false;
    }
    return true;
  });
}

export function eventRatePerSecond(events: LiveEventRow[]): number {
  if (events.length < 2) return 0;
  const times = events.map((event) => new Date(event.timestamp).getTime()).filter(Number.isFinite);
  if (times.length < 2) return 0;
  const elapsedSeconds = (Math.max(...times) - Math.min(...times)) / 1_000;
  return elapsedSeconds > 0 ? events.length / elapsedSeconds : 0;
}

function formatTimestamp(iso: string): string {
  const value = new Date(iso);
  return Number.isFinite(value.getTime()) ? fmtLocaleTime(value) : 'invalid time';
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value;
}

function emptySnapshot<T>(): ProjectionSnapshot<T> {
  return {
    rows: [],
    rowCount: 0,
    dataFreshness: 'unknown',
    latestEventAt: null,
    readAt: new Date().toISOString(),
  };
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="chip" onClick={onRemove} aria-label={`Remove ${label} filter`}>
      <Text as="span" size="xs" family="mono" color="secondary">{label}</Text>
      <X size={12} aria-hidden="true" />
    </button>
  );
}

function LaneActivityPane({
  rows,
  decisions,
  correlationId,
  snapshot,
  error,
}: {
  rows: WorkEventRow[];
  decisions: DelegationDecisionRow[];
  correlationId: string;
  snapshot: ProjectionSnapshot<WorkEventRow>;
  error: Error | null;
}) {
  const sessionIds = useMemo(
    () => new Set(
      decisions
        .filter((decision) => !correlationId || decision.correlation_id === correlationId)
        .map((decision) => decision.session_id)
        .filter((value): value is string => Boolean(value)),
    ),
    [correlationId, decisions],
  );
  const visible = useMemo(() => {
    const ordered = newestFirst(rows);
    return (correlationId ? ordered.filter((row) => row.actor_id && sessionIds.has(row.actor_id)) : ordered)
      .slice(0, 12);
  }, [correlationId, rows, sessionIds]);

  return (
    <section className="trace-explorer-widget-s859c1d">
      <Text as="div" size="sm" weight="semibold" color="primary">Lane activity</Text>
      <Text className="trace-explorer-widget-s45f395" as="div" size="xs" color="tertiary">
        work.events has no top-level correlation_id; rows join through the delegation session id and work actor_id.
      </Text>
      <div className="trace-explorer-widget-s082f6e">
        <FreshnessLine
          freshness={snapshot.dataFreshness}
          latestEventAt={snapshot.latestEventAt}
          readAt={snapshot.readAt}
        />
      </div>
      {error && (
        <Text className="trace-explorer-widget-s36ca0a" as="div" size="xs" color="warn">
          Work-event projection unreadable: {error.message}
        </Text>
      )}
      {!error && visible.length === 0 && (
        <Text className="trace-explorer-widget-s36ca0a" as="div" size="xs" color="tertiary">
          {correlationId ? 'No work rows joined to this correlation session.' : 'No work-event rows read.'}
        </Text>
      )}
      {visible.map((row) => (
        <div className="trace-explorer-widget-s0bff55" key={row.event_id}>
          <Text as="div" size="xs" family="mono" color="primary">{row.event_kind}</Text>
          <Text as="div" size="xs" color="secondary" truncate title={row.summary ?? undefined}>
            {row.summary === null || row.summary === undefined || row.summary === ''
              ? 'no summary recorded'
              : row.summary}
          </Text>
          <Text as="div" size="xs" family="mono" color="tertiary">
            {row.actor_id || 'actor not recorded'} · {formatAge(row.emitted_at)} old
          </Text>
        </div>
      ))}
    </section>
  );
}

export function TraceExplorerView({
  eventSnapshot,
  decisionSnapshot,
  workSnapshot,
  isLoading = false,
  eventError = null,
  decisionError = null,
  workError = null,
  paused,
  onPausedChange,
}: {
  eventSnapshot: ProjectionSnapshot<LiveEventRow>;
  decisionSnapshot: ProjectionSnapshot<DelegationDecisionRow>;
  workSnapshot: ProjectionSnapshot<WorkEventRow>;
  isLoading?: boolean;
  eventError?: Error | null;
  decisionError?: Error | null;
  workError?: Error | null;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
}) {
  const traceFilter = useFrameStore((state) => state.traceFilter);
  const setTraceFilter = useFrameStore((state) => state.setTraceFilter);
  const [filters, setFilters] = useState(DEFAULT_TRACE_FILTERS);
  const [displayCap, setDisplayCap] = useState(25);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!traceFilter) return;
    setFilters((current) => ({ ...current, correlationId: traceFilter }));
    setOffset(0);
    setTraceFilter(null);
  }, [setTraceFilter, traceFilter]);

  const eventTypes = useMemo(
    () => [...new Set(eventSnapshot.rows.map((event) => event.type))].sort(),
    [eventSnapshot.rows],
  );
  const filtered = useMemo(
    () => filterTraceEvents(eventSnapshot.rows, filters)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [eventSnapshot.rows, filters],
  );
  const page = filtered.slice(offset, offset + displayCap);
  const rate = eventRatePerSecond(filtered);
  const newest = filtered[0];
  const decisionsByCorrelation = useMemo(() => {
    const out = new Map<string, DelegationDecisionRow>();
    for (const decision of decisionSnapshot.rows) {
      const seen = out.get(decision.correlation_id);
      if (!seen || decision.created_at > seen.created_at) out.set(decision.correlation_id, decision);
    }
    return out;
  }, [decisionSnapshot.rows]);

  const updateFilter = <K extends keyof TraceFilters>(key: K, value: TraceFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  };
  const activeChips = [
    filters.query && { key: 'query' as const, label: `search: ${filters.query}`, clear: '' },
    filters.correlationId && { key: 'correlationId' as const, label: `correlation: ${filters.correlationId}`, clear: '' },
    filters.eventType !== 'all' && { key: 'eventType' as const, label: `type: ${filters.eventType}`, clear: 'all' },
    filters.topic && { key: 'topic' as const, label: `topic suffix: ${filters.topic}`, clear: '' },
    filters.start && { key: 'start' as const, label: `from: ${filters.start}`, clear: '' },
    filters.end && { key: 'end' as const, label: `to: ${filters.end}`, clear: '' },
  ].filter(Boolean) as Array<{ key: keyof TraceFilters; label: string; clear: string }>;

  return (
    <ComponentWrapper
      title="Event Trace"
      isLoading={isLoading}
      error={eventError}
      isEmpty={!isLoading && !eventError && eventSnapshot.rows.length === 0}
      emptyMessage="No live events"
      emptyHint="The live-events projection returned zero rows; no trace is inferred from refused trace projections."
      isLive={!paused}
      headerExtra={(
        <FreshnessLine
          freshness={eventSnapshot.dataFreshness}
          latestEventAt={eventSnapshot.latestEventAt}
          readAt={eventSnapshot.readAt}
        />
      )}
    >
      <div className="trace-explorer-widget-sfce391">
        <div className="trace-explorer-widget-sdc1707">
          <label>
            <Text as="span" size="xs" color="tertiary">Search event type, source, topic, summary</Text>
            <div className="trace-explorer-widget-sc779fa">
              <Search size={13} aria-hidden="true" />
              <input aria-label="Search events" className="text-input-md" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} />
            </div>
          </label>
          <label>
            <Text as="span" size="xs" color="tertiary">Correlation id</Text>
            <input aria-label="Filter correlation id" className="text-input-md" value={filters.correlationId} onChange={(event) => updateFilter('correlationId', event.target.value)} />
          </label>
          <label>
            <Text as="span" size="xs" color="tertiary">Event type</Text>
            <select aria-label="Filter event type" className="text-input-md" value={filters.eventType} onChange={(event) => updateFilter('eventType', event.target.value)}>
              <option value="all">All event types</option>
              {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <Text as="span" size="xs" color="tertiary">Topic suffix</Text>
            <input aria-label="Filter topic suffix" className="text-input-md" value={filters.topic} onChange={(event) => updateFilter('topic', event.target.value)} />
          </label>
          <label>
            <Text as="span" size="xs" color="tertiary">Start time</Text>
            <input aria-label="Filter start time" type="datetime-local" className="text-input-md" value={filters.start} onChange={(event) => updateFilter('start', event.target.value)} />
          </label>
          <label>
            <Text as="span" size="xs" color="tertiary">End time</Text>
            <input aria-label="Filter end time" type="datetime-local" className="text-input-md" value={filters.end} onChange={(event) => updateFilter('end', event.target.value)} />
          </label>
        </div>

        <div className="trace-explorer-widget-saf15e3">
          <button type="button" className="btn" onClick={() => onPausedChange(!paused)}>
            {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            <Text as="span" size="xs">{paused ? 'Resume' : 'Pause'}</Text>
          </button>
          <label className="trace-explorer-widget-s23b34f">
            <input type="checkbox" aria-label="Include heartbeats" checked={filters.includeHeartbeats} onChange={(event) => updateFilter('includeHeartbeats', event.target.checked)} />
            <Text as="span" size="xs" color="secondary">Include heartbeats</Text>
          </label>
          <label className="trace-explorer-widget-s372f70">
            <Text as="span" size="xs" color="tertiary">Display cap</Text>
            <select aria-label="Display cap" className="text-input-md" value={displayCap} onChange={(event) => { setDisplayCap(Number(event.target.value)); setOffset(0); }}>
              {[10, 25, 50, 100].map((cap) => <option key={cap} value={cap}>{cap}</option>)}
            </select>
          </label>
          <Text as="span" size="xs" family="mono" color="tertiary">
            {filtered.length} visible · {fmtFixed(rate, 2)}/s filtered rate · newest {formatAge(newest?.timestamp, new Date(eventSnapshot.readAt).getTime())} old at read
          </Text>
        </div>

        {activeChips.length > 0 && (
          <div className="trace-explorer-widget-sd6ed84" data-testid="active-filter-chips">
            {activeChips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={() => updateFilter(chip.key, chip.clear as never)} />
            ))}
          </div>
        )}

        <div className="trace-explorer-widget-sd33c41">
          <section className="trace-explorer-widget-s8861ff">
            {page.length === 0 && (
              <Text className="trace-explorer-widget-s872b66" as="div" size="sm" color="tertiary" align="center">No matching events</Text>
            )}
            {page.map((event) => {
              const decision = event.correlation_id ? decisionsByCorrelation.get(event.correlation_id) : undefined;
              return (
                <details className="trace-explorer-widget-sc6072a" key={event.event_id || event.id} data-testid="trace-event-row">
                  <summary className="trace-explorer-widget-sbaf642">
                    <Text size="xs" family="mono" color="tertiary">{formatTimestamp(event.timestamp)}</Text>
                    <Text size="xs" family="mono" color={event.type === 'ERROR' ? 'bad' : 'primary'} truncate title={event.type}>{event.type}</Text>
                    <Text size="xs" family="mono" color="secondary" truncate title={event.topic}>{event.topic}</Text>
                    <Text size="xs" color="secondary" truncate title={event.summary}>{event.summary}</Text>
                  </summary>
                  <div className="trace-explorer-widget-sb458b9">
                    <div className="trace-explorer-widget-s622922">
                      <Text as="span" size="xs" family="mono" color="tertiary">source: {event.source}</Text>
                      {event.correlation_id && (
                        <button type="button" className="chip" onClick={() => setTraceFilter(event.correlation_id || null)}>
                          <Text as="span" size="xs" family="mono" color="primary">correlation: {shortId(event.correlation_id)}</Text>
                        </button>
                      )}
                    </div>
                    {decision && (
                      <Text className="trace-explorer-widget-s452e12" as="div" size="xs" color="secondary">
                        Delegation join: {decision.delegated_to || 'provider not emitted'} · {decision.model_name || 'model not emitted'} · {decision.outcome || (decision.quality_gate_passed === true ? 'passed' : decision.quality_gate_passed === false ? 'failed' : 'outcome not emitted')}
                      </Text>
                    )}
                    <Text className="trace-explorer-widget-s5ff1fe" as="pre" size="xs" family="mono" color="secondary">
                      {formatRedactedEventPayload(event.payload)}
                    </Text>
                  </div>
                </details>
              );
            })}
            <div className="trace-explorer-widget-sc466cc">
              <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - displayCap))}>Previous</button>
              <Text as="span" size="xs" family="mono" color="tertiary">offset {offset} · limit {displayCap}</Text>
              <button type="button" className="btn" disabled={offset + displayCap >= filtered.length} onClick={() => setOffset(offset + displayCap)}>Next</button>
            </div>
            {decisionError && (
              isTenantNotConfiguredError(decisionError)
                ? <div className="trace-explorer-widget-sdd9e1a"><TenantNotConfiguredState /></div>
                : (
                  <Text className="trace-explorer-widget-sdd9e1a" as="div" size="xs" color="warn">
                    Delegation correlation join unavailable: {decisionError.message}
                  </Text>
                )
            )}
          </section>
          <LaneActivityPane
            rows={workSnapshot.rows}
            decisions={decisionSnapshot.rows}
            correlationId={filters.correlationId}
            snapshot={workSnapshot}
            error={workError}
          />
        </div>
      </div>
    </ComponentWrapper>
  );
}

export default function TraceExplorerWidget() {
  const [paused, setPaused] = useState(false);
  const interval = paused ? false : EVENT_TRACE_REFRESH_INTERVAL_MS;
  const events = useProjectionSnapshotQuery<LiveEventRow>({
    topic: TOPICS.liveEvents,
    queryKey: ['lab-event-trace', 'live-events'],
    refetchInterval: interval,
  });
  const decisions = useProjectionSnapshotQuery<DelegationDecisionRow>({
    topic: TOPICS.delegationDecisions,
    queryKey: ['lab-event-trace', 'delegation-decisions'],
    refetchInterval: interval,
  });
  const work = useProjectionSnapshotQuery<WorkEventRow>({
    topic: TOPICS.workEvents,
    queryKey: ['lab-event-trace', 'work-events'],
    refetchInterval: interval,
  });

  return (
    <TraceExplorerView
      eventSnapshot={events.data ?? emptySnapshot<LiveEventRow>()}
      decisionSnapshot={decisions.data ?? emptySnapshot<DelegationDecisionRow>()}
      workSnapshot={work.data ?? emptySnapshot<WorkEventRow>()}
      isLoading={events.isLoading}
      eventError={events.error}
      decisionError={decisions.error}
      workError={work.error}
      paused={paused}
      onPausedChange={setPaused}
    />
  );
}
