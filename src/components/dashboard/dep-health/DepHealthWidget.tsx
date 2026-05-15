
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';

// ── Projection types (from dep_health_findings table, OMN-11042) ──────

export type DepHealthFindingType =
  | 'ORPHAN_IMPORT'
  | 'MISSING_TOPIC_EDGE'
  | 'DEAD_IMPORT'
  | 'UNTESTED_HANDLER'
  | 'CONTRACT_DRIFT'
  | 'UNDECLARED_TOPIC';

export type DepHealthSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

export interface DepHealthFindingRow {
  run_id: string;
  finding_type: DepHealthFindingType;
  severity: DepHealthSeverity;
  repo: string;
  file_path: string;
  symbol: string;
  detail: string;
  rule_id: string;
  rule_version: string;
  captured_at: string;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DepHealthWidgetConfig {
  maxRows?: number;
}

// ── Severity colour helper ────────────────────────────────────────────

function severityColor(severity: DepHealthSeverity): string {
  if (severity === 'CRITICAL') return 'var(--bad, var(--error, #e53e3e))';
  if (severity === 'MAJOR') return 'var(--warn)';
  if (severity === 'MINOR') return 'var(--secondary)';
  return 'var(--tertiary)';
}

// ── Finding row ───────────────────────────────────────────────────────

function FindingRow({ row }: { row: DepHealthFindingRow }) {
  const color = severityColor(row.severity);
  return (
    <div
      style={{
        padding: '6px 0',
        borderBottom: '1px solid var(--line-2)',
        display: 'grid',
        gridTemplateColumns: '80px 120px 1fr',
        gap: 8,
        alignItems: 'start',
      }}
    >
      <Text as="span" size="xs" family="mono" style={{ color }}>
        {row.severity}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color="secondary"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.repo}
      </Text>
      <Text
        as="span"
        size="xs"
        color="primary"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.detail}
      </Text>
    </div>
  );
}

// ── Repo group ────────────────────────────────────────────────────────

function RepoGroup({ repo, rows }: { repo: string; rows: DepHealthFindingRow[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Text
        as="div"
        size="xs"
        color="tertiary"
        weight="semibold"
        style={{ marginBottom: 4, paddingBottom: 2, borderBottom: '1px solid var(--line)' }}
      >
        {repo} ({rows.length})
      </Text>
      {rows.map((row, i) => (
        <FindingRow key={`${row.run_id}-${row.finding_type}-${row.file_path}-${i}`} row={row} />
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DepHealthWidget(props: { config: DepHealthWidgetConfig }) {
  const { config } = props;
  const maxRows = config.maxRows ?? 50;

  const { data, isLoading, error } = useProjectionQuery<DepHealthFindingRow>({
    queryKey: ['dep-health-findings', TOPICS.depHealthFindings],
    topic: TOPICS.depHealthFindings,
    refetchInterval: 30_000,
  });

  const findings = useMemo<DepHealthFindingRow[]>(() => {
    return (data ?? []).slice(0, maxRows);
  }, [data, maxRows]);

  const criticalCount = useMemo(
    () => findings.filter((f) => f.severity === 'CRITICAL').length,
    [findings],
  );

  const majorCount = useMemo(
    () => findings.filter((f) => f.severity === 'MAJOR').length,
    [findings],
  );

  const byRepo = useMemo<Map<string, DepHealthFindingRow[]>>(() => {
    const map = new Map<string, DepHealthFindingRow[]>();
    for (const row of findings) {
      const existing = map.get(row.repo) ?? [];
      existing.push(row);
      map.set(row.repo, existing);
    }
    return map;
  }, [findings]);

  const isEmpty = findings.length === 0;

  return (
    <ComponentWrapper
      title="Dependency Health"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No dependency health findings"
      emptyHint="Findings appear once a dep-health sweep has run and projected results"
    >
      {!isEmpty && (
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
            <KPI label="Total findings" value={findings.length} />
            <KPI
              label="CRITICAL"
              value={criticalCount}
              tone={criticalCount > 0 ? ('bad' as const) : ('default' as const)}
            />
            <KPI
              label="MAJOR"
              value={majorCount}
              tone={majorCount > 0 ? ('warn' as const) : ('default' as const)}
            />
          </div>

          {/* Findings grouped by repo */}
          <div>
            {Array.from(byRepo.entries()).map(([repo, rows]) => (
              <RepoGroup key={repo} repo={repo} rows={rows} />
            ))}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
