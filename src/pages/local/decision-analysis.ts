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

/** A served number: a finite number, or a string that is one plain decimal; anything else (blank, a flag, a list) is missing. */
function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^\s*-?\d+(\.\d+)?(e[+-]?\d+)?\s*$/i.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function verdict(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/** The row's time from a valid created_at, else a valid written_at; null when neither is a date. */
function stampOf(row: Row): string | null {
  for (const field of ['created_at', 'written_at']) {
    if (typeof row[field] === 'string' && Number.isFinite(Date.parse(row[field] as string))) return row[field] as string;
  }
  return null;
}

/** The row's UTC day from the same stamp as its time (stampOf); null when it has none. */
export function dayOf(row: Row): string | null {
  const stamp = stampOf(row);
  return stamp === null ? null : new Date(Date.parse(stamp)).toISOString().slice(0, 10);
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
  const stamps = records.map(stampOf).filter((value): value is string => value !== null);
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

/** Part 30 (revision 7) AC203: a cell with fewer verdicts than this is marked a small sample. */
export const SMALL_SAMPLE = 5;
/** Part 30 AC204: the series drawn by name; the rest are summed as Other. */
export const TOP_SERIES = 5;
export const OTHER = 'Other';

const nameOf = (row: Row, by: GroupBy): string => (isMissing(row[GROUP_FIELDS[by]]) ? NOT_RECORDED : String(row[GROUP_FIELDS[by]]));
const notRecordedLast = (a: string, b: string): number => (a === NOT_RECORDED ? 1 : b === NOT_RECORDED ? -1 : 0);

export interface Matrix {
  /** Row names, most runs first; Not recorded last. */
  rows: string[];
  /** Column names in name order; Not recorded last. */
  columns: string[];
  /** The cell's totals, or null when no run has that row and column. */
  cell: (row: string, column: string) => Totals | null;
}

/** AC203: the served sample cross-tabulated by two fields, each cell with its own denominators (totalsOf). */
export function matrixOf(rows: readonly unknown[], rowBy: GroupBy, columnBy: GroupBy): Matrix {
  const cells = new Map<string, Row[]>();
  const rowRuns = new Map<string, number>();
  const columns = new Set<string>();
  for (const row of asRecords(rows)) {
    const rowName = nameOf(row, rowBy), columnName = nameOf(row, columnBy);
    const key = `${rowName}\u0000${columnName}`;
    cells.set(key, [...(cells.get(key) ?? []), row]);
    rowRuns.set(rowName, (rowRuns.get(rowName) ?? 0) + 1);
    columns.add(columnName);
  }
  const totals = new Map([...cells.entries()].map(([key, members]) => [key, totalsOf(members)]));
  return {
    rows: [...rowRuns.keys()].sort((a, b) => notRecordedLast(a, b) || rowRuns.get(b)! - rowRuns.get(a)! || a.localeCompare(b)),
    columns: [...columns].sort((a, b) => notRecordedLast(a, b) || a.localeCompare(b)),
    cell: (row, column) => totals.get(`${row}\u0000${column}`) ?? null,
  };
}

export type TrendSeriesBy = 'all' | 'model' | 'task';
export interface TrendDay {
  day: string;
  /** not-covered: before the sample's first day (never 0); no-runs: covered, no run; no-verdicts: runs, none judged. */
  state: 'not-covered' | 'no-runs' | 'no-verdicts' | 'value';
  runs: number; passed: number; verdicts: number; p95: number | null;
}
export interface TrendSeries {
  name: string;
  /** The field and value this series filters Runs by (Not recorded included); absent for All runs and Other. */
  filter?: { by: GroupBy; value: string };
  days: TrendDay[];
}

/**
 * AC204: per UTC day of the 14 ending on the sample's last day, the pass rate and p95 of one series of runs: every run, or
 * one row per model or task (the five with most runs by name, the rest as Other).
 */
export function qualityTrend(rows: readonly unknown[], by: TrendSeriesBy, days = SPARK_DAYS): TrendSeries[] {
  const records = asRecords(rows);
  const coverage = coverageOf(records);
  if (!coverage) return [];
  const end = Date.parse(`${coverage.last}T00:00:00Z`);
  const window = Array.from({ length: days }, (_, index) => new Date(end - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));
  const series = (name: string, members: Row[], filter?: TrendSeries['filter']): TrendSeries => ({
    name, ...(filter ? { filter } : {}),
    days: window.map(day => {
      if (day < coverage.first) return { day, state: 'not-covered', runs: 0, passed: 0, verdicts: 0, p95: null };
      const totals = totalsOf(members.filter(row => dayOf(row) === day));
      return { day, state: totals.runs === 0 ? 'no-runs' : totals.verdicts === 0 ? 'no-verdicts' : 'value',
        runs: totals.runs, passed: totals.passed, verdicts: totals.verdicts, p95: totals.p95 };
    }),
  });
  if (by === 'all') return [series('All runs', records)];
  // Ranked by runs alone (Codex MSG 2793fa16): a large Not recorded group is drawn by name, not hidden in Other.
  const groups = groupDecisions(records, by).sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  const named = groups.slice(0, TOP_SERIES).map(group => series(group.name, records.filter(row => nameOf(row, by) === group.name), { by, value: group.name }));
  const rest = new Set(groups.slice(TOP_SERIES).map(group => group.name));
  return rest.size === 0 ? named : [...named, series(OTHER, records.filter(row => rest.has(nameOf(row, by))))];
}

export interface Route {
  requested: string; routed: string; tier: string; backend: string; finish: string; escalations: string;
  totals: Totals;
}

/** AC206: the sample grouped by how each run was routed; a field a run did not record is Not recorded, not a failure. */
export function routesOf(rows: readonly unknown[]): Route[] {
  const field = (row: Row, name: string) => (isMissing(row[name]) ? NOT_RECORDED : String(row[name]));
  const groups = new Map<string, { route: Omit<Route, 'totals'>; members: Row[] }>();
  for (const row of asRecords(rows)) {
    const route = { requested: field(row, 'requested_model'), routed: field(row, 'model_name'), tier: field(row, 'cost_tier_name'),
      backend: field(row, 'backend_id'), finish: field(row, 'finish_reason'), escalations: field(row, 'escalation_count') };
    const key = Object.values(route).join('\u0000');
    const entry = groups.get(key) ?? { route, members: [] };
    entry.members.push(row);
    groups.set(key, entry);
  }
  return [...groups.values()].map(({ route, members }) => ({ ...route, totals: totalsOf(members) }))
    .sort((a, b) => b.totals.runs - a.totals.runs || a.requested.localeCompare(b.requested) || a.routed.localeCompare(b.routed));
}
