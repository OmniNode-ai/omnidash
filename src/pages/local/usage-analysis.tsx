import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { modelColor } from '@/lib/dashboard-colors';
import { formatUsd } from '@/lib/currency';
import { DashboardTabs, DashboardToggle } from '@/components/dashboard/DashboardTabs';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { DEFAULT_RUNS_VIEW, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import {
  coverageOf, groupDecisions, matrixOf, NOT_RECORDED, OTHER, qualityTrend, routesOf, SMALL_SAMPLE, SPARK_DAYS, totalsOf,
  type Group, type GroupBy, type Totals, type TrendDay, type TrendSeriesBy,
} from './decision-analysis';

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

function Sparkline({ group }: { group: Group }) {
  const peak = Math.max(1, ...group.daily.flatMap(day => (day.runs === null ? [] : [day.runs])));
  return <span className="usage-analysis-spark" role="img"
    aria-label={`${group.name}: runs per day, ${group.daily.filter(day => day.runs === null).length} days before the sample not covered`}>
    {group.daily.map(day => <i key={day.day} data-day={day.day} data-covered={day.runs === null ? 'false' : 'true'} data-runs={day.runs ?? undefined}
      title={day.runs === null ? `${dayLabel(day.day)}: not covered by the sample` : `${dayLabel(day.day)}: ${day.runs} runs`}
      style={day.runs === null ? undefined : { '--spark-height': `${(day.runs / peak) * 100}%` } as CSSProperties} />)}
  </span>;
}

function QualityChart({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState<string | null>(null);
  const plotted = groups.filter(group => group.name !== NOT_RECORDED && group.spend !== null && group.spendMeasured > 0 && group.verdicts > 0);
  const unplotted = groups.filter(group => !plotted.includes(group));
  const perRun = (group: Group) => group.spend! / group.spendMeasured;
  const maxCost = Math.max(...plotted.map(perRun), 0);
  // The plot starts INSET past the axes so a point at $0 or at 100% never sits on an axis label or leaves the frame.
  const W = 640, H = 260, INSET = 24, PAD = { left: 56, right: 200, top: 24, bottom: 40 };
  const x = (value: number) => PAD.left + INSET + (maxCost === 0 ? 0 : (value / maxCost) * (W - PAD.left - INSET - PAD.right));
  const y = (rate: number) => PAD.top + INSET + (1 - rate) * (H - PAD.top - INSET - PAD.bottom);
  const maxRuns = Math.max(1, ...plotted.map(group => group.runs));
  // Nothing measured to plot: no axes and no $0 ticks, only the list of what could not be drawn.
  if (plotted.length === 0) return <figure className="local-chart usage-analysis-quality" aria-label="Cost versus quality per model">
    <p className="local-dashboard-caption" data-quality-unplotted>No model has both a measured cost and a verdict yet{unplotted.length > 0 ? `: ${unplotted.map(group => group.name).join(', ')}` : ''}</p>
  </figure>;
  return <figure className="local-chart usage-analysis-quality" aria-label="Cost versus quality per model">
    <figcaption className="local-dashboard-caption">Cost per measured run against quality pass rate; point area is runs</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Cost versus quality per model">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="usage-analysis-axis" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} className="usage-analysis-axis" />
      {[0, 0.5, 1].map(rate => <text key={rate} x={PAD.left - 8} y={y(rate) + 4} textAnchor="end" className="usage-analysis-tick">{`${rate * 100}%`}</text>)}
      <text x={x(0)} y={H - 12} textAnchor="middle" className="usage-analysis-tick">{formatUsd(0)}</text>
      <text x={x(maxCost)} y={H - 12} textAnchor="middle" className="usage-analysis-tick">{usd(maxCost)}</text>
      {plotted.map(group => {
        const rate = group.passed / group.verdicts;
        const radius = 5 + 13 * Math.sqrt(group.runs / maxRuns);
        const detail = `${group.name}: ${usd(perRun(group))} per measured run, ${passText(group).replace(' (', ' passed (')}, ${group.runs} runs`;
        // The same words on hover and keyboard focus (the readout under the chart), not only for screen readers.
        return <g key={group.name}>
          <circle data-quality-point={group.name} data-cost={String(perRun(group))} cx={x(perRun(group))} cy={y(rate)} r={radius} tabIndex={0}
            role="img" aria-label={detail} onMouseEnter={() => setActive(detail)} onFocus={() => setActive(detail)}
            onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}
            style={{ '--point-color': modelColor(group.name) } as CSSProperties}><title>{detail}</title></circle>
          <text x={x(perRun(group)) + radius + 4} y={y(rate) + 4} className="usage-analysis-point-name">{group.name}</text>
        </g>;
      })}
    </svg>
    <p className="local-dashboard-caption usage-analysis-readout" data-quality-readout aria-hidden="true">{active ?? ''}</p>
    {unplotted.length > 0 && <p className="local-dashboard-caption" data-quality-unplotted>
      Not drawn (no measured cost or no verdicts): {unplotted.map(group => group.name).join(', ')}</p>}
  </figure>;
}

function GroupsView({ decisionRows }: { decisionRows: readonly unknown[] }) {
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
    <div className="local-dashboard-table-wrap">
      <table data-analysis-table aria-label={`Usage by ${label.toLowerCase()}`}>
        <thead><tr>{header('name', label)}{header('runs', 'Runs')}{header('spend', 'Spend')}
          {header('pass', 'Pass rate')}{header('p50', 'p50 latency')}{header('p95', 'p95 latency')}
          {header('last', 'Last run')}<th scope="col">{`Runs per day (${SPARK_DAYS} days)`}</th></tr></thead>
        <tbody>{sorted.map(group => <tr key={group.name}>
          <th scope="row" data-model-name={by === 'model' && group.name !== NOT_RECORDED ? '' : undefined}
            style={by === 'model' && group.name !== NOT_RECORDED ? { '--model-color': modelColor(group.name) } as CSSProperties : undefined}>{group.name}</th>
          {/* data-label names each value when a phone stacks the rows as cards (Codex MSG 753d170c). */}
          <td data-cell="runs" data-label="Runs">{group.runs}</td>
          <td data-cell="spend" data-label="Spend">{money(group.spend, group.spendMeasured, group.runs)}</td>
          <td data-cell="pass" data-label="Pass rate">{passText(group)}</td>
          <td data-cell="p50" data-label="p50 latency">{latency(group.p50)}</td>
          <td data-cell="p95" data-label="p95 latency">{latency(group.p95)}</td>
          <td data-cell="last" data-label="Last run">{lastText(group.last)}</td>
          <td data-cell="spark" data-label={`Runs per day (${SPARK_DAYS} days)`}><Sparkline group={group} /></td>
        </tr>)}</tbody>
      </table>
    </div>
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
    <div className="local-dashboard-table-wrap usage-matrix-wrap">
      <table data-decision-matrix aria-label={`Models by ${columnLabel.toLowerCase()}`}>
        <thead><tr><th scope="col">Model</th>{matrix.columns.map(column => <th key={column} scope="col" data-col={column}>{columnName(column)}</th>)}</tr></thead>
        <tbody>{matrix.rows.map(row => <tr key={row}>
          <th scope="row" data-model-name={row !== NOT_RECORDED ? '' : undefined}
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
      </table>
    </div>
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
  </figure>;
}

export function UsageAnalysis({ decisionRows }: { decisionRows: readonly unknown[] }) {
  const models = useMemo(() => groupDecisions(decisionRows, 'model'), [decisionRows]);
  const coverage = coverageOf(decisionRows);
  const sample = totalsOf(decisionRows).runs;
  if (sample === 0) return <p className="local-dashboard-empty" role="status" data-usage-analysis>No served runs to analyse yet</p>;
  // Part 30 AC202: four views of one sample, behind tabs; the sample label stays above them so every view keeps it.
  return <section className="usage-analysis" data-usage-analysis aria-label="Usage analysis">
    <p className="local-dashboard-caption">
      {`From the latest ${sample} served runs${coverage ? `, covering ${dayLabel(coverage.first)} to ${dayLabel(coverage.last)}` : ''}. `}
      Spend counts measured runs, pass rate counts runs with a verdict, latency counts recorded latencies (nearest rank). Savings are on the charts above (metering).
    </p>
    <DashboardTabs label="Usage analysis views" param="analysis" tabs={[
      { id: 'groups', label: 'Groups', panel: () => <GroupsView decisionRows={decisionRows} /> },
      { id: 'matrix', label: 'Model by task', panel: () => <DecisionMatrix decisionRows={decisionRows} /> },
      { id: 'trend', label: 'Quality over time', panel: () => <QualityTrend decisionRows={decisionRows} /> },
      { id: 'quality', label: 'Cost versus quality', panel: () => <QualityChart groups={models} /> },
    ]} />
  </section>;
}

/**
 * Part 29 AC196: Runs' compact totals for the current filter, over the rows the filter matches (before paging), labelled
 * as the served sample so they are never read as the canonical totals of Overview and Evidence.
 */
export function RunsTotals({ rows, sample }: { rows: readonly unknown[]; sample: number }) {
  const totals = totalsOf(rows);
  return <p className="local-dashboard-caption local-runs-totals" data-runs-totals aria-live="polite">
    <span data-total="runs">{`${totals.runs} ${totals.runs === 1 ? 'run' : 'runs'}`}</span>{' · '}
    <span data-total="spend">{totals.spend === null ? 'spend not measured' : `${formatUsd(totals.spend)} spend (${totals.spendMeasured} measured)`}</span>{' · '}
    <span data-total="pass">{totals.verdicts === 0 ? 'no verdicts' : `${((totals.passed / totals.verdicts) * 100).toFixed(1)}% passed (${totals.passed} of ${totals.verdicts})`}</span>{' · '}
    <span data-total="p95">{totals.p95 === null ? 'p95 not recorded' : `p95 ${latency(totals.p95)}`}</span>{' · '}
    <span className="local-runs-totals-scope">{`current filter · latest ${sample} served runs`}</span>
  </p>;
}

/**
 * Part 30 AC206: Runs' routing groups, from the returned runs: what each run asked for, the model it ran on, its tier,
 * backend, how it stopped and how often it escalated, with runs and pass rate per group. A field a run did not record is
 * Not recorded, which says nothing about whether the run was dispatched.
 */
export function RoutingAnalysis({ rows }: { rows: readonly unknown[] }) {
  const routes = useMemo(() => routesOf(rows), [rows]);
  if (routes.length === 0) return <p className="local-dashboard-empty" role="status">No returned runs to group by route</p>;
  return <article className="local-dashboard-panel local-run-routing" aria-label="Routing" aria-busy="false">
    <h2 className="local-dashboard-panel-title"><ConceptIcon concept="run-routes" label="Routing" size={16} />Routing</h2>
    <p className="local-dashboard-caption" data-routing-note>
      {`From the latest ${totalsOf(rows).runs} served runs, grouped by requested and routed model, tier, backend, finish reason and escalations. `}
      Not recorded means the run did not record that field; it is not a dispatch failure.
    </p>
    <div className="local-dashboard-table-wrap">
      <table data-routing-table aria-label="Runs by route">
        <thead><tr><th scope="col">Requested model</th><th scope="col">Routed model</th><th scope="col">Tier</th><th scope="col">Backend</th>
          <th scope="col">Finish reason</th><th scope="col">Escalations</th><th scope="col">Runs</th><th scope="col">Pass rate</th></tr></thead>
        <tbody>{routes.map(route => {
          const rerouted = route.requested !== NOT_RECORDED && route.routed !== NOT_RECORDED && route.requested !== route.routed;
          return <tr key={[route.requested, route.routed, route.tier, route.backend, route.finish, route.escalations].join('|')}
            data-requested={route.requested} data-routed={route.routed}>
            <td data-cell="requested">{route.requested}</td>
            <td data-cell="routed">{route.routed}{rerouted && <span className="local-route-changed">Rerouted</span>}</td>
            <td data-cell="tier">{route.tier}</td>
            <td data-cell="backend">{route.backend}</td>
            <td data-cell="finish">{route.finish}</td>
            <td data-cell="escalations">{route.escalations}</td>
            <td data-cell="runs">{route.totals.runs}</td>
            <td data-cell="pass">{passText(route.totals)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </article>;
}
