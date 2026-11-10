import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text, type TextColor } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import {
  aggregateSkillAdoption,
  type SkillAdoptionRow,
  type SkillExecutionRow,
} from '@/services/skill-adoption-service';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in SkillAdoptionWidget.static.css.
import './SkillAdoptionWidget.static.css';

// ── Config ────────────────────────────────────────────────────────────

export interface SkillAdoptionWidgetConfig {
  /** Max per-skill rows to render (after sort). Default 25. */
  maxRows?: number;
}

// ── Formatting helpers ────────────────────────────────────────────────

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// Receipt coverage below 1 means started events without a matching completed
// row (missing receipts); >= 1 means every start was paired.
function coverageColor(coverage: number): TextColor {
  if (coverage >= 1) return 'ok';
  if (coverage >= 0.75) return 'warn';
  return 'bad';
}

// ── Per-skill row ─────────────────────────────────────────────────────

function SkillRow({ row }: { row: SkillAdoptionRow }) {
  return (
    <div className="skill-adoption-widget-se34a59"
    >
      <Text className="skill-adoption-widget-s6d812f"
        as="span"
        size="xs"
        family="mono"
        color="primary"
      >
        {row.skill_name}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {row.started}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        {row.completed}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary">
        <Text as="span" size="xs" family="mono" color="ok">
          {row.success}✓
        </Text>{' '}
        <Text as="span" size="xs" family="mono" color="bad">
          {row.failed}✗
        </Text>{' '}
        <Text as="span" size="xs" family="mono" color="tertiary">
          {row.partial}~
        </Text>
      </Text>
      <Text as="span" size="xs" family="mono" color={coverageColor(row.receiptCoverage)}>
        {formatPercent(row.receiptCoverage)}
      </Text>
    </div>
  );
}

// ── Header row ────────────────────────────────────────────────────────

function HeaderRow() {
  const cell = (label: string) => (
    <Text as="span" size="xs" color="tertiary" weight="semibold">
      {label}
    </Text>
  );
  return (
    <div className="skill-adoption-widget-s7d437f"
    >
      {cell('Skill')}
      {cell('Started')}
      {cell('Done')}
      {cell('Status')}
      {cell('Receipts')}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function SkillAdoptionWidget(props: { config: SkillAdoptionWidgetConfig }) {
  const { config } = props;
  const maxRows = Math.max(0, config.maxRows ?? 25);

  const { data, isLoading, error } = useProjectionQuery<SkillExecutionRow>({
    queryKey: ['skill-executions', TOPICS.skillExecutions],
    topic: TOPICS.skillExecutions,
    refetchInterval: refreshInterval(),
  });

  const summary = useMemo(() => aggregateSkillAdoption(data ?? []), [data]);

  const skills = useMemo(() => summary.skills.slice(0, maxRows), [summary.skills, maxRows]);

  const isEmpty = summary.skills.length === 0;

  return (
    <ComponentWrapper
      title="Skill Adoption"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No skill executions"
      emptyHint="Rows appear once skills emit started/completed lifecycle events to the bus"
    >
      {!isEmpty && (
        <div className="skill-adoption-widget-s930d87">
          {/* KPI row */}
          <div className="skill-adoption-widget-s1e8560"
          >
            <KPI label="Started" value={summary.totalStarted} />
            <KPI label="Completed" value={summary.totalCompleted} />
            <KPI
              label="Failed"
              value={summary.totalFailed}
              tone={summary.totalFailed > 0 ? ('bad' as const) : ('default' as const)}
            />
            <KPI
              label="Receipt coverage"
              value={Math.round(summary.overallReceiptCoverage * 100)}
              suffix="%"
              tone={coverageTone(summary.overallReceiptCoverage)}
            />
          </div>

          {/* Per-skill table */}
          <div>
            <HeaderRow />
            {skills.map((row) => (
              <SkillRow key={row.skill_name} row={row} />
            ))}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}

function coverageTone(coverage: number): 'good' | 'warn' | 'bad' {
  if (coverage >= 1) return 'good';
  if (coverage >= 0.75) return 'warn';
  return 'bad';
}
