
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text, type TextColor } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in DepHealthWidget.static.css.
import './DepHealthWidget.static.css';

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

// Returns a TextColor token so <Text color={…}> can own the colour — no inline style.
function severityColor(severity: DepHealthSeverity): TextColor {
  if (severity === 'CRITICAL') return 'bad';
  if (severity === 'MAJOR') return 'warn';
  if (severity === 'MINOR') return 'secondary';
  return 'tertiary';
}

// ── Finding row ───────────────────────────────────────────────────────

function FindingRow({ row }: { row: DepHealthFindingRow }) {
  const color = severityColor(row.severity);
  return (
    <div className="dep-health-widget-sf6ca22"
    >
      <Text as="span" size="xs" family="mono" color={color}>
        {row.severity}
      </Text>
      <Text className="dep-health-widget-s6d812f"
        as="span"
        size="xs"
        family="mono"
        color="secondary"
      >
        {row.repo}
      </Text>
      <Text className="dep-health-widget-s6d812f"
        as="span"
        size="xs"
        color="primary"
      >
        {row.detail}
      </Text>
    </div>
  );
}

// ── Repo group ────────────────────────────────────────────────────────

function RepoGroup({ repo, rows }: { repo: string; rows: DepHealthFindingRow[] }) {
  return (
    <div className="dep-health-widget-s72d6c3">
      <Text className="dep-health-widget-s140416"
        as="div"
        size="xs"
        color="tertiary"
        weight="semibold"
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
  const maxRows = Math.max(0, config.maxRows ?? 50);

  const { data, isLoading, error } = useProjectionQuery<DepHealthFindingRow>({
    queryKey: ['dep-health-findings', TOPICS.depHealthFindings],
    topic: TOPICS.depHealthFindings,
    refetchInterval: refreshInterval(),
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
        <div className="dep-health-widget-s930d87">
          {/* KPI row */}
          <div className="dep-health-widget-s90575b"
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
