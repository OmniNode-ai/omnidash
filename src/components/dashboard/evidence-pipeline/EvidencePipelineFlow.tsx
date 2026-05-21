import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, GitBranch, Radio, ShieldCheck } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
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

type StreamState = 'unavailable' | 'connected' | 'error';

const STATE_COLOR: Record<EvidenceFreshnessState | StreamState, string> = {
  CURRENT: 'var(--status-ok)',
  STALE: 'var(--status-warn)',
  DEGRADED: 'var(--status-bad)',
  unavailable: 'var(--text-tertiary)',
  connected: 'var(--status-ok)',
  error: 'var(--status-bad)',
};

const AUTHORITY_COLOR: Record<EvidenceAuthority, 'ok' | 'secondary' | 'tertiary'> = {
  authoritative: 'ok',
  supporting: 'secondary',
  advisory: 'tertiary',
};

function formatNumber(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return value.toLocaleString();
}

function formatDateTime(value: string | null): string {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString();
}

function redactPayloadSummary(value: string): string {
  const redacted = value
    .replace(/(api[_-]?key|token|secret|password)=([^,\s]+)/gi, '$1=[redacted]')
    .replace(/("(?:api[_-]?key|token|secret|password)"\s*:\s*)"[^"]+"/gi, '$1"[redacted]"');
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
    <Text
      as="span"
      size="xs"
      weight="bold"
      color={AUTHORITY_COLOR[authority]}
      family="mono"
      transform="uppercase"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: '2px 6px',
        background: 'var(--panel-2)',
      }}
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
    <div
      style={{
        border: '1px solid var(--status-warn)',
        borderRadius: 6,
        padding: '8px 10px',
        background: 'var(--panel-2)',
      }}
    >
      <Text size="sm" color="warn" weight="semibold">
        Projection freshness requires attention{reason ? `: ${reason}` : ''}
      </Text>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionTitle icon={<GitBranch size={16} />} title="Stage flow" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {swimlaneRows.map(([swimlane, label]) => {
          const stages = rows.filter((row) => row.swimlane === swimlane);
          return (
            <div key={swimlane} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Text size="xs" weight="bold" color="tertiary" family="mono" transform="uppercase">
                {label}
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
                {stages.map((stage) => (
                  <div
                    key={`${stage.swimlane}-${stage.stage_id}`}
                    data-testid="evidence-stage-node"
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: 10,
                      background: 'var(--panel-2)',
                    }}
                  >
                    <Text as="div" size="sm" weight="bold" color="primary" truncate>
                      {stage.stage_label}
                    </Text>
                    <Text as="div" size="xl" weight="bold" color="primary" family="mono" style={{ marginTop: 4 }}>
                      {formatNumber(stage.count)}
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <FreshnessPill state={stage.freshness_state} />
                      <AuthorityBadge authority={stage.authority} />
                    </div>
                    <Text as="div" size="xs" color="tertiary" family="mono" style={{ marginTop: 8 }}>
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionTitle icon={<Activity size={16} />} title="Correlation trace" />
      <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
        {visibleRows.slice(0, 12).map((row) => (
          <div
            key={row.event_id}
            data-testid="evidence-trace-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '72px minmax(120px, 1fr) 110px minmax(160px, 2fr)',
              gap: 10,
              padding: '8px 10px',
              borderBottom: '1px solid var(--line-2)',
              alignItems: 'center',
            }}
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
          <div style={{ padding: 10 }}>
            <Text size="sm" color="tertiary">No correlation projection rows</Text>
          </div>
        )}
      </div>
    </section>
  );
}

function ReadinessAggregate({ rows }: { rows: EvidenceReadinessRow[] }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionTitle icon={<ShieldCheck size={16} />} title="Readiness aggregate" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
        {rows.slice(0, 6).map((row) => (
          <div
            key={row.deployment_id}
            data-testid="evidence-readiness-card"
            style={{
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
              background: 'var(--panel-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <Text size="sm" weight="bold" color="primary" truncate>
                {row.deployment_id}
              </Text>
              <FreshnessPill state={row.freshness_state} />
            </div>
            <Text as="div" size="lg" weight="bold" color={row.readiness_state === 'READY' ? 'ok' : 'warn'} transform="uppercase" style={{ marginTop: 8 }}>
              {row.readiness_state}
            </Text>
            <Text as="div" size="xs" color="tertiary" family="mono" style={{ marginTop: 4 }}>
              Evidence: {row.evidence_pipeline_state}
            </Text>
            <Text as="div" size="xs" color="secondary" style={{ marginTop: 8 }}>
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionTitle icon={<Radio size={16} />} title="Observational event stream" />
      <Text size="xs" color="tertiary">
        Observational/debugging surface only - authoritative state remains reducer-backed projections.
      </Text>
      <input
        aria-label="Filter evidence event stream"
        className="text-input-md"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter topic, correlation, ticket, lifecycle, severity"
        style={{
          border: '1px solid var(--line)',
          borderRadius: 6,
          padding: '8px 10px',
          background: 'var(--panel)',
        }}
      />
      <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
        {filteredRows.slice(0, 50).map((row) => (
          <div
            key={row.event_id}
            data-testid="evidence-live-event-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '72px minmax(160px, 1fr) 100px minmax(180px, 2fr)',
              gap: 10,
              padding: '8px 10px',
              borderBottom: '1px solid var(--line-2)',
              alignItems: 'center',
            }}
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
          <div style={{ padding: 10 }}>
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
    refetchInterval: 15_000,
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[streamState] }} />
          <Text size="xs" color="tertiary" family="mono">
            SSE {streamState} · snapshot {formatDateTime(observedAt)}
          </Text>
        </span>
      }
    >
      {data && (
        <div style={{ display: 'grid', gap: 18 }}>
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
