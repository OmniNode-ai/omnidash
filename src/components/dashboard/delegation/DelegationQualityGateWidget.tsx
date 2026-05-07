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

export interface DelegationQualityGateProjection {
  overall_pass_rate: number;
  total_passed: number;
  total_failed: number;
  total_checks: number;
  escalation_count: number;
  escalation_rate: number;
  by_check_type: QualityGateCheckRow[];
  failure_categories: FailureCategoryRow[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationQualityGateConfig {
  passThreshold?: number;
  showFailureCategories?: boolean;
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
          gridTemplateColumns: '120px 1fr 60px 60px 60px',
          gap: 8,
          alignItems: 'center',
          marginBottom: 4,
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
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: 'var(--good)' }}>
          {row.passed}
        </Text>
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: 'var(--error, var(--warn))' }}>
          {row.failed}
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

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationQualityGateWidget(props: { config: DelegationQualityGateConfig }) {
  const { config } = props;
  const passThreshold = config.passThreshold ?? 0.8;
  const showFailureCategories = config.showFailureCategories ?? true;

  const { data, isLoading, error } = useProjectionQuery<DelegationQualityGateProjection>({
    queryKey: ['delegation-quality-gate', TOPICS.delegationQualityGate],
    topic: TOPICS.delegationQualityGate,
    refetchInterval: 60_000,
  });

  const projection = useMemo<DelegationQualityGateProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const passRateTone = useMemo(() => {
    if (!projection) return 'default' as const;
    return projection.overall_pass_rate >= passThreshold ? 'good' as const : 'warn' as const;
  }, [projection, passThreshold]);

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
              gridTemplateColumns: 'repeat(4, 1fr)',
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
            <KPI
              label="Escalations"
              value={projection.escalation_count}
              caption={`${(projection.escalation_rate * 100).toFixed(1)}% rate`}
              tone={projection.escalation_count > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Per-check-type breakdown */}
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 60px 60px 60px',
                gap: 8,
                paddingBottom: 4,
                borderBottom: '1px solid var(--line)',
              }}
            >
              {(['Type', 'Pass/Fail', 'Rate', 'Pass', 'Fail'] as const).map((h, i) => (
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
