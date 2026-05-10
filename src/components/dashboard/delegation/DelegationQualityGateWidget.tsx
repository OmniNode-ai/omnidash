/* eslint-disable local/no-typography-inline -- OMN-10624 prototype widget */
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';

// ── Projection types (from delegation_events SQLite table, OMN-10623) ─

export type CheckType = 'deterministic' | 'heuristic' | 'unknown';

export interface QualityGateCheckRow {
  check_type: CheckType;
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

export interface FailureCategoryRow {
  category: string;
  count: number;
  pct_of_failures: number;
}

export interface TokensToComplianceByModelRow {
  model_name: string;
  avg_tokens: number;
  avg_attempts: number;
  sample_count: number;
}

export interface DelegationQualityGateProjection {
  overall_pass_rate: number;
  total_passed: number;
  total_failed: number;
  total_checks: number;
  escalation_count: number;
  escalation_rate: number;
  by_check_type: QualityGateCheckRow[];
  failure_categories: FailureCategoryRow[];
  // Tokens-to-compliance KPIs (OMN-10795). Optional because older
  // projection rows pre-compliance-loop omit these fields.
  avg_tokens_to_compliance?: number;
  median_tokens_to_compliance?: number;
  avg_compliance_attempts?: number;
  tokens_to_compliance_by_model?: TokensToComplianceByModelRow[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationQualityGateConfig {
  passThreshold?: number;
  showFailureCategories?: boolean;
  /** Threshold above which avg tokens-to-compliance is shown as warn tone. */
  tokensToComplianceWarnThreshold?: number;
}

// ── Check type bar ────────────────────────────────────────────────────

const CHECK_TYPE_LABEL: Record<CheckType, string> = {
  deterministic: 'Deterministic',
  heuristic: 'Heuristic',
  unknown: 'Unknown',
};

function CheckTypeRow({ row, passThreshold }: { row: QualityGateCheckRow; passThreshold: number }) {
  const passColor = row.pass_rate >= passThreshold ? 'var(--good)' : 'var(--warn)';
  const failPct = (1 - row.pass_rate) * 100;
  const passPct = row.pass_rate * 100;

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr 60px 80px 60px',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Text as="span" size="sm" weight="semibold" color="primary">
          {CHECK_TYPE_LABEL[row.check_type]}
        </Text>
        {/* Pass/fail stacked bar */}
        <div style={{ height: 8, borderRadius: 4, background: 'var(--panel-2)', overflow: 'hidden', display: 'flex' }}>
          <div
            style={{
              width: `${passPct}%`,
              background: 'var(--good)',
              transition: 'width 0.6s ease-out',
            }}
          />
          <div
            style={{
              width: `${failPct}%`,
              background: 'var(--error, var(--warn))',
              transition: 'width 0.6s ease-out',
            }}
          />
        </div>
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: passColor }}>
          {(row.pass_rate * 100).toFixed(1)}%
        </Text>
        {/* Inline pass / fail fraction: "N pass / M fail" */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'center' }}>
          <Text as="span" size="xs" family="mono" tabularNums style={{ color: 'var(--good)' }}>
            {row.passed}✓
          </Text>
          <Text as="span" size="xs" color="tertiary">/</Text>
          <Text as="span" size="xs" family="mono" tabularNums style={{ color: 'var(--error, var(--warn))' }}>
            {row.failed}✗
          </Text>
        </div>
        <Text as="span" size="xs" family="mono" tabularNums color="tertiary" style={{ textAlign: 'right' }}>
          {row.total}
        </Text>
      </div>
    </div>
  );
}

// ── Failure categories ────────────────────────────────────────────────

function FailureCategories({ categories }: { categories: FailureCategoryRow[] }) {
  if (categories.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <Text as="div" size="xs" color="tertiary" weight="semibold" style={{ marginBottom: 6 }}>
        Failure categories
      </Text>
      {categories.map((c) => (
        <div
          key={c.category}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 40px 80px',
            gap: 8,
            padding: '3px 0',
            alignItems: 'center',
          }}
        >
          <Text as="span" size="sm" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.category}
          </Text>
          <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
            {c.count}
          </Text>
          {/* Proportion bar */}
          <div style={{ height: 6, borderRadius: 3, background: 'var(--panel-2)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, c.pct_of_failures * 100))}%`,
                background: 'var(--error, var(--warn))',
                borderRadius: 3,
                transition: 'width 0.6s ease-out',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tokens-to-compliance per-model breakdown ─────────────────────────

function TokensToComplianceByModel({ rows }: { rows: TokensToComplianceByModelRow[] }) {
  if (rows.length === 0) return null;
  // Sort by avg_tokens ascending (most efficient model first).
  const sorted = [...rows].sort((a, b) => a.avg_tokens - b.avg_tokens);
  return (
    <div style={{ marginTop: 12 }}>
      <Text as="div" size="xs" color="tertiary" weight="semibold" style={{ marginBottom: 6 }}>
        Tokens-to-compliance by model
      </Text>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 80px 60px',
          gap: 8,
          paddingBottom: 4,
          borderBottom: '1px solid var(--line)',
        }}
      >
        {(['Model', 'Avg Tokens', 'Avg Attempts', 'Samples'] as const).map((h, i) => (
          <Text
            key={h}
            as="span"
            size="xs"
            color="tertiary"
            style={{ textAlign: i === 0 ? 'left' : 'right' }}
          >
            {h}
          </Text>
        ))}
      </div>
      {sorted.map((row) => (
        <div
          key={row.model_name}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px 60px',
            gap: 8,
            padding: '4px 0',
            borderBottom: '1px solid var(--line-2)',
            alignItems: 'center',
          }}
        >
          <Text
            as="span"
            size="sm"
            family="mono"
            color="primary"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {row.model_name}
          </Text>
          <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
            {Math.round(row.avg_tokens).toLocaleString()}
          </Text>
          <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
            {row.avg_attempts.toFixed(2)}
          </Text>
          <Text as="span" size="xs" family="mono" tabularNums color="tertiary" style={{ textAlign: 'right' }}>
            {row.sample_count}
          </Text>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationQualityGateWidget(props: { config: DelegationQualityGateConfig }) {
  const { config } = props;
  const passThreshold = config.passThreshold ?? 0.8;
  const showFailureCategories = config.showFailureCategories ?? true;
  const tokensWarnThreshold = config.tokensToComplianceWarnThreshold ?? 5_000;

  const { data, isLoading, error } = useProjectionQuery<DelegationQualityGateProjection>({
    queryKey: ['delegation-quality-gate', TOPICS.delegationQualityGate],
    topic: TOPICS.delegationQualityGate,
    refetchInterval: 5_000,
  });

  const projection = useMemo<DelegationQualityGateProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const passRateTone = useMemo(() => {
    if (!projection) return 'default' as const;
    return projection.overall_pass_rate >= passThreshold ? 'good' as const : 'warn' as const;
  }, [projection, passThreshold]);

  const tokensTone = useMemo(() => {
    if (!projection?.avg_tokens_to_compliance) return 'default' as const;
    return projection.avg_tokens_to_compliance <= tokensWarnThreshold
      ? 'good' as const
      : 'warn' as const;
  }, [projection, tokensWarnThreshold]);

  const hasComplianceMetrics =
    projection != null &&
    (projection.avg_tokens_to_compliance != null ||
      projection.avg_compliance_attempts != null ||
      (projection.tokens_to_compliance_by_model?.length ?? 0) > 0);

  const isEmpty = !projection || projection.total_checks === 0;

  return (
    <ComponentWrapper
      title="Quality Gate"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No quality gate data"
      emptyHint="Quality gate data appears once delegation events with gate checks are recorded"
    >
      {projection && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <KPI
              label="Pass rate"
              value={Math.round(projection.overall_pass_rate * 100)}
              suffix="%"
              tone={passRateTone}
            />
            <KPI
              label="Passed"
              value={projection.total_passed}
              tone="good"
            />
            <KPI
              label="Failed"
              value={projection.total_failed}
              tone={projection.total_failed > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Tokens-to-compliance KPIs (OMN-10795) — only shown when projection carries the fields */}
          {hasComplianceMetrics && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                paddingBottom: 12,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <KPI
                label="Avg tokens to compliance"
                value={
                  projection.avg_tokens_to_compliance != null
                    ? Math.round(projection.avg_tokens_to_compliance)
                    : 0
                }
                tone={tokensTone}
              />
              <KPI
                label="Avg attempts"
                value={
                  projection.avg_compliance_attempts != null
                    ? Number(projection.avg_compliance_attempts.toFixed(2))
                    : 0
                }
                tone={
                  projection.avg_compliance_attempts != null &&
                  projection.avg_compliance_attempts > 1.5
                    ? 'warn'
                    : 'default'
                }
              />
            </div>
          )}

          {/* Escalation banner — only shown when escalation_count > 0 */}
          {projection.escalation_count > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)',
                borderRadius: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text as="span" size="sm" weight="semibold" style={{ color: 'var(--warn)' }}>
                  ⚠ Escalations
                </Text>
                <Text as="span" size="xs" color="secondary">
                  {projection.escalation_count} delegation{projection.escalation_count !== 1 ? 's' : ''} required human escalation
                </Text>
              </div>
              <Text as="span" size="sm" family="mono" tabularNums weight="semibold" style={{ color: 'var(--warn)' }}>
                {(projection.escalation_rate * 100).toFixed(1)}% rate
              </Text>
            </div>
          )}

          {/* Per-check-type breakdown */}
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 60px 80px 60px',
                gap: 8,
                paddingBottom: 4,
                borderBottom: '1px solid var(--line)',
              }}
            >
              {(['Type', 'Pass/Fail bar', 'Rate', 'Pass / Fail', 'Total'] as const).map((h, i) => (
                <Text
                  key={h}
                  as="span"
                  size="xs"
                  color="tertiary"
                  style={{ textAlign: i === 0 ? 'left' : 'right' }}
                >
                  {h}
                </Text>
              ))}
            </div>
            {projection.by_check_type.map((row) => (
              <CheckTypeRow key={row.check_type} row={row} passThreshold={passThreshold} />
            ))}
          </div>

          {/* Failure categories */}
          {showFailureCategories && (
            <FailureCategories categories={projection.failure_categories} />
          )}

          {/* Tokens-to-compliance per-model breakdown (OMN-10795) */}
          {projection.tokens_to_compliance_by_model && (
            <TokensToComplianceByModel rows={projection.tokens_to_compliance_by_model} />
          )}

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
