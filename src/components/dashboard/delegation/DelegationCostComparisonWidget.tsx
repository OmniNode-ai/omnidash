import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { useDelegationRunContextOptional } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import type { DelegationSavingsProjection, DelegationSavingsSession } from './DelegationSavingsWidget';

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationCostComparisonConfig {
  maxRows?: number;
  showProvenance?: boolean;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtUsd(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtTokens(v: number | undefined): string {
  if (v == null || v === 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtMs(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}

function shortSession(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// ── Provenance badge ──────────────────────────────────────────────────

type ProvenanceKind = 'measured' | 'estimated' | 'unknown';

function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const color = kind === 'measured' ? 'var(--color-ok, #22c55e)' : kind === 'estimated' ? '#d97706' : 'var(--text-tertiary)';
  return (
    <Text
      as="span"
      size="xs"
      family="mono"
      style={{
        padding: '0px 4px',
        borderRadius: 3,
        border: `1px solid ${color}`,
        color,
        opacity: 0.85,
      }}
    >
      {kind}
    </Text>
  );
}

// ── Session row ───────────────────────────────────────────────────────

const COLS = '1fr 1.1fr 0.8fr 0.8fr 0.8fr 0.9fr 0.9fr 0.9fr 0.7fr';

function SessionRow({
  session,
  index,
  showProvenance,
}: {
  session: DelegationSavingsSession;
  index: number;
  showProvenance: boolean;
}) {
  const totalTokens = (session.prompt_tokens ?? 0) + (session.completion_tokens ?? 0);
  const delta = session.savings_usd ?? 0;
  const deltaColor = delta > 0 ? 'ok' : delta < 0 ? 'bad' : 'secondary';

  return (
    <div
      data-testid="cost-comparison-row"
      style={{
        display: 'grid',
        gridTemplateColumns: COLS,
        gap: 8,
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid var(--line-2)',
        background: index % 2 === 0 ? 'transparent' : 'var(--panel-1)',
      }}
    >
      <Text as="span" size="xs" family="mono" color="secondary" title={session.session_id}>
        {shortSession(session.session_id)}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.task_type ?? '—'}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.model_name ?? '—'}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {fmtTokens(totalTokens)}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {fmtMs(session.latency_ms)}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {fmtUsd(session.local_cost_usd)}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {fmtUsd(session.cloud_cost_usd)}
      </Text>
      <Text as="span" size="xs" family="mono" color={deltaColor}>
        {delta > 0 ? '+' : ''}{fmtUsd(delta)}
      </Text>
      {showProvenance ? (
        <ProvenanceBadge kind={(session.usage_source ?? session.savings_method ?? 'unknown') as ProvenanceKind} />
      ) : (
        <span />
      )}
    </div>
  );
}

// ── Summary KPI bar ───────────────────────────────────────────────────

function SummaryBar({ projection }: { projection: DelegationSavingsProjection }) {
  const totalTokens = projection.sessions.reduce(
    (sum, s) => sum + (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0),
    0,
  );
  const measuredCount = projection.sessions.filter((s) => (s.usage_source ?? s.savings_method) === 'measured').length;
  const estimatedCount = projection.sessions.length - measuredCount;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <KPI label="Cumulative savings" value={projection.cumulative_savings_usd} prefix="$" decimals={2} tone="good" />
      <KPI label="Local cost" value={projection.cumulative_local_cost_usd} prefix="$" decimals={2} />
      <KPI label="Cloud baseline" value={projection.cumulative_cloud_cost_usd} prefix="$" decimals={2} />
      <KPI label="Sessions" value={projection.session_count} />
      <KPI label="Total tokens" value={totalTokens} />
      <KPI label="Measured" value={measuredCount} caption={`${estimatedCount} estimated`} tone={measuredCount > 0 ? 'good' : 'warn'} />
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationCostComparisonWidget({
  config,
}: {
  config: DelegationCostComparisonConfig;
}) {
  const maxRows = Math.max(1, Math.trunc(config.maxRows ?? 20));
  const showProvenance = config.showProvenance !== false;

  const runCtx = useDelegationRunContextOptional();
  const dataSourceMode = useDataSourceMode();

  const { data, isLoading: queryLoading, error: queryError } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['delegation-cost-comparison', TOPICS.delegationSavings],
    topic: TOPICS.delegationSavings,
    refetchInterval: 10_000,
    enabled: !runCtx,
  });

  const isLoading = runCtx ? runCtx.snapshot.isLoading : queryLoading;
  const error = runCtx ? runCtx.snapshot.primaryError : queryError;
  const projection = runCtx ? runCtx.snapshot.savings : (data?.[0] ?? null);

  const [sortKey, setSortKey] = useState<'savings' | 'tokens' | 'date'>('date');

  const sortedSessions = useMemo(() => {
    if (!projection?.sessions) return [];
    const rows = [...projection.sessions];
    if (sortKey === 'savings') {
      rows.sort((a, b) => (b.savings_usd ?? 0) - (a.savings_usd ?? 0));
    } else if (sortKey === 'tokens') {
      const total = (s: DelegationSavingsSession) => (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0);
      rows.sort((a, b) => total(b) - total(a));
    } else {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return rows.slice(0, maxRows);
  }, [projection, sortKey, maxRows]);

  const isEmpty = !projection || projection.session_count === 0;

  return (
    <ComponentWrapper
      title="Delegation Cost Comparison"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No cost comparison data"
      emptyHint="Cost comparison appears once delegation sessions with savings_estimates are recorded."
      isLive={isLiveDataSource(dataSourceMode)}
    >
      {projection && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <SummaryBar projection={projection} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Text as="span" size="xs" color="tertiary">Sort by:</Text>
            {(['date', 'savings', 'tokens'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortKey(k)}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  background: sortKey === k ? 'var(--panel-2)' : 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Text as="span" size="xs" color={sortKey === k ? 'primary' : 'tertiary'}>{k}</Text>
              </button>
            ))}
            <Text as="span" size="xs" family="mono" color="tertiary" style={{ marginLeft: 'auto' }}>
              baseline: {projection.baseline_model} · manifest: {projection.pricing_manifest_version}
            </Text>
          </div>

          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 8,
              paddingBottom: 5,
              borderBottom: '1px solid var(--line)',
            }}
          >
            {['Session', 'Task', 'Model', 'Tokens', 'Latency', 'Local $', 'Cloud $', 'Saved', showProvenance ? 'Source' : ''].map((h) => (
              <Text key={h || '_src'} as="span" size="xs" color="tertiary">{h}</Text>
            ))}
          </div>

          {sortedSessions.map((s, i) => (
            <SessionRow key={s.session_id} session={s} index={i} showProvenance={showProvenance} />
          ))}

          {projection.sessions.length > maxRows && (
            <Text as="div" size="xs" color="tertiary" style={{ marginTop: 6 }}>
              Showing {maxRows} of {projection.sessions.length}; increase maxRows in config.
            </Text>
          )}

          {showProvenance && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
              <Text as="span" size="xs" color="tertiary">Provenance:</Text>
              <ProvenanceBadge kind="measured" />
              <Text as="span" size="xs" color="tertiary">— token counts from llm_call_metrics</Text>
              <ProvenanceBadge kind="estimated" />
              <Text as="span" size="xs" color="tertiary">— savings inferred from routing rule</Text>
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
