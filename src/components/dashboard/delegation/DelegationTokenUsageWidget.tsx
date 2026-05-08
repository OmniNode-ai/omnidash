/* eslint-disable local/no-typography-inline -- OMN-10624 prototype widget */
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { useThemeColors } from '@/theme';

// ── Projection types (from llm_call_metrics SQLite table, OMN-10623) ─

export type TokenProvenance = 'measured' | 'estimated' | 'unknown';

export interface ModelTokenRow {
  model_id: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  usage_source: TokenProvenance;
  token_provenance: TokenProvenance;
}

export interface DelegationTokenUsageProjection {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  provenance_summary: Record<TokenProvenance, number>;
  by_model: ModelTokenRow[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationTokenUsageConfig {
  showCost?: boolean;
  showProvenance?: boolean;
}

// ── Provenance badge ──────────────────────────────────────────────────

const PROVENANCE_COLOR: Record<TokenProvenance, string> = {
  measured: 'var(--good)',
  estimated: 'var(--warn)',
  unknown: 'var(--ink-4)',
};

const PROVENANCE_LABEL: Record<TokenProvenance, string> = {
  measured: 'measured',
  estimated: 'estimated',
  unknown: 'unknown',
};

function ProvenanceBadge({ provenance }: { provenance: TokenProvenance }) {
  return (
    <Text
      as="span"
      size="xs"
      weight="bold"
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 3,
        color: PROVENANCE_COLOR[provenance],
        border: `1px solid ${PROVENANCE_COLOR[provenance]}`,
        opacity: 0.85,
      }}
    >
      {PROVENANCE_LABEL[provenance]}
    </Text>
  );
}

// ── Token formatters ──────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function fmtUsd(v: number): string {
  return v === 0 ? '$0.00' : `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

// ── Per-model row ─────────────────────────────────────────────────────

function ModelTokenRow({
  row,
  maxTokens,
  color,
  showCost,
  showProvenance,
}: {
  row: ModelTokenRow;
  maxTokens: number;
  color: string;
  showCost: boolean;
  showProvenance: boolean;
}) {
  const widthPct = maxTokens > 0 ? (row.total_tokens / maxTokens) * 100 : 0;

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showCost ? '1fr 80px 80px 72px' : '1fr 80px 80px',
          gap: 8,
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: color,
              flex: '0 0 auto',
            }}
          />
          <Text as="span" size="sm" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.model_name}
          </Text>
        </div>
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
          {fmtTokens(row.prompt_tokens)}
        </Text>
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
          {fmtTokens(row.completion_tokens)}
        </Text>
        {showCost && (
          <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: 'var(--warn)' }}>
            {fmtUsd(row.estimated_cost_usd)}
          </Text>
        )}
      </div>
      {/* Token bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: 'var(--panel-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${widthPct}%`,
              background: color,
              borderRadius: 3,
              transition: 'width 0.6s ease-out',
            }}
          />
        </div>
        <Text as="span" size="xs" family="mono" tabularNums color="secondary" style={{ flex: '0 0 52px', textAlign: 'right' }}>
          {fmtTokens(row.total_tokens)}
        </Text>
        {showProvenance && <ProvenanceBadge provenance={row.token_provenance} />}
      </div>
    </div>
  );
}

// ── Provenance summary ────────────────────────────────────────────────

function ProvenanceSummary({ summary, total }: { summary: Record<TokenProvenance, number>; total: number }) {
  if (total === 0) return null;
  const provenances: TokenProvenance[] = ['measured', 'estimated', 'unknown'];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
      {provenances.map((p) => {
        const count = summary[p] ?? 0;
        if (count === 0) return null;
        return (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ProvenanceBadge provenance={p} />
            <Text as="span" size="xs" family="mono" tabularNums color="secondary">
              {((count / total) * 100).toFixed(0)}%
            </Text>
          </div>
        );
      })}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationTokenUsageWidget(props: { config: DelegationTokenUsageConfig }) {
  const { config } = props;
  const showCost = config.showCost ?? true;
  const showProvenance = config.showProvenance ?? true;

  const { data, isLoading, error } = useProjectionQuery<DelegationTokenUsageProjection>({
    queryKey: ['delegation-token-usage', TOPICS.delegationTokenUsage],
    topic: TOPICS.delegationTokenUsage,
    refetchInterval: 5_000,
  });

  const projection = useMemo<DelegationTokenUsageProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const colors = useThemeColors();

  const sorted = useMemo(() => {
    if (!projection) return [];
    return [...projection.by_model].sort((a, b) => b.total_tokens - a.total_tokens);
  }, [projection]);

  const maxTokens = useMemo(() => {
    if (sorted.length === 0) return 1;
    return Math.max(1, sorted[0].total_tokens);
  }, [sorted]);

  const totalModels = useMemo(() => {
    if (!projection) return 0;
    return new Set(projection.by_model.map((r) => r.model_id)).size;
  }, [projection]);

  const isEmpty = !projection || projection.total_tokens === 0;

  return (
    <ComponentWrapper
      title="Token Usage"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No token usage data"
      emptyHint="Token usage data appears once LLM call metrics are recorded"
    >
      {projection && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showCost ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <KPI
              label="Total tokens"
              value={projection.total_tokens}
              tone="default"
              caption={fmtTokens(projection.total_tokens)}
            />
            <KPI
              label="Prompt"
              value={projection.total_prompt_tokens}
              tone="default"
              caption={fmtTokens(projection.total_prompt_tokens)}
            />
            <KPI
              label="Completion"
              value={projection.total_completion_tokens}
              tone="default"
              caption={fmtTokens(projection.total_completion_tokens)}
            />
            {showCost && (
              <KPI
                label="Est. cost"
                value={projection.total_estimated_cost_usd}
                prefix="$"
                decimals={2}
                tone="default"
              />
            )}
          </div>

          {/* Provenance summary */}
          {showProvenance && (
            <ProvenanceSummary summary={projection.provenance_summary} total={totalModels} />
          )}

          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showCost ? '1fr 80px 80px 72px' : '1fr 80px 80px',
              gap: 8,
              paddingBottom: 4,
              borderBottom: '1px solid var(--line)',
            }}
          >
            {(['Model', 'Prompt', 'Compl.', ...(showCost ? ['Cost'] : [])] as const).map((h, i) => (
              <Text key={h} as="span" size="xs" color="tertiary" style={{ textAlign: i === 0 ? 'left' : 'right' }}>
                {h}
              </Text>
            ))}
          </div>

          {/* Per-model rows */}
          {sorted.map((row, i) => (
            <ModelTokenRow
              key={row.model_id}
              row={row}
              maxTokens={maxTokens}
              color={colors.chart[i % colors.chart.length]}
              showCost={showCost}
              showProvenance={showProvenance}
            />
          ))}

          {!projection.provisioned && (
            <Text as="div" size="xs" color="tertiary" style={{ marginTop: 4, fontStyle: 'italic' }}>
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10623).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
