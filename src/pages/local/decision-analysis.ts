/**
 * OMN-21166 part 29 (revision 6) AC194 to AC196: summaries of the served delegation decisions, the latest N rows the
 * dashboard reads (not all-time totals, which come from the metering aggregate). Every rate keeps its own denominator:
 * spend counts only rows with a measured cost (a measured 0 is a value), the pass rate counts only rows with
 * a verdict, and latency percentiles use only recorded latencies (nearest rank). A day before the sample's first day
 * is not covered, never 0. Savings are not summed here: OMN-19980 AC2d keeps every savings figure on metering-summary.v1.
 */
type Row = Record<string, unknown>;

export type GroupBy = 'model' | 'tier' | 'task' | 'backend';
export const GROUP_FIELDS: Readonly<Record<GroupBy, string>> = { model: 'model_name', tier: 'cost_tier_name', task: 'task_type', backend: 'backend_id' };
export const NOT_RECORDED = 'Not recorded';
/** How many UTC days a group's sparkline covers (AC194). */
export const SPARK_DAYS = 14;

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value));
}

function asRecords(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

function number(value: unknown): number | null {
  if (isMissing(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function verdict(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/** The row's UTC day from created_at, else written_at; null when neither is a date. */
export function dayOf(row: Row): string | null {
  for (const field of ['created_at', 'written_at']) {
    const time = typeof row[field] === 'string' ? Date.parse(row[field] as string) : Number.NaN;
    if (Number.isFinite(time)) return new Date(time).toISOString().slice(0, 10);
  }
  return null;
}

/** Nearest-rank percentile of recorded values; null when there are none. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

export interface Totals {
  runs: number;
  /** Sum over measured rows, or null when no row has a measured cost. */
  spend: number | null; spendMeasured: number;
  passed: number; verdicts: number;
  p50: number | null; p95: number | null; latencies: number;
  last: string | null;
}

export function totalsOf(rows: readonly unknown[]): Totals {
  const records = asRecords(rows);
  const costs = records.map(row => number(row.cost_usd)).filter((value): value is number => value !== null);
  const verdicts = records.map(row => verdict(row.quality_gate_passed)).filter((value): value is boolean => value !== null);
  const latencies = records.map(row => number(row.latency_ms)).filter((value): value is number => value !== null && value >= 0);
  const stamps = records.map(row => (typeof row.created_at === 'string' ? row.created_at : typeof row.written_at === 'string' ? row.written_at : null))
    .filter((value): value is string => value !== null && Number.isFinite(Date.parse(value)));
  return {
    runs: records.length,
    spend: costs.length === 0 ? null : costs.reduce((sum, value) => sum + value, 0), spendMeasured: costs.length,
    passed: verdicts.filter(Boolean).length, verdicts: verdicts.length,
    p50: percentile(latencies, 50), p95: percentile(latencies, 95), latencies: latencies.length,
    last: stamps.length === 0 ? null : stamps.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest)),
  };
}

/** The sample's first and last UTC days; null when no row carries a date. */
export function coverageOf(rows: readonly unknown[]): { first: string; last: string } | null {
  const days = asRecords(rows).map(dayOf).filter((day): day is string => day !== null).sort();
  return days.length === 0 ? null : { first: days[0]!, last: days[days.length - 1]! };
}

export interface Group extends Totals {
  name: string;
  /** Runs per UTC day for the 14 days ending on the sample's last day; null for a day before the sample's coverage. */
  daily: Array<{ day: string; runs: number | null }>;
}

export function groupDecisions(rows: readonly unknown[], by: GroupBy, days = SPARK_DAYS): Group[] {
  const records = asRecords(rows);
  const coverage = coverageOf(records);
  const field = GROUP_FIELDS[by];
  const groups = new Map<string, Row[]>();
  for (const row of records) {
    const name = isMissing(row[field]) ? NOT_RECORDED : String(row[field]);
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  const window: string[] = [];
  if (coverage) {
    const end = Date.parse(`${coverage.last}T00:00:00Z`);
    for (let index = days - 1; index >= 0; index--) window.push(new Date(end - index * 86_400_000).toISOString().slice(0, 10));
  }
  return [...groups.entries()].map(([name, members]) => ({
    name, ...totalsOf(members),
    daily: window.map(day => ({ day, runs: coverage && day < coverage.first ? null : members.filter(row => dayOf(row) === day).length })),
  })).sort((a, b) => (a.name === NOT_RECORDED ? 1 : b.name === NOT_RECORDED ? -1 : b.runs - a.runs || a.name.localeCompare(b.name)));
}
