import { summary, toInsightRuns, windowDays, windowRuns, type InsightRun } from './insights';

type Row = Record<string, unknown>;

function records(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

function number(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function dayBefore(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
}

export interface WindowComparison {
  currentPassRate: number | null;
  previousPassRate: number | null;
  passRateDeltaPoints: number | null;
  previousComplete: boolean;
  currentRuns: number;
  previousRuns: number;
  /** OMN-21304: the previous window's runs with a served verdict, the population its pass rate is over. */
  previousVerdicts: number;
  currentMedianLatency: number | null;
  previousMedianLatency: number | null;
  runsDelta: number | null;
  medianLatencyDelta: number | null;
}

/** Compare equal UTC windows. A 500-row result cannot prove a previous window it no longer covers. */
export function compareWindow(rows: readonly unknown[], now: number, days: number): WindowComparison {
  const runs = toInsightRuns(rows);
  const currentDays = windowDays(now, days);
  const previousDays = Array.from({ length: days }, (_, i) => dayBefore(currentDays[0]!, days - i));
  const current = summary(windowRuns(runs, now, days));
  const previousSet = new Set(previousDays);
  const previousRuns = runs.filter(run => previousSet.has(run.day));
  const oldest = runs.reduce((value, run) => Math.min(value, run.at), Number.POSITIVE_INFINITY);
  const previousComplete = Number.isFinite(oldest) && oldest <= Date.parse(`${previousDays[0]}T00:00:00Z`);
  const previous = summary(previousRuns);
  return {
    currentPassRate: current.passRate,
    previousPassRate: previousComplete ? previous.passRate : null,
    passRateDeltaPoints: previousComplete && current.passRate !== null && previous.passRate !== null
      ? current.passRate - previous.passRate : null,
    previousComplete,
    currentRuns: current.runs,
    previousRuns: previous.runs,
    previousVerdicts: previous.passed + previous.failed,
    currentMedianLatency: current.medianLatency,
    previousMedianLatency: previousComplete ? previous.medianLatency : null,
    runsDelta: previousComplete ? current.runs - previous.runs : null,
    medianLatencyDelta: previousComplete && current.medianLatency !== null && previous.medianLatency !== null
      ? current.medianLatency - previous.medianLatency : null,
  };
}

export interface MeteringDay {
  day: string;
  served: boolean;
  spend: number | null;
  saved: number | null;
  counterfactual: number | null;
  runs: number | null;
}

export interface MeteringWindow {
  available: boolean;
  windowComplete: boolean;
  reason: string | null;
  baseline: string | null;
  days: MeteringDay[];
  spend: number | null;
  saved: number | null;
  counterfactual: number | null;
  cumulativeSaved: (number | null)[];
}

/**
 * The newest served all-time row, or why there is none. One row is that row whatever its time. With several rows an
 * unparseable or missing as_of is an unknown time, never time 0: the newest cannot be named, so it is refused.
 * Two rows of the same newest time are refused too, never merged.
 */
export function latestAllRow(rows: readonly unknown[]): Row | 'none' | 'ambiguous' {
  const all = records(rows).filter(row => row.window_kind === 'all');
  if (all.length === 0) return 'none';
  if (all.length === 1) return all[0]!;
  const times = all.map(row => (typeof row.as_of === 'string' ? Date.parse(row.as_of) : Number.NaN));
  if (times.some(time => Number.isNaN(time))) return 'ambiguous';
  const newest = Math.max(...times);
  const latest = all.filter((_, index) => times[index] === newest);
  return latest.length === 1 ? latest[0]! : 'ambiguous';
}

function baselineOf(row: Row): string | null {
  const value = row.baseline_model;
  return value === null || value === undefined || value === '' ? null : String(value);
}

/** Use one served baseline and its day rows; never sum across baselines or turn a missing figure into zero. */
export function aggregateMeteringWindow(rows: readonly unknown[], now: number, days: number): MeteringWindow {
  const allRow = latestAllRow(rows);
  if (allRow === 'none') return unavailableMetering('Daily metering data is unavailable: no served baseline row.');
  if (allRow === 'ambiguous') return unavailableMetering('Daily metering data is unavailable: the served baseline is ambiguous.');
  const baselineValue = allRow.baseline_model;
  const baseline = baselineOf(allRow);
  const selected = records(rows).filter(row => row.window_kind === 'day'
    && row.baseline_model === baselineValue && typeof row.window_start === 'string');
  if (selected.length === 0) return unavailableMetering('Daily metering data is unavailable: no day rows are served.');
  const selectedDays = windowDays(now, days);
  const byDay = new Map<string, Row>();
  for (const row of selected) {
    const day = String(row.window_start);
    if (byDay.has(day)) return unavailableMetering(`Daily metering data is unavailable: duplicate rows for ${day}.`);
    byDay.set(day, row);
  }
  const dayRows = selectedDays.map(day => {
    const row = byDay.get(day);
    return {
      day,
      served: row !== undefined,
      spend: row ? number(row.spend_usd) : null,
      saved: row ? number(row.savings_usd) : null,
      counterfactual: row ? number(row.counterfactual_usd) : null,
      runs: row ? number(row.runs_total) : null,
    };
  });
  return {
    available: true,
    windowComplete: selectedDays.every(day => byDay.has(day)),
    reason: null,
    baseline,
    days: dayRows,
    spend: completeTotal(dayRows.map(row => row.spend)),
    saved: completeTotal(dayRows.map(row => row.saved)),
    counterfactual: completeTotal(dayRows.map(row => row.counterfactual)),
    cumulativeSaved: cumulative(dayRows),
  };
}

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * AC42 custom window (Lakshman 2026-10-21 ~19:10Z): the served day rows whose UTC date falls inside start..end, summed
 * by aggregateMeteringWindow. A range that reaches past the first or last served day row is unavailable, as is one with
 * a day that has no served row; neither is ever a partial total or a zero.
 */
export function aggregateMeteringRange(rows: readonly unknown[], start: string, end: string): MeteringWindow {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!UTC_DATE.test(start) || !UTC_DATE.test(end) || !Number.isFinite(first) || !Number.isFinite(last)) {
    return unavailableMetering('Choose both UTC dates for this range.');
  }
  // Date.parse rolls a date the calendar does not have (2026-04-31) into the next day, so a date counts only when it
  // reads back unchanged; otherwise April 31 would return May 1's total.
  if (new Date(first).toISOString().slice(0, 10) !== start || new Date(last).toISOString().slice(0, 10) !== end) {
    return unavailableMetering('Choose dates that exist on the UTC calendar.');
  }
  if (last < first) return unavailableMetering('End date must be on or after the start date.');
  const servedDays = records(rows)
    .filter(row => row.window_kind === 'day' && typeof row.window_start === 'string' && UTC_DATE.test(row.window_start))
    .map(row => String(row.window_start)).sort();
  if (servedDays.length === 0) return unavailableMetering('Daily metering data is unavailable: no day rows are served.');
  const firstServed = servedDays[0]!;
  const lastServed = servedDays[servedDays.length - 1]!;
  if (start < firstServed || end > lastServed) {
    return unavailableMetering(`This date range reaches outside the dates with served daily rows (${firstServed} to ${lastServed}), so its totals are unavailable.`);
  }
  return aggregateMeteringWindow(rows, last, Math.round((last - first) / 86_400_000) + 1);
}

export interface MeteringAllTime {
  available: boolean;
  reason: string | null;
  baseline: string | null;
  spend: number | null;
}

/**
 * AC42 All window (Lakshman 2026-10-21 ~19:10Z; spend only, ~19:40Z, AC37): the spend of the one served all-time row,
 * as served. The Overview's one savings number is its headline card, so no savings figure is read here. Nothing is
 * summed or derived; a missing value stays null.
 */
export function meteringAllTimeTotals(rows: readonly unknown[]): MeteringAllTime {
  const row = latestAllRow(rows);
  if (row === 'none') return unavailableAllTime('All-time metering totals are not served yet.');
  if (row === 'ambiguous') return unavailableAllTime('All-time metering totals are unavailable: two all-time rows were served for the same time.');
  return { available: true, reason: null, baseline: baselineOf(row), spend: number(row.spend_usd) };
}

function unavailableAllTime(reason: string): MeteringAllTime {
  return { available: false, reason, baseline: null, spend: null };
}

function unavailableMetering(reason: string): MeteringWindow {
  return { available: false, windowComplete: false, reason, baseline: null, days: [], spend: null, saved: null, counterfactual: null, cumulativeSaved: [] };
}

function measuredTotal(values: readonly (number | null)[]): number | null {
  let total: number | null = null;
  for (const value of values) if (value !== null) total = (total ?? 0) + value;
  return total;
}

function cumulative(days: readonly MeteringDay[]): (number | null)[] {
  let total: number | null = null;
  let unknownContribution = false;
  return days.map(day => {
    if (!day.served) return total;
    if (day.saved === null) {
      total = null;
      unknownContribution = true;
      return null;
    }
    if (unknownContribution) return null;
    total = (total ?? 0) + day.saved;
    return total;
  });
}

export interface UsageModelAggregate {
  model: string;
  routes: string[];
  calls: number | null;
  share: number | null;
  measuredCost: number | null;
  measuredCalls: number | null;
  unmeasuredCalls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  passRate: number | null;
  returnedRuns: number;
  recordedVerdicts: number;
}

export interface UsageDayAggregate {
  day: string;
  measuredCostPerCall: number | null;
  measuredCalls: number | null;
  unmeasuredCalls: number | null;
}

export interface UsageAggregates {
  models: UsageModelAggregate[];
  days: UsageDayAggregate[];
}

/** Presentation over served usage and decision rows. Metering stays in its separately bound panel. */
export function aggregateUsageRows(
  usageRows: readonly unknown[],
  decisionRows: readonly unknown[],
  now: number,
  days: number,
): UsageAggregates {
  const window = new Set(windowDays(now, days));
  const usage = records(usageRows).filter(row => typeof row.usage_day === 'string' && window.has(row.usage_day));
  const decisionRuns = toInsightRuns(decisionRows).filter(run => window.has(run.day));
  const groups = new Map<string, Row[]>();
  for (const row of usage) {
    const name = typeof row.model_id === 'string' && row.model_id !== '' ? row.model_id : 'Unknown model';
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  const callsByModel = [...groups.entries()].map(([model, rows]) => ({ model, rows, calls: totalKnown(rows.map(row => number(row.call_count))) }));
  const callsTotal = callsByModel.every(row => row.calls !== null)
    ? callsByModel.reduce((sum, row) => sum + row.calls!, 0) : null;
  const models = callsByModel.map(({ model, rows, calls }) => {
    const measured = rows.map(row => number(row.measured_cost_usd));
    const measuredCost = measuredTotal(measured);
    const callPairs = rows.map(row => ({ total: number(row.call_count), missing: number(row.unmeasured_call_count) }));
    const countsKnown = rows.length > 0 && callPairs.every(pair => pair.total !== null && pair.missing !== null && pair.missing >= 0 && pair.missing <= pair.total);
    const measuredCalls = countsKnown ? callPairs.reduce((sum, pair) => sum + pair.total! - pair.missing!, 0) : null;
    const unmeasuredCalls = rows.length > 0 && callPairs.every(pair => pair.missing !== null)
      ? callPairs.reduce((sum, pair) => sum + pair.missing!, 0) : null;
    const modelRuns = decisionRuns.filter(run => run.model === model);
    const passed = modelRuns.filter(run => run.status === 'passed').length;
    const decided = modelRuns.filter(run => run.status !== null).length;
    const routeSet = [...new Set(rows.map(row => typeof row.cost_tier_name === 'string' && row.cost_tier_name !== '' ? row.cost_tier_name : 'Not recorded'))];
    return {
      model,
      routes: routeSet,
      calls,
      share: callsTotal !== null && callsTotal > 0 && calls !== null ? calls / callsTotal : null,
      measuredCost,
      measuredCalls,
      unmeasuredCalls,
      inputTokens: completeTotal(rows.map(row => number(row.input_tokens))),
      outputTokens: completeTotal(rows.map(row => number(row.output_tokens))),
      passRate: decided > 0 ? passed / decided : null,
      returnedRuns: modelRuns.length,
      recordedVerdicts: decided,
    };
  });
  const daysInWindow = windowDays(now, days);
  const usageByDay = new Map<string, Row[]>();
  for (const row of usage) usageByDay.set(String(row.usage_day), [...(usageByDay.get(String(row.usage_day)) ?? []), row]);
  const dayAggregates = daysInWindow.map(day => {
    const rows = usageByDay.get(day) ?? [];
    const costs = rows.map(row => number(row.measured_cost_usd));
    const cost = measuredTotal(costs);
    const pairs = rows.map(row => ({ total: number(row.call_count), missing: number(row.unmeasured_call_count) }));
    const countsKnown = rows.length > 0 && pairs.every(pair => pair.total !== null && pair.missing !== null && pair.missing >= 0 && pair.missing <= pair.total);
    const measuredCalls = countsKnown ? pairs.reduce((sum, pair) => sum + pair.total! - pair.missing!, 0) : null;
    const unmeasuredCalls = rows.length > 0 && pairs.every(pair => pair.missing !== null) ? pairs.reduce((sum, pair) => sum + pair.missing!, 0) : null;
    return {
      day,
      measuredCostPerCall: cost !== null && measuredCalls !== null && measuredCalls > 0 ? cost / measuredCalls : null,
      measuredCalls,
      unmeasuredCalls,
    };
  });
  return { models, days: dayAggregates };
}

function totalKnown(values: readonly (number | null)[]): number | null {
  return values.every(value => value !== null) ? values.reduce((sum, value) => sum + value!, 0) : null;
}

function completeTotal(values: readonly (number | null)[]): number | null {
  return values.length > 0 && values.every(value => value !== null)
    ? values.reduce((sum, value) => sum + value!, 0) : null;
}

export function durationEdges(): readonly number[] {
  return [0, 1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, Number.POSITIVE_INFINITY];
}

export function durationBucketLabel(index: number): string {
  const edges = durationEdges();
  if (index < 0 || index >= edges.length - 1) return 'Not recorded';
  const label = (value: number) => value >= 1_000 ? `${value / 1_000} second${value === 1_000 ? '' : 's'}` : `${value} ms`;
  return index === edges.length - 2 ? `${label(edges[index]!)} or more` : `${label(edges[index]!)} to ${label(edges[index + 1]!)}`;
}

export function durationDistribution(runs: readonly InsightRun[]): { labels: string[]; buckets: number[]; unrecorded: number } {
  const edges = durationEdges();
  const buckets = new Array<number>(edges.length - 1).fill(0);
  let unrecorded = 0;
  for (const run of runs) {
    if (run.latencyMs === null) { unrecorded += 1; continue; }
    const index = edges.findIndex((edge, i) => i < edges.length - 1 && run.latencyMs! >= edge && run.latencyMs! < edges[i + 1]!);
    if (index >= 0) buckets[index] = buckets[index]! + 1;
  }
  return { labels: buckets.map((_, index) => durationBucketLabel(index)), buckets, unrecorded };
}
