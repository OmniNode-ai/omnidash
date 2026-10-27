import { useMemo, useState, type CSSProperties } from 'react';
import { modelColor } from '@/lib/dashboard-colors';
import { formatUsd } from '@/lib/currency';
import { coverageOf, groupDecisions, NOT_RECORDED, SPARK_DAYS, totalsOf, type Group, type GroupBy, type Totals } from './decision-analysis';

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
  const plotted = groups.filter(group => group.name !== NOT_RECORDED && group.spend !== null && group.spendMeasured > 0 && group.verdicts > 0);
  const unplotted = groups.filter(group => !plotted.includes(group));
  const perRun = (group: Group) => group.spend! / group.spendMeasured;
  const maxCost = Math.max(...plotted.map(perRun), 0);
  const W = 640, H = 240, PAD = { left: 56, right: 24, top: 16, bottom: 40 };
  const x = (value: number) => PAD.left + (maxCost === 0 ? 0 : (value / maxCost) * (W - PAD.left - PAD.right));
  const y = (rate: number) => PAD.top + (1 - rate) * (H - PAD.top - PAD.bottom);
  const maxRuns = Math.max(1, ...plotted.map(group => group.runs));
  return <figure className="local-chart usage-analysis-quality" aria-label="Cost versus quality per model">
    <figcaption className="local-dashboard-caption">Cost per measured run against quality pass rate; point area is runs</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Cost versus quality per model">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="usage-analysis-axis" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} className="usage-analysis-axis" />
      {[0, 0.5, 1].map(rate => <text key={rate} x={PAD.left - 8} y={y(rate) + 4} textAnchor="end" className="usage-analysis-tick">{`${rate * 100}%`}</text>)}
      <text x={PAD.left} y={H - 12} className="usage-analysis-tick">{formatUsd(0)}</text>
      <text x={W - PAD.right} y={H - 12} textAnchor="end" className="usage-analysis-tick">{usd(maxCost)}</text>
      {plotted.map(group => {
        const rate = group.passed / group.verdicts;
        const radius = 5 + 13 * Math.sqrt(group.runs / maxRuns);
        return <g key={group.name}>
          <circle data-quality-point={group.name} data-cost={String(perRun(group))} cx={x(perRun(group))} cy={y(rate)} r={radius} tabIndex={0}
            role="img" aria-label={`${group.name}: ${usd(perRun(group))} per measured run, ${passText(group).replace(' (', ' passed (')}, ${group.runs} runs`}
            style={{ '--point-color': modelColor(group.name) } as CSSProperties} />
          <text x={x(perRun(group)) + radius + 4} y={y(rate) + 4} className="usage-analysis-point-name">{group.name}</text>
        </g>;
      })}
    </svg>
    {unplotted.length > 0 && <p className="local-dashboard-caption" data-quality-unplotted>
      Not drawn (no measured cost or no verdicts): {unplotted.map(group => group.name).join(', ')}</p>}
  </figure>;
}

export function UsageAnalysis({ decisionRows }: { decisionRows: readonly unknown[] }) {
  const [by, setBy] = useState<GroupBy>('model');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'runs', dir: 'desc' });
  const groups = useMemo(() => groupDecisions(decisionRows, by), [decisionRows, by]);
  const models = useMemo(() => groupDecisions(decisionRows, 'model'), [decisionRows]);
  const coverage = coverageOf(decisionRows);
  const sample = totalsOf(decisionRows).runs;
  if (sample === 0) return <p className="local-dashboard-empty" role="status" data-usage-analysis>No served runs to analyse yet</p>;
  const sorted = [...groups].sort((a, b) => {
    const left = sortValue(a, sort.key), right = sortValue(b, sort.key);
    const order = typeof left === 'string' ? String(left).localeCompare(String(right)) : Number(left) - Number(right);
    return sort.dir === 'asc' ? order : -order;
  });
  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })}>{label}</button>
    </th>);
  return <section className="usage-analysis" data-usage-analysis aria-label="Usage analysis">
    <p className="local-dashboard-caption">
      {`From the latest ${sample} served runs${coverage ? `, covering ${dayLabel(coverage.first)} to ${dayLabel(coverage.last)}` : ''}. `}
      Spend counts measured runs, pass rate counts runs with a verdict, latency counts recorded latencies (nearest rank). Savings are on the charts above (metering).
    </p>
    <div className="local-dashboard-filters usage-analysis-group" role="radiogroup" aria-label="Group by">
      {GROUPS.map(group => <label key={group.by}>
        <input type="radio" name="usage-analysis-group" value={group.by} checked={by === group.by} onChange={() => setBy(group.by)} />{group.label}</label>)}
    </div>
    <div className="local-dashboard-table-wrap">
      <table data-analysis-table aria-label={`Usage by ${GROUPS.find(group => group.by === by)!.label.toLowerCase()}`}>
        <thead><tr>{header('name', GROUPS.find(group => group.by === by)!.label)}{header('runs', 'Runs')}{header('spend', 'Spend')}
          {header('pass', 'Pass rate')}{header('p50', 'p50 latency')}{header('p95', 'p95 latency')}
          {header('last', 'Last run')}<th scope="col">{`Runs per day (${SPARK_DAYS} days)`}</th></tr></thead>
        <tbody>{sorted.map(group => <tr key={group.name}>
          <th scope="row" data-model-name={by === 'model' && group.name !== NOT_RECORDED ? '' : undefined}
            style={by === 'model' && group.name !== NOT_RECORDED ? { '--model-color': modelColor(group.name) } as CSSProperties : undefined}>{group.name}</th>
          <td data-cell="runs">{group.runs}</td>
          <td data-cell="spend">{money(group.spend, group.spendMeasured, group.runs)}</td>
          <td data-cell="pass">{passText(group)}</td>
          <td data-cell="p50">{latency(group.p50)}</td>
          <td data-cell="p95">{latency(group.p95)}</td>
          <td data-cell="last">{lastText(group.last)}</td>
          <td data-cell="spark"><Sparkline group={group} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <QualityChart groups={models} />
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
