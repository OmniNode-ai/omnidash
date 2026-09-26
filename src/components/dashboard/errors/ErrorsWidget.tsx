import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateReason } from '@shared/types/chart-config';
import type { ProjectionSnapshot } from '@/data-source';
import type { ConsumerFlowRow } from '@/components/dashboard/consumer-flow/ConsumerFlowWidget';
import type { LiveEventRow } from '@/components/dashboard/trace-explorer/TraceExplorerWidget';
import { FreshnessLine } from '@/components/dashboard/lab/FreshnessLine';

export interface RuntimeErrorFingerprintRow {
  fingerprint: string;
  logger_name?: string | null;
  error_category?: string | null;
  severity: string;
  message_template: string;
  exception_type?: string | null;
  occurrence_count: number;
  correlation_id?: string | null;
  service_name?: string | null;
  hostname?: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ErrorSeverityVocabulary {
  handler: string;
  dlq: string;
  stalled: string;
  starved: string;
  event: string;
}

export interface ErrorsWidgetConfig {
  /** Optional suffix-matched source topic filter. */
  topic?: string;
  /** Rolling window such as 15m, 1h, 24h, 7d, or all. */
  window?: string;
  /** Operator vocabulary for each source-owned error class. */
  severityVocabulary?: Partial<ErrorSeverityVocabulary>;
}

const DEFAULT_SEVERITY: ErrorSeverityVocabulary = {
  handler: 'error',
  dlq: 'critical',
  stalled: 'error',
  starved: 'warning',
  event: 'error',
};

const FINGERPRINT_EMPTY_REASON: EmptyStateReason = 'upstream-blocked';

function emptySnapshot<T>(): ProjectionSnapshot<T> {
  return {
    rows: [],
    rowCount: 0,
    dataFreshness: 'unknown',
    latestEventAt: null,
    readAt: new Date().toISOString(),
  };
}

function windowMilliseconds(value: string): number | null {
  if (value === 'all') return null;
  const match = /^(\d+)(m|h|d)$/.exec(value);
  if (!match) return 24 * 60 * 60 * 1_000;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'm') return amount * 60 * 1_000;
  if (unit === 'h') return amount * 60 * 60 * 1_000;
  return amount * 24 * 60 * 60 * 1_000;
}

function inWindow(timestamp: string, window: string, nowMs: number): boolean {
  const duration = windowMilliseconds(window);
  if (duration === null) return true;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) && value >= nowMs - duration;
}

function suffixMatches(value: string | null | undefined, suffix: string): boolean {
  return suffix.length === 0 || String(value ?? '').toLowerCase().endsWith(suffix.toLowerCase());
}

function ErrorCorrelationButton({ correlationId }: { correlationId: string }) {
  const setTraceFilter = useFrameStore((state) => state.setTraceFilter);
  return (
    <button type="button" className="chip" onClick={() => setTraceFilter(correlationId)}>
      <Text as="span" size="xs" family="mono" color="primary">{correlationId}</Text>
    </button>
  );
}

function SectionFreshness<T>({ snapshot }: { snapshot: ProjectionSnapshot<T> }) {
  return (
    <FreshnessLine
      freshness={snapshot.dataFreshness}
      latestEventAt={snapshot.latestEventAt}
      readAt={snapshot.readAt}
    />
  );
}

export function ErrorsView({
  consumerSnapshot,
  eventSnapshot,
  fingerprintSnapshot,
  config = {},
  isLoading = false,
  error = null,
}: {
  consumerSnapshot: ProjectionSnapshot<ConsumerFlowRow>;
  eventSnapshot: ProjectionSnapshot<LiveEventRow>;
  fingerprintSnapshot: ProjectionSnapshot<RuntimeErrorFingerprintRow>;
  config?: ErrorsWidgetConfig;
  isLoading?: boolean;
  error?: Error | null;
}) {
  const topic = config.topic?.trim() ?? '';
  const window = config.window ?? '24h';
  const severity = { ...DEFAULT_SEVERITY, ...config.severityVocabulary };
  const nowMs = Date.now();

  const consumerRows = useMemo(
    () => consumerSnapshot.rows.filter((row) =>
      suffixMatches(row.topic, topic) && inWindow(row.window_end, window, nowMs)),
    [consumerSnapshot.rows, nowMs, topic, window],
  );
  const liveErrors = useMemo(
    () => eventSnapshot.rows.filter((row) =>
      row.type === 'ERROR'
      && suffixMatches(row.topic, topic)
      && inWindow(row.timestamp, window, nowMs)),
    [eventSnapshot.rows, nowMs, topic, window],
  );
  const fingerprints = useMemo(
    () => fingerprintSnapshot.rows.filter((row) => inWindow(row.last_seen_at, window, nowMs)),
    [fingerprintSnapshot.rows, nowMs, window],
  );

  const consumerIssueCount = consumerRows.filter((row) =>
    (row.handler_errors !== null && row.handler_errors !== undefined && row.handler_errors > 0)
    || (row.messages_dlq !== null && row.messages_dlq !== undefined && row.messages_dlq > 0)
    || row.flow_state === 'STALLED'
    || row.flow_state === 'STARVED').length;
  const consumerCounts = consumerRows.reduce(
    (counts, row) => {
      if (typeof row.handler_errors === 'number') counts.handlerErrors += row.handler_errors;
      else counts.unreadHandler += 1;
      if (typeof row.messages_dlq === 'number') counts.dlqMessages += row.messages_dlq;
      else counts.unreadDlq += 1;
      if (row.flow_state === 'STALLED') counts.stalled += 1;
      if (row.flow_state === 'STARVED') counts.starved += 1;
      return counts;
    },
    { handlerErrors: 0, dlqMessages: 0, stalled: 0, starved: 0, unreadHandler: 0, unreadDlq: 0 },
  );
  const isEmpty = consumerIssueCount === 0 && liveErrors.length === 0 && fingerprints.length === 0;

  return (
    <ComponentWrapper
      title="Errors"
      isLoading={isLoading}
      error={error}
      isEmpty={false}
      isLive
      headerExtra={(
        <Text as="span" size="xs" family="mono" color="tertiary">
          {consumerIssueCount + liveErrors.length + fingerprints.length} findings · {window}
        </Text>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-empty={isEmpty || undefined}>
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text as="div" size="sm" weight="semibold" color="primary">Consumer flow</Text>
            <SectionFreshness snapshot={consumerSnapshot} />
          </div>
          <Text as="div" size="xs" family="mono" color="tertiary">
            handler errors {consumerCounts.handlerErrors} · DLQ {consumerCounts.dlqMessages} · STALLED {consumerCounts.stalled} · STARVED {consumerCounts.starved}
            {consumerCounts.unreadHandler > 0 || consumerCounts.unreadDlq > 0
              ? ` · unread counters ${Math.max(consumerCounts.unreadHandler, consumerCounts.unreadDlq)}`
              : ''}
          </Text>
          {consumerIssueCount === 0 ? (
            <Text as="div" size="xs" color="tertiary">No handler, DLQ, STALLED, or STARVED findings in the selected window.</Text>
          ) : consumerRows.map((row) => {
            const labels: string[] = [];
            if (row.handler_errors !== null && row.handler_errors !== undefined && row.handler_errors > 0) labels.push(`${severity.handler}: ${row.handler_errors} handler errors`);
            if (row.messages_dlq !== null && row.messages_dlq !== undefined && row.messages_dlq > 0) labels.push(`${severity.dlq}: ${row.messages_dlq} DLQ messages`);
            if (row.flow_state === 'STALLED') labels.push(`${severity.stalled}: STALLED`);
            if (row.flow_state === 'STARVED') labels.push(`${severity.starved}: STARVED`);
            if (labels.length === 0) return null;
            return (
              <div key={`${row.consumer_group}:${row.topic}`} data-testid="consumer-error-row" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
                <Text as="div" size="xs" family="mono" color="primary">{row.consumer_group}</Text>
                <Text as="div" size="xs" family="mono" color="secondary">{row.topic}</Text>
                <Text as="div" size="xs" color="bad">{labels.join(' · ')}</Text>
              </div>
            );
          })}
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text as="div" size="sm" weight="semibold" color="primary">Live error events</Text>
            <SectionFreshness snapshot={eventSnapshot} />
          </div>
          {liveErrors.length === 0 ? (
            <Text as="div" size="xs" color="tertiary">No live-events rows of type ERROR in the selected window.</Text>
          ) : liveErrors.map((row) => (
            <div key={row.event_id || row.id} data-testid="live-error-row" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
              <Text as="div" size="xs" color="bad">{severity.event}: {row.summary}</Text>
              <Text as="div" size="xs" family="mono" color="secondary">{row.source} · {row.topic}</Text>
              {row.correlation_id && <ErrorCorrelationButton correlationId={row.correlation_id} />}
            </div>
          ))}
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text as="div" size="sm" weight="semibold" color="primary">Runtime fingerprints</Text>
            <SectionFreshness snapshot={fingerprintSnapshot} />
          </div>
          {fingerprints.length === 0 ? (
            <div data-empty-state-reason={FINGERPRINT_EMPTY_REASON}>
              <Text as="div" size="xs" color="warn">Runtime error producer missing</Text>
              <Text as="div" size="xs" color="tertiary">
                runtime errors are not yet emitted as bus events; runtime-error-fingerprints returned zero rows.
              </Text>
            </div>
          ) : fingerprints.map((row) => (
            <div key={row.fingerprint} data-testid="fingerprint-error-row" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
              <Text as="div" size="xs" color="bad">{row.severity} · {row.message_template}</Text>
              <Text as="div" size="xs" family="mono" color="secondary">{row.service_name || 'service not recorded'} · {row.occurrence_count} occurrences</Text>
              {row.correlation_id && <ErrorCorrelationButton correlationId={row.correlation_id} />}
            </div>
          ))}
        </section>
      </div>
    </ComponentWrapper>
  );
}

export default function ErrorsWidget({ config = {} }: { config?: ErrorsWidgetConfig }) {
  const consumer = useProjectionSnapshotQuery<ConsumerFlowRow>({
    topic: TOPICS.consumerFlow,
    queryKey: ['lab-errors', 'consumer-flow'],
    refetchInterval: 5_000,
  });
  const events = useProjectionSnapshotQuery<LiveEventRow>({
    topic: TOPICS.liveEvents,
    queryKey: ['lab-errors', 'live-events'],
    refetchInterval: 5_000,
  });
  const fingerprints = useProjectionSnapshotQuery<RuntimeErrorFingerprintRow>({
    topic: TOPICS.runtimeErrorFingerprints,
    queryKey: ['lab-errors', 'runtime-error-fingerprints'],
    refetchInterval: 15_000,
  });

  return (
    <ErrorsView
      consumerSnapshot={consumer.data ?? emptySnapshot<ConsumerFlowRow>()}
      eventSnapshot={events.data ?? emptySnapshot<LiveEventRow>()}
      fingerprintSnapshot={fingerprints.data ?? emptySnapshot<RuntimeErrorFingerprintRow>()}
      config={config}
      isLoading={consumer.isLoading || events.isLoading || fingerprints.isLoading}
      error={consumer.error || events.error || fingerprints.error}
    />
  );
}
