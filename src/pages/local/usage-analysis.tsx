import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'wouter';

import { formatUsd } from '@/lib/currency';
import { DashboardTabs, DashboardToggle, DataTable, EmptyState, Panel, PanelTitle } from '@/theme/design-system/components';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { tierLabel } from '@/pages/local/plain-text';
import { PASS_BANDS, passBand } from '@/lib/pass-band';
import { DEFAULT_RUNS_VIEW, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import {
  coverageOf, groupDecisions, matrixOf, NOT_RECORDED, OTHER, qualityTrend, routesOf, SMALL_SAMPLE, SPARK_DAYS, totalsOf,
  type Group, type GroupBy, type Totals, type TrendDay, type TrendSeriesBy,
} from './decision-analysis';
import { TierLegend, useModelColor } from '@/components/dashboard/model-tiers';
import { BarSparkline, CostQualityScatter, breakableName } from '@/theme/design-system/charts';
import { ChartLine, Gauge, Layers, LayoutGrid } from '@/theme/design-system/icons';

/**
 * OMN-21166 part 29 (revision 6) AC194 and AC195: Usage analysis, read from the latest N served decisions (Langfuse's
 * explicit dimension and sample scope, Portkey's summary table, Braintrust's cost-and-quality view). It states its
 * sample and coverage, keeps each rate's own denominator, and never draws an unmeasured value as 0.
 */
const GROUPS: ReadonlyArray<{ by: GroupBy; label: string }> = [
  { by: 'model', label: 'Model' }, { by: 'tier', label: 'Tier' }, { by: 'task', label: 'Task type' }, { by: 'backend', label: 'Backend' },
];
type SortKey = 'name' | 'runs' | 'spend' | 'pass' | 'p50' | 'p95' | 'last';

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const usd = (value: number) => (value > 0 && value < 0.01 ? `$${value.toFixed(3)}` : formatUsd(value));
const latency = (value: number | null) => (value === null ? 'Not recorded' : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`);
const passText = (totals: Totals) => (totals.verdicts === 0 ? 'No verdicts' : `${((totals.passed / totals.verdicts) * 100).toFixed(1)}% (${totals.passed} of ${totals.verdicts})`);
const money = (value: number | null, measured: number, runs: number) => (value === null ? 'Not measured' : `${formatUsd(value)} (${measured} of ${runs} measured)`);
const lastText = (value: string | null) => (value === null ? 'Not recorded'
  : `${dayLabel(value.slice(0, 10))}, ${new Date(value).toISOString().slice(11, 16)} UTC`);

function sortValue(group: Group, key: SortKey): number | string {
  switch (key) {
    case 'name': return group.name;
    case 'runs': return group.runs;
    case 'spend': return group.spend ?? Number.NEGATIVE_INFINITY;
    case 'pass': return group.verdicts === 0 ? Number.NEGATIVE_INFINITY : group.passed / group.verdicts;
    case 'p50': return group.p50 ?? Number.NEGATIVE_INFINITY;
    case 'p95': return group.p95 ?? Number.NEGATIVE_INFINITY;
    case 'last': return group.last ? Date.parse(group.last) : Number.NEGATIVE_INFINITY;
  }
}

// OMN-22168 AC3: the sparkline and the scatter are the kit's; this page only shapes its groups for them.
function Sparkline({ group }: { group: Group }) {
  return <BarSparkline label={`${group.name}: runs per day, ${group.daily.filter(day => day.runs === null).length} days before the sample not covered`}
    days={group.daily.map(day => ({ key: day.day, value: day.runs,
      title: day.runs === null ? `${dayLabel(day.day)}: not covered by the sample` : `${dayLabel(day.day)}: ${day.runs} runs` }))} />;
}

function QualityChart({ groups }: { groups: Group[] }) {
  const modelColor = useModelColor();
  const plotted = groups.filter(group => group.name !== NOT_RECORDED && group.spend !== null && group.spendMeasured > 0 && group.verdicts > 0);
  const unplotted = groups.filter(group => !plotted.includes(group));
  const perRun = (group: Group) => group.spend! / group.spendMeasured;
  // usd(0) is formatUsd(0), so one formatter labels both ticks as the page did.
  return <CostQualityScatter label="Cost versus quality per model" formatCost={usd} unplotted={unplotted.map(group => group.name)}
    points={plotted.map(group => ({ key: group.name, name: group.name, cost: perRun(group), rate: group.passed / group.verdicts, runs: group.runs,
      color: modelColor(group.name),
      detail: `${group.name}: ${usd(perRun(group))} per measured run, ${passText(group).replace(' (', ' passed (')}, ${group.runs} runs` }))}
    legend={<TierLegend label="Cost versus quality tier colours" models={plotted.map(group => group.name)} />} />;
}

function GroupsView({ decisionRows }: { decisionRows: readonly unknown[] }) {
  const modelColor = useModelColor();
  const [by, setBy] = useState<GroupBy>('model');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'runs', dir: 'desc' });
  const groups = useMemo(() => groupDecisions(decisionRows, by), [decisionRows, by]);
  const sorted = [...groups].sort((a, b) => {
    const left = sortValue(a, sort.key), right = sortValue(b, sort.key);
    const order = typeof left === 'string' ? String(left).localeCompare(String(right)) : Number(left) - Number(right);
    return sort.dir === 'asc' ? order : -order;
  });
  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })}>{label}</button>
    </th>);
  const label = GROUPS.find(group => group.by === by)!.label;
  return <>
    <DashboardToggle label="Group by" options={GROUPS.map(group => ({ value: group.by, label: group.label }))} value={by} onChange={setBy} />
    <DataTable data-analysis-table aria-label={`Usage by ${label.toLowerCase()}`}>
        <thead><tr>{header('name', label)}{header('runs', 'Runs')}{header('spend', 'Spend')}
          {header('pass', 'Pass rate')}{header('p50', 'p50 latency')}{header('p95', 'p95 latency')}
          {header('last', 'Last run')}<th scope="col">{`Runs per day (${SPARK_DAYS} days)`}</th></tr></thead>
        <tbody>{sorted.map(group => <tr key={group.name}>
          <th scope="row" data-model-name={by === 'model' && group.name !== NOT_RECORDED ? '' : undefined}
            data-semantic-concept={by === 'model' && group.name !== NOT_RECORDED ? `model:${group.name}` : undefined}
            style={by === 'model' && group.name !== NOT_RECORDED ? { '--model-color': modelColor(group.name) } as CSSProperties : undefined}>{breakableName(group.name)}</th>
          {/* data-label names each value when a phone stacks the rows as cards (Codex MSG 753d170c). */}
          <td data-cell="runs" data-label="Runs">{group.runs}</td>
          <td data-cell="spend" data-label="Spend">{money(group.spend, group.spendMeasured, group.runs)}</td>
          <td data-cell="pass" data-label="Pass rate" data-pass-band={passBand(group.passed, group.verdicts)}>{passText(group)}</td>
          <td data-cell="p50" data-label="p50 latency">{latency(group.p50)}</td>
          <td data-cell="p95" data-label="p95 latency">{latency(group.p95)}</td>
          <td data-cell="last" data-label="Last run">{lastText(group.last)}</td>
          <td data-cell="spark" data-label={`Runs per day (${SPARK_DAYS} days)`}><Sparkline group={group} /></td>
        </tr>)}</tbody>
    </DataTable>
    {by === 'model' && <TierLegend label="Usage by model tier colours" models={groups.map(group => group.name)} />}
  </>;
}

/** The Runs address for a served value of a field; null when Runs cannot filter to it (a value that was not recorded). */
function runsFilter(by: GroupBy, value: string): Partial<RunsViewState> | null {
  if (value === NOT_RECORDED || value === OTHER) return by === 'model' && value === NOT_RECORDED ? { model: 'unknown' } : null;
  return by === 'model' ? { model: value } : by === 'task' ? { task: value } : by === 'tier' ? { tier: value } : { backend: value };
}
const runsHref = (filters: ReadonlyArray<Partial<RunsViewState> | null>, extra: Partial<RunsViewState> = {}): string | null =>
  filters.some(filter => filter === null) ? null : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, ...Object.assign({}, ...filters), ...extra })}`;

const runCount = (runs: number) => `${runs} ${runs === 1 ? 'run' : 'runs'}`;
type MatrixMetric = 'pass' | 'p95' | 'cost' | 'runs';
const MATRIX_METRICS: ReadonlyArray<{ value: MatrixMetric; label: string }> = [
  { value: 'pass', label: 'Pass rate' }, { value: 'p95', label: 'p95 latency' }, { value: 'cost', label: 'Cost per measured run' }, { value: 'runs', label: 'Runs' },
];
const MATRIX_COLUMNS: ReadonlyArray<{ value: Extract<GroupBy, 'task' | 'tier'>; label: string }> = [{ value: 'task', label: 'Task type' }, { value: 'tier', label: 'Tier' }];

/** One cell's figure for the chosen metric, and the line that names its denominator. */
function matrixFigure(totals: Totals, metric: MatrixMetric): [string, string] {
  switch (metric) {
    case 'pass': return totals.verdicts === 0 ? ['No verdicts', runCount(totals.runs)]
      : [`${((totals.passed / totals.verdicts) * 100).toFixed(1)}%`, `${totals.passed} of ${totals.verdicts}`];
    case 'p95': return [latency(totals.p95), `${totals.latencies} recorded`];
    case 'cost': return totals.spend === null ? ['Not measured', runCount(totals.runs)] : [usd(totals.spend / totals.spendMeasured), `${totals.spendMeasured} measured`];
    case 'runs': return [String(totals.runs), totals.verdicts === 0 ? 'no verdicts' : `${totals.passed} of ${totals.verdicts} passed`];
  }
}

/**
 * Part 30 AC203: models against task types (or tiers), one cell per pair with the chosen metric over its own denominator.
 * A cell under five verdicts is marked a small sample, a pair with no runs reads no runs, and each cell opens its runs.
 */
function DecisionMatrix({ decisionRows }: { decisionRows: readonly unknown[] }) {
  const modelColor = useModelColor();
  const [metric, setMetric] = useState<MatrixMetric>('pass');
  const [columnsBy, setColumnsBy] = useState<'task' | 'tier'>('task');
  const matrix = useMemo(() => matrixOf(decisionRows, 'model', columnsBy), [decisionRows, columnsBy]);
  const columnLabel = MATRIX_COLUMNS.find(option => option.value === columnsBy)!.label;
  // The column's name in the header and, on a phone where rows stack as cards, beside each value (Codex MSG 753d170c).
  const columnName = (column: string) => (columnsBy === 'task' && column !== NOT_RECORDED ? column.replace(/_+/g, ' ') : column);
  return <>
    <div className="local-dashboard-toggles">
      <DashboardToggle label="Matrix metric" options={MATRIX_METRICS} value={metric} onChange={setMetric} />
      <DashboardToggle label="Matrix columns" options={MATRIX_COLUMNS} value={columnsBy} onChange={setColumnsBy} />
    </div>
    <p className="local-dashboard-caption">{`Models by ${columnLabel.toLowerCase()}. A cell with fewer than ${SMALL_SAMPLE} verdicts is a small sample; a pair with no runs reads no runs. Each cell opens its runs.`}</p>
    <DataTable className="usage-matrix-wrap" data-decision-matrix aria-label={`Models by ${columnLabel.toLowerCase()}`}>
        <thead><tr><th scope="col">Model</th>{matrix.columns.map(column => <th key={column} scope="col" data-col={column}>{columnName(column)}</th>)}</tr></thead>
        <tbody>{matrix.rows.map(row => <tr key={row}>
          <th scope="row" data-model-name={row !== NOT_RECORDED ? '' : undefined} data-semantic-concept={row !== NOT_RECORDED ? `model:${row}` : undefined}
            style={row !== NOT_RECORDED ? { '--model-color': modelColor(row) } as CSSProperties : undefined}>{row}</th>
          {matrix.columns.map(column => {
            const totals = matrix.cell(row, column);
            if (totals === null) return <td key={column} data-row={row} data-col={column} data-label={columnName(column)} data-state="no-runs">no runs</td>;
            const [figure, basis] = matrixFigure(totals, metric);
            const small = totals.verdicts < SMALL_SAMPLE;
            const href = runsHref([runsFilter('model', row), runsFilter(columnsBy, column)]);
            const body = <><span className="usage-matrix-figure">{figure}</span>
              <span className="usage-matrix-basis">{small ? `${basis} · small sample` : basis}</span></>;
            return <td key={column} data-row={row} data-col={column} data-label={columnName(column)} data-state={totals.verdicts === 0 ? 'no-verdicts' : 'value'} data-small={small ? 'true' : undefined}
              data-metric={metric}>
              {href ? <Link href={href} aria-label={`${row}, ${column}: ${figure}, ${basis}${small ? ', small sample' : ''}. Opens these runs.`}>{body}</Link> : body}
            </td>;
          })}
        </tr>)}</tbody>
    </DataTable>
    <TierLegend label="Model matrix tier colours" models={matrix.rows} />
  </>;
}

type TrendMetric = 'pass' | 'p95';
const TREND_SERIES: ReadonlyArray<{ value: TrendSeriesBy; label: string }> = [{ value: 'all', label: 'All runs' }, { value: 'model', label: 'By model' }, { value: 'task', label: 'By task' }];

function trendLabel(day: TrendDay, metric: TrendMetric): string {
  const date = dayLabel(day.day);
  if (day.state === 'not-covered') return `${date}: not covered by the sample`;
  if (day.state === 'no-runs') return `${date}: no runs`;
  const runs = `${day.runs} ${day.runs === 1 ? 'run' : 'runs'}`;
  if (metric === 'p95') return day.p95 === null ? `${date}: latency not recorded, ${runs}` : `${date}: p95 ${latency(day.p95)}, ${runs}`;
  return day.state === 'no-verdicts' ? `${date}: no verdicts, ${runs}` : `${date}: ${((day.passed / day.verdicts) * 100).toFixed(1)}% passed (${day.passed} of ${day.verdicts}), ${runs}`;
}

/**
 * Part 30 AC204: one row of daily bars per series (every run, or each of the five largest models or tasks and Other), over
 * the 14 UTC days ending on the sample's last day. A day before the sample is not covered and a day with runs but no verdict
 * says so; neither is drawn as 0. Each day with runs opens Runs for that day (and that series).
 */
function QualityTrend({ decisionRows }: { decisionRows: readonly unknown[] }) {
  const modelColor = useModelColor();
  const [metric, setMetric] = useState<TrendMetric>('pass');
  const [by, setBy] = useState<TrendSeriesBy>('all');
  const series = useMemo(() => qualityTrend(decisionRows, by), [decisionRows, by]);
  const peak = Math.max(1, ...series.flatMap(line => line.days.flatMap(day => (day.p95 === null ? [] : [day.p95]))));
  const height = (day: TrendDay): number | null => (metric === 'pass'
    ? (day.state === 'value' ? day.passed / day.verdicts : null) : (day.state === 'not-covered' || day.p95 === null ? null : day.p95 / peak));
  const days = series[0]?.days ?? [];
  return <figure className="local-chart usage-trend" data-quality-trend data-metric={metric} aria-label="Quality over time">
    <div className="local-dashboard-toggles">
      <DashboardToggle label="Trend metric" options={[{ value: 'pass', label: 'Pass rate' }, { value: 'p95', label: 'p95 latency' }]} value={metric} onChange={setMetric} />
      <DashboardToggle label="Trend series" options={TREND_SERIES} value={by} onChange={setBy} />
    </div>
    <figcaption className="local-dashboard-caption">{metric === 'pass'
      ? 'Pass rate per UTC day over runs with a verdict; an outlined day is before the sample, a dashed one has runs but no verdicts.'
      : `p95 latency per UTC day from recorded latencies; the tallest bar is ${latency(peak)}.`}</figcaption>
    <div className="usage-trend-rows">
      {series.map(line => <div key={line.name} className="usage-trend-row" data-series={line.name}
        style={by === 'model' && line.filter && line.name !== NOT_RECORDED ? { '--model-color': modelColor(line.name) } as CSSProperties : undefined}>
        <span className="usage-trend-name" data-model-name={by === 'model' && line.filter && line.name !== NOT_RECORDED ? '' : undefined}
          data-semantic-concept={by === 'model' && line.filter && line.name !== NOT_RECORDED ? `model:${line.name}` : undefined}
          style={by === 'model' && line.filter && line.name !== NOT_RECORDED ? { '--model-color': modelColor(line.name) } as CSSProperties : undefined}>{line.name}</span>
        <ol className="usage-trend-days" aria-label={`${line.name}, ${metric === 'pass' ? 'pass rate' : 'p95 latency'} per day`}>
          {line.days.map(day => {
            const label = trendLabel(day, metric);
            const value = height(day);
            const style = value === null ? undefined : { '--trend-height': `${Math.max(value * 100, 0)}%` } as CSSProperties;
            // Every day with runs opens Runs for that day (AC204); a series Runs cannot filter to (Other, a task or tier
            // that was not recorded) opens all of that day's runs and says so (Codex MSG 2793fa16).
            const filter = line.filter ? runsFilter(line.filter.by, line.filter.value) : {};
            const href = day.runs > 0 ? runsHref([filter ?? {}], { day: day.day }) : null;
            const opens = href === null ? '' : filter === null || line.name === OTHER ? '. Opens all runs of that day' : '. Opens these runs';
            // Only a measured 0% pass rate is a failure mark; a 0 ms latency is not (Codex MSG 2793fa16).
            const bar = <i className="usage-trend-bar" style={style} data-zero={value === 0 && metric === 'pass' ? 'true' : undefined} />;
            return <li key={day.day}>
              {href ? <Link href={href} className="usage-trend-day" data-day={day.day} data-state={day.state} aria-label={label} title={`${label}${opens}`}>{bar}</Link>
                : <span className="usage-trend-day" data-day={day.day} data-state={day.state} role="img" aria-label={label} title={label}>{bar}</span>}
            </li>;
          })}
        </ol>
      </div>)}
      <div className="usage-trend-row usage-trend-axis" aria-hidden="true">
        <span className="usage-trend-name" />
        <ol className="usage-trend-days">{days.map((day, index) => <li key={day.day}>
          <span className="usage-trend-date">{index % 2 === days.length % 2 ? '' : dayLabel(day.day)}</span></li>)}</ol>
      </div>
    </div>
    {by === 'model' && <TierLegend label="Quality over time tier colours" models={series.map(line => line.name)} />}
  </figure>;
}

export function UsageAnalysis({ decisionRows, complete = false }: { decisionRows: readonly unknown[]; complete?: boolean }) {
  const models = useMemo(() => groupDecisions(decisionRows, 'model'), [decisionRows]);
  const coverage = coverageOf(decisionRows);
  const sample = totalsOf(decisionRows).runs;
  if (sample === 0) return <EmptyState data-usage-analysis>No served runs to analyse yet</EmptyState>;
  // Part 30 AC202: four views of one sample, behind tabs; the sample label stays above them so every view keeps it.
  return <section className="usage-analysis" data-usage-analysis aria-label="Usage analysis">
    <p className="local-dashboard-caption">
      {/* OMN-21970 AC3: a read that walked every page holds every served run, so it is not called the latest. */}
      {`From ${complete ? 'all' : 'the latest'} ${sample} served runs${coverage ? `, covering ${dayLabel(coverage.first)} to ${dayLabel(coverage.last)}` : ''}. `}
      Spend counts measured runs, pass rate counts runs with a verdict, latency counts recorded latencies (nearest rank). Savings are on the charts above (metering).
    </p>
    {/* OMN-22168 (Lakshman 2026-11-05, "fix all pages and make it uniform"): Overview's stat tabs, one per view; each hint
        says what the view shows, and the one count is the served sample's model groups. */}
    <DashboardTabs label="Usage analysis views" param="analysis" tabs={[
      { id: 'groups', label: 'Groups', tone: 'var(--ds-field-usage-analysis)', icon: <Layers size={18} />, hint: 'Spend, pass rate, latency',
        panel: () => <GroupsView decisionRows={decisionRows} /> },
      { id: 'matrix', label: 'Model by task', tone: 'var(--ds-field-routing-model)', icon: <LayoutGrid size={18} />,
        hint: `${models.length} ${models.length === 1 ? 'model' : 'models'} by task`, panel: () => <DecisionMatrix decisionRows={decisionRows} /> },
      { id: 'trend', label: 'Quality over time', tone: 'var(--ds-field-pass-rate-daily)', icon: <ChartLine size={18} />, hint: 'Pass rate per day',
        panel: () => <QualityTrend decisionRows={decisionRows} /> },
      { id: 'quality', label: 'Cost versus quality', tone: 'var(--ds-field-quality-comparison)', icon: <Gauge size={18} />, hint: 'Spend against pass rate',
        panel: () => <QualityChart groups={models} /> },
    ]} />
  </section>;
}

/**
 * Part 29 AC196: Runs' compact totals for the current filter, over the rows the filter matches (before paging), labelled
 * as the served sample so they are never read as the canonical totals of Overview and Evidence.
 */
export function RunsTotals({ rows, sample, complete = false }: { rows: readonly unknown[]; sample: number; complete?: boolean }) {
  const totals = totalsOf(rows);
  return <p className="local-dashboard-caption local-runs-totals" data-runs-totals aria-live="polite">
    <span data-total="runs">{`${totals.runs} ${totals.runs === 1 ? 'run' : 'runs'}`}</span>{' · '}
    <span data-total="spend">{totals.spend === null ? 'spend not measured' : `${formatUsd(totals.spend)} spend (${totals.spendMeasured} with a recorded cost)`}</span>{' · '}
    <span data-total="pass">{totals.verdicts === 0 ? 'no verdicts' : `${((totals.passed / totals.verdicts) * 100).toFixed(1)}% passed (${totals.passed} of ${totals.verdicts})`}</span>{' · '}
    <span data-total="p95">{totals.p95 === null ? 'p95 not recorded' : `p95 ${latency(totals.p95)}`}</span>{' · '}
    {/* "Measured" is Overview's word for runs with token counts and a cost; this counts runs with a recorded cost. */}
    <span className="local-runs-totals-scope">{`current filter · ${complete ? 'all' : 'latest'} ${sample} served runs`}</span>
  </p>;
}

/** The routing table's columns: the concept each header's glyph and colour come from, and its label. */
const ROUTING_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['routing-model', 'Requested model'], ['model', 'Routed model'], ['tier', 'Tier'], ['backend', 'Backend'],
  ['completion', 'Finish reason'], ['escalated', 'Escalations'], ['delegations', 'Runs'], ['run-outcome', 'Pass rate'],
];

/**
 * Part 30 AC206: Runs' routing groups, from the returned runs: what each run asked for, the model it ran on, its tier,
 * backend, how it stopped and how often it escalated, with runs and pass rate per group. A field a run did not record is
 * Not recorded, which says nothing about whether the run was dispatched.
 */
export function RoutingAnalysis({ rows, complete = false }: { rows: readonly unknown[]; complete?: boolean }) {
  const routes = useMemo(() => routesOf(rows), [rows]);
  if (routes.length === 0) return <EmptyState>No returned runs to group by route</EmptyState>;
  return <Panel className="local-run-routing" aria-label="Routing" aria-busy="false">
    <PanelTitle><ConceptIcon concept="run-routes" label="Routing" size={16} />Routing</PanelTitle>
    {/* Lakshman 2026-11-05 ("remove From the latest 500 served runs ..."): the note is not shown; it stays in the page for
        assistive tech, since Not recorded must still read as not a dispatch failure (OMN-21166 AC206 D9). */}
    <p className="local-dashboard-caption local-visually-hidden" data-routing-note>
      {`From ${complete ? 'all' : 'the latest'} ${totalsOf(rows).runs} served runs, grouped by requested and routed model, tier, backend, finish reason and escalations. `}
      Not recorded means the run did not record that field; it is not a dispatch failure.
    </p>
    <DataTable data-routing-table aria-label="Runs by route">
        {/* Headers as the run table writes them: each in its column's colour, with its glyph (Lakshman 2026-11-05). */}
        <thead><tr>{ROUTING_HEADERS.map(([concept, label]) => <th scope="col" key={label}>
          <span className="local-table-head" data-field-tone={concept}><ConceptIcon concept={concept} label={label} size={13} />{label}</span></th>)}</tr></thead>
        <tbody>{routes.map(route => {
          const rerouted = route.requested !== NOT_RECORDED && route.routed !== NOT_RECORDED && route.requested !== route.routed;
          return <tr key={[route.requested, route.routed, route.tier, route.backend, route.finish, route.escalations].join('|')}
            data-requested={route.requested} data-routed={route.routed}>
            <td data-cell="requested">{breakableName(route.requested)}</td>
            <td data-cell="routed">{breakableName(route.routed)}{rerouted && <span className="local-route-changed">Rerouted</span>}</td>
            {/* The tier in words, as the tier table names it ("Cheap frontier", not cheap_frontier); the key stays the group. */}
            <td data-cell="tier">{tierLabel(route.tier)}</td>
            <td data-cell="backend">{route.backend}</td>
            <td data-cell="finish">{route.finish}</td>
            <td data-cell="escalations">{route.escalations}</td>
            <td data-cell="runs">{route.totals.runs}</td>
            <td data-cell="pass" data-pass-band={passBand(route.totals.passed, route.totals.verdicts)}>{passText(route.totals)}</td>
          </tr>;
        })}</tbody>
    </DataTable>
    {/* The pass-rate colours' key (Lakshman 2026-11-05). */}
    <p className="local-dashboard-caption local-pass-key">Pass rate {PASS_BANDS.map(entry => <span key={entry.band} data-pass-band={entry.band}><i className="local-pass-swatch" aria-hidden="true" />{entry.label}</span>)}</p>
  </Panel>;
}
