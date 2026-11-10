import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { useDelegationRunContextOptional } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import type { DelegationDecisionProjectionRow } from '@/components/dashboard/delegation-control-plane/delegation-control-plane.types';
import { fixed as fmtFixed, localeString as fmtLocaleString } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in DelegationQualityGateWidget.static.css.
import './DelegationQualityGateWidget.static.css';

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
  deterministic: 'Automated checks',
  heuristic: 'Heuristic checks',
  unknown: 'Other checks',
};

// Translate raw failure category strings (which contain internal TASK_MISMATCH codes)
// into human-readable escalation reasons.
function humanizeCategory(raw: string): string {
  // Strip "TASK_MISMATCH: " prefix from individual clauses, then join
  const clauses = raw.split(/;\s*/).map((c) => {
    const stripped = c.replace(/^TASK_MISMATCH:\s*/i, '').trim();
    // Map known patterns to friendly labels
    if (/missing documentation sections/i.test(stripped)) return 'Missing docs sections';
    if (/missing @pytest\.mark\./i.test(stripped)) return 'Missing test marker';
    if (/failed covers_edge_cases/i.test(stripped)) return 'Edge cases not covered';
    if (/failed covers_error_paths/i.test(stripped)) return 'Error paths not covered';
    if (/failed accurate/i.test(stripped)) return 'Inaccurate output';
    if (/timed out/i.test(stripped)) return 'Timed out';
    return stripped.length > 48 ? `${stripped.slice(0, 47)}…` : stripped;
  });
  // Deduplicate and join
  const unique = [...new Set(clauses)];
  return unique.join(' · ');
}

function CheckTypeRow({ row, passThreshold }: { row: QualityGateCheckRow; passThreshold: number }) {
  const passColor = row.pass_rate >= passThreshold ? 'var(--ds-ok)' : 'var(--ds-warn)';
  const failPct = (1 - row.pass_rate) * 100;
  const passPct = row.pass_rate * 100;

  return (
    <div className="delegation-quality-gate-widget-scdb164">
      <div className="delegation-quality-gate-widget-sd62558"
      >
        <Text as="span" size="sm" weight="semibold" color="primary">
          {CHECK_TYPE_LABEL[row.check_type]}
        </Text>
        {/* Pass/fail stacked bar */}
        <div className="delegation-quality-gate-widget-sf8a772">
          <div
            style={{
              width: `${passPct}%`,
              background: 'var(--ds-ok)',
              transition: 'width 0.6s ease-out',
            }}
          />
          <div
            style={{
              width: `${failPct}%`,
              background: 'var(--ds-bad, var(--ds-warn))',
              transition: 'width 0.6s ease-out',
            }}
          />
        </div>
        <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: passColor }}>
          {fmtFixed((row.pass_rate * 100), 1)}%
        </Text>
        {/* Inline pass / fail fraction: "N pass / M fail" */}
        <div className="delegation-quality-gate-widget-sa1385d">
          <Text color="ok" as="span" size="xs" family="mono" tabularNums>
            {row.passed}✓
          </Text>
          <Text as="span" size="xs" color="tertiary">/</Text>
          <Text color="bad" as="span" size="xs" family="mono" tabularNums>
            {row.failed}✗
          </Text>
        </div>
        <Text className="delegation-quality-gate-widget-s13cbe0" as="span" size="xs" family="mono" tabularNums color="tertiary">
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
    <div className="delegation-quality-gate-widget-s9c9cee">
      <Text className="delegation-quality-gate-widget-s4feedf" as="div" size="xs" color="tertiary" weight="semibold">
        Escalation reasons
      </Text>
      {categories.map((c) => (
        <div className="delegation-quality-gate-widget-s021c02"
          key={c.category}
        >
          <Text className="delegation-quality-gate-widget-s6d812f" as="span" size="sm" family="mono" color="primary" title={c.category}>
            {humanizeCategory(c.category)}
          </Text>
          <Text className="delegation-quality-gate-widget-s13cbe0" as="span" size="sm" family="mono" tabularNums>
            {c.count}
          </Text>
          {/* Proportion bar */}
          <div className="delegation-quality-gate-widget-s77bcbd">
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, c.pct_of_failures * 100))}%`,
                background: 'var(--ds-bad, var(--ds-warn))',
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

// ── Recent delegation checks ─────────────────────────────────────────

interface DelegationDecisionRow {
  id: string | number;
  task_type: string;
  model_name: string | null;
  delegated_to: string | null;
  quality_gate_passed: boolean | number;
  quality_gate_detail: string | null;
  created_at: string;
}

const RECENT_CHECKS_PAGE_SIZE = 8;

function RecentChecks({ rows }: { rows: DelegationDecisionRow[] }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, RECENT_CHECKS_PAGE_SIZE);
  const hasMore = rows.length > RECENT_CHECKS_PAGE_SIZE;

  return (
    <div className="delegation-quality-gate-widget-s9c9cee">
      <Text className="delegation-quality-gate-widget-s4feedf" as="div" size="xs" color="tertiary" weight="semibold">
        Recent delegations ({rows.length})
      </Text>
      <div className="delegation-quality-gate-widget-s3a72b7"
      >
        <Text as="span" size="xs" color="tertiary">{' '}</Text>
        <Text as="span" size="xs" color="tertiary">Task</Text>
        <Text as="span" size="xs" color="tertiary">Model</Text>
        <Text as="span" size="xs" color="tertiary">Detail</Text>
      </div>
      {visible.map((row, i) => {
        const passed = Number(row.quality_gate_passed) === 1 || row.quality_gate_passed === true;
        const model = row.model_name || row.delegated_to || 'local';
        const detail = row.quality_gate_detail || '—';
        return (
          <div className="delegation-quality-gate-widget-s32de6d"
            key={`${row.id}-${i}`}
          >
            <Text
              as="span"
              size="sm"
              style={{ color: passed ? 'var(--ds-ok)' : 'var(--ds-bad, var(--ds-warn))' }}
            >
              {passed ? '✓' : '✗'}
            </Text>
            <Text className="delegation-quality-gate-widget-s6d812f"
              as="span"
              size="sm"
              family="mono"
              color="primary"
            >
              {row.task_type || 'unknown'}
            </Text>
            <Text className="delegation-quality-gate-widget-s6d812f"
              as="span"
              size="sm"
              family="mono"
              color="secondary"
            >
              {model}
            </Text>
            <Text className="delegation-quality-gate-widget-s6d812f"
              as="span"
              size="xs"
              family="mono"
              color="tertiary"
            >
              {detail}
            </Text>
          </div>
        );
      })}
      {hasMore && (
        <button className="delegation-quality-gate-widget-s339fc8"
          type="button"
          onClick={() => setShowAll((v) => !v)}
        >
          <Text as="span" size="xs" color="secondary">
            {showAll ? 'Show less' : `Show all ${rows.length} delegations`}
          </Text>
        </button>
      )}
    </div>
  );
}

// ── Tokens-to-compliance per-model breakdown ─────────────────────────

function TokensToComplianceByModel({ rows }: { rows: TokensToComplianceByModelRow[] }) {
  if (rows.length === 0) return null;
  // Sort by avg_tokens ascending (most efficient model first).
  const sorted = [...rows].sort((a, b) => a.avg_tokens - b.avg_tokens);
  return (
    <div className="delegation-quality-gate-widget-s9c9cee">
      <Text className="delegation-quality-gate-widget-s4feedf" as="div" size="xs" color="tertiary" weight="semibold">
        Tokens-to-compliance by model
      </Text>
      <div className="delegation-quality-gate-widget-s5a59a6"
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
        <div className="delegation-quality-gate-widget-s167f5c"
          key={row.model_name}
        >
          <Text className="delegation-quality-gate-widget-s6d812f"
            as="span"
            size="sm"
            family="mono"
            color="primary"
          >
            {row.model_name}
          </Text>
          <Text className="delegation-quality-gate-widget-s13cbe0" as="span" size="sm" family="mono" tabularNums>
            {fmtLocaleString(Math.round(row.avg_tokens))}
          </Text>
          <Text className="delegation-quality-gate-widget-s13cbe0" as="span" size="sm" family="mono" tabularNums>
            {fmtFixed(row.avg_attempts, 2)}
          </Text>
          <Text className="delegation-quality-gate-widget-s13cbe0" as="span" size="xs" family="mono" tabularNums color="tertiary">
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

  const runCtx = useDelegationRunContextOptional();
  const dataSourceMode = useDataSourceMode();

  const { data, isLoading: queryLoading, error: queryError } = useProjectionQuery<DelegationQualityGateProjection>({
    queryKey: ['delegation-quality-gate', TOPICS.delegationQualityGate],
    topic: TOPICS.delegationQualityGate,
    refetchInterval: refreshInterval(),
    enabled: !runCtx,
  });

  // Fetch recent delegation decisions for the per-row detail table
  const { data: decisionsData } = useProjectionQuery<DelegationDecisionRow>({
    queryKey: ['delegation-decisions', TOPICS.delegationDecisions],
    topic: TOPICS.delegationDecisions,
    refetchInterval: refreshInterval(),
    enabled: !runCtx,
  });

  const isLoading = runCtx ? runCtx.snapshot.isLoading : queryLoading;
  const error = runCtx ? runCtx.snapshot.primaryError : queryError;

  const projection = useMemo<DelegationQualityGateProjection | null>(() => {
    if (runCtx) return runCtx.snapshot.qualityGate;
    return data?.[0] ?? null;
  }, [runCtx, data]);

  const selectedRun = runCtx?.selectedRun ?? null;

  const effectiveDecisionsData = useMemo<DelegationDecisionRow[]>(() => {
    if (runCtx) {
      const decisions: DelegationDecisionProjectionRow[] = runCtx.snapshot.decisions;
      const filtered = selectedRun
        ? decisions.filter(
            (d) => d.correlation_id === selectedRun.correlationId || d.session_id === selectedRun.sessionId,
          )
        : decisions;
      return filtered as unknown as DelegationDecisionRow[];
    }
    return decisionsData ?? [];
  }, [runCtx, decisionsData, selectedRun]);

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
      title="Escalation Detail"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No escalation data"
      emptyHint="Escalation data appears once delegation events with quality checks are recorded. In file mode, add fixture files under fixtures/onex.snapshot.projection.delegation.quality-gate.v1/"
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      {projection && !isEmpty && (
        <div className="delegation-quality-gate-widget-s930d87">
          {/* Tokens-to-compliance KPIs (OMN-10795) — only shown when projection carries the fields */}
          {hasComplianceMetrics && (
            <div className="delegation-quality-gate-widget-s6e5610"
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
                    ? Number(fmtFixed(projection.avg_compliance_attempts, 2))
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
            <div className="delegation-quality-gate-widget-s92f19a"
            >
              <div className="delegation-quality-gate-widget-s3088da">
                <Text color="warn" as="span" size="sm" weight="semibold">
                  ⚠ Escalations
                </Text>
                <Text as="span" size="xs" color="secondary">
                  {projection.escalation_count} delegation{projection.escalation_count !== 1 ? 's' : ''} required human escalation
                </Text>
              </div>
              <Text color="warn" as="span" size="sm" family="mono" tabularNums weight="semibold">
                {fmtFixed((projection.escalation_rate * 100), 1)}% rate
              </Text>
            </div>
          )}

          {/* Per-check-type breakdown */}
          <div>
            <div className="delegation-quality-gate-widget-s546187"
            >
              {(['Type', 'Local / Escalated', 'Rate', 'Local / Escalated', 'Total'] as const).map((h, i) => (
                <Text
                  key={`${h}-${i}`}
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

          {/* Recent individual delegation checks (OMN-11388) */}
          {effectiveDecisionsData.length > 0 && (
            <RecentChecks rows={effectiveDecisionsData} />
          )}

          {/* Tokens-to-compliance per-model breakdown (OMN-10795) */}
          {projection.tokens_to_compliance_by_model && (
            <TokensToComplianceByModel rows={projection.tokens_to_compliance_by_model} />
          )}

          {!projection.provisioned && (
            <Text className="delegation-quality-gate-widget-s0934b3" as="div" size="xs" color="tertiary">
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10623).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
