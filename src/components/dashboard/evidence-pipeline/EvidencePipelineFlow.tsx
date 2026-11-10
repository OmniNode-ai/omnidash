import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, GitBranch, Radio, ShieldCheck } from '@/theme/design-system/icons';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { formatRedactedEventPayload } from '@/utils/redact-event-payload';
import {
  fetchEvidencePipelineSnapshot,
  openEvidenceLiveEventStream,
  type EvidenceAuthority,
  type EvidenceCorrelationTraceRow,
  type EvidenceFreshnessState,
  type EvidenceLiveEventRow,
  type EvidencePipelineSnapshot,
  type EvidenceReadinessRow,
  type EvidenceStageRow,
  type EvidenceSwimlane,
  type ProjectionEnvelope,
} from '@/services/evidence-pipeline-service';
import { localeString as fmtLocaleString } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in EvidencePipelineFlow.static.css.
import './EvidencePipelineFlow.static.css';

type StreamState = 'unavailable' | 'connected' | 'error';

const STATE_COLOR: Record<EvidenceFreshnessState | StreamState, string> = {
  CURRENT: 'var(--ds-status-ok)',
  STALE: 'var(--ds-warn)',
  DEGRADED: 'var(--ds-status-bad)',
  unavailable: 'var(--ds-ink-3)',
  connected: 'var(--ds-status-ok)',
  error: 'var(--ds-status-bad)',
};

const AUTHORITY_COLOR: Record<EvidenceAuthority, 'ok' | 'secondary' | 'tertiary'> = {
  authoritative: 'ok',
  supporting: 'secondary',
  advisory: 'tertiary',
};

function formatNumber(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return fmtLocaleString(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return fmtLocaleString(d);
}

function redactPayloadSummary(value: string): string {
  const redacted = formatRedactedEventPayload(value);
  return redacted.length > 180 ? `${redacted.slice(0, 177)}...` : redacted;
}

function FreshnessPill({ state }: { state: EvidenceFreshnessState }) {
  return (
    <span
      style={{
        border: `1px solid ${STATE_COLOR[state]}`,
        borderRadius: 4,
        padding: '2px 6px',
      }}
    >
      <Text as="span" size="xs" weight="bold" color="secondary" family="mono" transform="uppercase">
        {state}
      </Text>
    </span>
  );
}

function AuthorityBadge({ authority }: { authority: EvidenceAuthority }) {
  return (
    <Text className="evidence-pipeline-flow-s9bf617"
      as="span"
      size="xs"
      weight="bold"
      color={AUTHORITY_COLOR[authority]}
      family="mono"
      transform="uppercase"
    >
      {authority}
    </Text>
  );
}

function ProjectionFreshnessBanner({ envelopes }: { envelopes: ProjectionEnvelope<unknown>[] }) {
  const stale = envelopes.some((env) => env.freshness_state !== 'CURRENT' || env.degraded_reason);
  if (!stale) return null;
  const reason = envelopes.find((env) => env.degraded_reason)?.degraded_reason;
  return (
    <div className="evidence-pipeline-flow-s987253"
    >
      <Text size="sm" color="warn" weight="semibold">
        Projection freshness requires attention{reason ? `: ${reason}` : ''}
      </Text>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="evidence-pipeline-flow-s3088da">
      {icon}
      <Text size="md" weight="bold" color="primary">
        {title}
      </Text>
    </div>
  );
}

function StageFlow({ rows }: { rows: EvidenceStageRow[] }) {
  const swimlaneRows: Array<[EvidenceSwimlane, string]> = [
    ['evidence_pipeline', 'Evidence pipeline'],
    ['deployment_readiness', 'Deployment readiness'],
  ];

  return (
    <section className="evidence-pipeline-flow-s464b28">
      <SectionTitle icon={<GitBranch size={16} />} title="Stage flow" />
      <div className="evidence-pipeline-flow-s930d87">
        {swimlaneRows.map(([swimlane, label]) => {
          const stages = rows.filter((row) => row.swimlane === swimlane);
          return (
            <div className="evidence-pipeline-flow-s355eed" key={swimlane}>
              <Text size="xs" weight="bold" color="tertiary" family="mono" transform="uppercase">
                {label}
              </Text>
              <div className="evidence-pipeline-flow-s002b99">
                {stages.map((stage) => (
                  <div className="evidence-pipeline-flow-sf8c555"
                    key={`${stage.swimlane}-${stage.stage_id}`}
                    data-testid="evidence-stage-node"
                  >
                    <Text as="div" size="sm" weight="bold" color="primary" truncate>
                      {stage.stage_label}
                    </Text>
                    <Text className="evidence-pipeline-flow-sc71373" as="div" size="xl" weight="bold" color="primary" family="mono">
                      {formatNumber(stage.count)}
                    </Text>
                    <div className="evidence-pipeline-flow-sefda42">
                      <FreshnessPill state={stage.freshness_state} />
                      <AuthorityBadge authority={stage.authority} />
                    </div>
                    <Text className="evidence-pipeline-flow-s36ca0a" as="div" size="xs" color="tertiary" family="mono">
                      seq {formatNumber(stage.latest_ingest_sequence)}
                    </Text>
                  </div>
                ))}
                {stages.length === 0 && (
                  <Text size="sm" color="tertiary">
                    No projection rows for this swimlane
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CorrelationTrace({ rows }: { rows: EvidenceCorrelationTraceRow[] }) {
  const orderedRows = useMemo(
    () => [...rows].sort((a, b) => a.ingest_sequence - b.ingest_sequence),
    [rows],
  );
  const selected = orderedRows[0]?.correlation_id ?? null;
  const visibleRows = selected
    ? orderedRows.filter((row) => row.correlation_id === selected)
    : orderedRows;

  return (
    <section className="evidence-pipeline-flow-s464b28">
      <SectionTitle icon={<Activity size={16} />} title="Correlation trace" />
      <div className="evidence-pipeline-flow-s322450">
        {visibleRows.slice(0, 12).map((row) => (
          <div className="evidence-pipeline-flow-s905bf6"
            key={row.event_id}
            data-testid="evidence-trace-row"
          >
            <Text size="xs" color="tertiary" family="mono">
              #{row.ingest_sequence}
            </Text>
            <div>
              <Text as="div" size="sm" weight="semibold" color="primary" truncate>
                {row.stage_label}
              </Text>
              <Text as="div" size="xs" color="tertiary" family="mono" truncate>
                {row.correlation_id}
              </Text>
            </div>
            <Text size="xs" color={row.missing_classification ? 'warn' : 'secondary'} family="mono" transform="uppercase">
              {row.missing_classification ?? row.lifecycle_state}
            </Text>
            <Text size="xs" color="secondary" truncate>
              {redactPayloadSummary(row.payload_summary)}
            </Text>
          </div>
        ))}
        {visibleRows.length === 0 && (
          <div className="evidence-pipeline-flow-s801160">
            <Text size="sm" color="tertiary">No correlation projection rows</Text>
          </div>
        )}
      </div>
    </section>
  );
}

function ReadinessAggregate({ rows }: { rows: EvidenceReadinessRow[] }) {
  return (
    <section className="evidence-pipeline-flow-s464b28">
      <SectionTitle icon={<ShieldCheck size={16} />} title="Readiness aggregate" />
      <div className="evidence-pipeline-flow-scb6b1a">
        {rows.slice(0, 6).map((row) => (
          <div className="evidence-pipeline-flow-sf8c555"
            key={row.deployment_id}
            data-testid="evidence-readiness-card"
          >
            <div className="evidence-pipeline-flow-s6d9e63">
              <Text size="sm" weight="bold" color="primary" truncate>
                {row.deployment_id}
              </Text>
              <FreshnessPill state={row.freshness_state} />
            </div>
            <Text className="evidence-pipeline-flow-s36ca0a" as="div" size="lg" weight="bold" color={row.readiness_state === 'READY' ? 'ok' : 'warn'} transform="uppercase">
              {row.readiness_state}
            </Text>
            <Text className="evidence-pipeline-flow-sc71373" as="div" size="xs" color="tertiary" family="mono">
              Evidence: {row.evidence_pipeline_state}
            </Text>
            <Text className="evidence-pipeline-flow-s36ca0a" as="div" size="xs" color="secondary">
              {row.blocking_reasons.length > 0 ? row.blocking_reasons.join(', ') : 'No blocking reasons in projection'}
            </Text>
          </div>
        ))}
        {rows.length === 0 && (
          <Text size="sm" color="tertiary">No readiness projection rows</Text>
        )}
      </div>
    </section>
  );
}

function ObservationalEventStream({ rows }: { rows: EvidenceLiveEventRow[] }) {
  const [filter, setFilter] = useState('');
  const orderedRows = useMemo(
    () => [...rows].sort((a, b) => a.ingest_sequence - b.ingest_sequence),
    [rows],
  );
  const filteredRows = orderedRows.filter((row) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [
      row.topic,
      row.correlation_id,
      row.ticket_id,
      row.lifecycle_state,
      row.severity,
      row.payload_summary,
    ].some((value) => String(value ?? '').toLowerCase().includes(q));
  });

  return (
    <section className="evidence-pipeline-flow-s464b28">
      <SectionTitle icon={<Radio size={16} />} title="Observational event stream" />
      <Text size="xs" color="tertiary">
        Observational/debugging surface only - authoritative state remains reducer-backed projections.
      </Text>
      <input
        aria-label="Filter evidence event stream"
        className="text-input-md evidence-pipeline-flow-s85c820"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter topic, correlation, ticket, lifecycle, severity"
      />
      <div className="evidence-pipeline-flow-s872826">
        {filteredRows.slice(0, 50).map((row) => (
          <div className="evidence-pipeline-flow-s78af44"
            key={row.event_id}
            data-testid="evidence-live-event-row"
          >
            <Text size="xs" color="tertiary" family="mono">
              #{row.ingest_sequence}
            </Text>
            <div>
              <Text as="div" size="xs" color="brand" family="mono" truncate>
                {row.topic}
              </Text>
              <Text as="div" size="xs" color="tertiary" family="mono" truncate>
                {row.correlation_id ?? 'no correlation'} · {row.ticket_id ?? 'no ticket'}
              </Text>
            </div>
            <Text size="xs" color={row.severity === 'ERROR' || row.severity === 'BLOCKING' ? 'bad' : row.severity === 'WARNING' ? 'warn' : 'secondary'} family="mono" transform="uppercase">
              {row.severity}
            </Text>
            <Text size="xs" color="secondary" truncate>
              {redactPayloadSummary(row.payload_summary)}
            </Text>
          </div>
        ))}
        {filteredRows.length === 0 && (
          <div className="evidence-pipeline-flow-s801160">
            <Text size="sm" color="tertiary">No matching event projection rows</Text>
          </div>
        )}
      </div>
    </section>
  );
}

function hasProjectionRows(snapshot: EvidencePipelineSnapshot | undefined): boolean {
  if (!snapshot) return false;
  return [
    snapshot.stages.rows,
    snapshot.correlations.rows,
    snapshot.readiness.rows,
    snapshot.liveEvents.rows,
  ].some((rows) => rows.length > 0);
}

export default function EvidencePipelineFlow({ config: _config }: { config: Record<string, unknown> }) {
  const [streamState, setStreamState] = useState<StreamState>('unavailable');
  const { data, isLoading, error } = useQuery({
    queryKey: ['evidence-pipeline-flow'],
    queryFn: () => fetchEvidencePipelineSnapshot(),
    refetchInterval: refreshInterval(),
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = openEvidenceLiveEventStream(() => setStreamState('connected'));
    if (!source) return;
    source.addEventListener('open', () => setStreamState('connected'));
    source.addEventListener('error', () => setStreamState('error'));
    return () => source.close();
  }, []);

  const envelopes = data
    ? [data.stages, data.correlations, data.readiness, data.liveEvents]
    : [];
  const observedAt = data?.stages.observed_at ?? data?.readiness.observed_at ?? null;

  return (
    <ComponentWrapper
      title="Evidence Pipeline Flow"
      isLoading={isLoading}
      error={error instanceof Error ? error : undefined}
      isEmpty={!hasProjectionRows(data)}
      emptyMessage="No evidence pipeline projections"
      emptyHint="Stage, trace, readiness, and event rows appear after projection API snapshots are emitted"
      isLive={streamState === 'connected'}
      headerExtra={
        <span className="evidence-pipeline-flow-s3e5458">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[streamState] }} />
          <Text size="xs" color="tertiary" family="mono">
            SSE {streamState} · snapshot {formatDateTime(observedAt)}
          </Text>
        </span>
      }
    >
      {data && (
        <div className="evidence-pipeline-flow-sb31902">
          <ProjectionFreshnessBanner envelopes={envelopes} />
          <StageFlow rows={data.stages.rows} />
          <CorrelationTrace rows={data.correlations.rows} />
          <ReadinessAggregate rows={data.readiness.rows} />
          <ObservationalEventStream rows={data.liveEvents.rows} />
        </div>
      )}
    </ComponentWrapper>
  );
}
