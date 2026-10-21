/**
 * OMN-21166 AC26 (mockup build; rule change R-B, Lakshman 2026-10-18): the Overview's charts count and group the
 * served delegation.decisions.v1 rows in the browser. Every result here is presentation over those rows, labelled by
 * the page with its window; nothing is written back or shown as a figure the runtime served.
 *
 * A value the runtime did not serve is never turned into a number: a run with no verdict, duration, cost or token count
 * is counted as unrecorded (or unmeasured) beside the figures, never as a pass, 0 ms or $0.
 *
 * Savings are not read here: a savings figure comes from metering-summary.v1 only (OMN-19980 AC2d; Jonah's one
 * per-run exception covers the Runs table alone), so the Overview's savings stay on the served spend-by-day chart.
 */

export type InsightStatus = 'passed' | 'failed' | null;

export interface InsightRun {
  at: number;
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  /** UTC hour, 0 to 23. */
  hour: number;
  status: InsightStatus;
  cause: string | null;
  latencyMs: number | null;
  cost: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tier: string | null;
  task: string | null;
  model: string | null;
}

export const NOT_RECORDED = 'Not recorded';
const DAY_MS = 86_400_000;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** A served number, or a served numeric string; anything else is not a number. */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function verdict(value: unknown): InsightStatus {
  if (value === true || value === 1 || value === '1' || value === 'true') return 'passed';
  if (value === false || value === 0 || value === '0' || value === 'false') return 'failed';
  return null;
}

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** The label a failure detail leads with, before its first colon ("MALFORMED: ..." → "MALFORMED"). */
function causeLabel(detail: unknown): string {
  const served = text(detail);
  if (served === null) return NOT_RECORDED;
  const head = served.split(':')[0]!.trim();
  return head === '' ? NOT_RECORDED : head;
}

/**
 * OMN-19919: one cause for a failed run, shared by the Overview list, the latest runs' filter, the Runs list and the
 * link between them, so all four agree: the served typed terminal_failure_cause (an enum member such as
 * provider_error), else the label its quality_gate_detail leads with, else Not recorded. decisions.v1 does not serve
 * terminal_failure_cause until omnimarket adds it (OMN-19919 AC4); until then every run falls back to the label.
 */
export function failureCauseOf(row: Readonly<Record<string, unknown>>): string {
  return typedFailureCauseOf(row) ?? causeLabel(row.quality_gate_detail);
}

/**
 * The served typed terminal_failure_cause, trimmed, or null when none is served. Padding is not part of a cause, and a
 * value that is only whitespace is no cause at all, so every caller falls back exactly as it does for a missing one.
 * This is the one place the typed cause is normalised; the run cards ask it whether a typed cause exists.
 */
export function typedFailureCauseOf(row: Readonly<Record<string, unknown>>): string | null {
  const cause = typeof row.terminal_failure_cause === 'string' ? row.terminal_failure_cause.trim() : '';
  return cause === '' ? null : cause;
}

/**
 * OMN-19919: a run whose terminal was served not ok failed, even with no quality-gate verdict (a refusal, a provider
 * error or a timeout ends before the gate runs). Otherwise the verdict is the served quality gate's; nothing is
 * inferred from a missing value.
 */
function runVerdict(row: Readonly<Record<string, unknown>>): InsightStatus {
  const gate = verdict(row.quality_gate_passed);
  return verdict(row.terminal_ok) === 'failed' ? 'failed' : gate;
}

/** Served rows → runs. A row with no readable time cannot be placed in a window or on a day, so it is left out. */
export function toInsightRuns(rows: readonly unknown[]): InsightRun[] {
  const runs: InsightRun[] = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const at = Date.parse(String(row.written_at ?? row.created_at ?? ''));
    if (!Number.isFinite(at)) continue;
    const status = runVerdict(row);
    runs.push({
      at,
      day: utcDay(at),
      hour: new Date(at).getUTCHours(),
      status,
      cause: status === 'failed' ? failureCauseOf(row) : null,
      latencyMs: numberOf(row.latency_ms),
      cost: numberOf(row.cost_usd),
      tokensIn: numberOf(row.tokens_input),
      tokensOut: numberOf(row.tokens_output),
      tier: text(row.cost_tier_name),
      task: text(row.task_type),
      model: text(row.model_name),
    });
  }
  return runs;
}

/** The UTC days of a window ending today, oldest first: `days` 1 is today alone. */
export function windowDays(now: number, days: number): string[] {
  const today = Date.parse(`${utcDay(now)}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => utcDay(today - (days - 1 - index) * DAY_MS));
}

export function windowRuns(runs: readonly InsightRun[], now: number, days: number): InsightRun[] {
  const included = new Set(windowDays(now, days));
  return runs.filter(run => included.has(run.day));
}

export interface InsightSummary {
  runs: number;
  passed: number;
  failed: number;
  unrecorded: number;
  /** Passed of the runs with a recorded verdict, in percent; null when none has one. */
  passRate: number | null;
  /** Sum of measured costs; null when no run in the set has one. */
  spend: number | null;
  spendUnmeasured: number;
  tokensIn: number | null;
  tokensInUnmeasured: number;
  tokensOut: number | null;
  tokensOutUnmeasured: number;
  medianLatency: number | null;
}

function measuredSum(values: ReadonlyArray<number | null>): { sum: number | null; missing: number } {
  let sum: number | null = null;
  let missing = 0;
  for (const value of values) {
    if (value === null) missing += 1;
    else sum = (sum === null ? 0 : sum) + value;
  }
  return { sum, missing };
}

export function summary(runs: readonly InsightRun[]): InsightSummary {
  const passed = runs.filter(run => run.status === 'passed').length;
  const failed = runs.filter(run => run.status === 'failed').length;
  const spend = measuredSum(runs.map(run => run.cost));
  const tokensIn = measuredSum(runs.map(run => run.tokensIn));
  const tokensOut = measuredSum(runs.map(run => run.tokensOut));
  const latencies = runs.map(run => run.latencyMs).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  const medianLatency = latencies.length === 0 ? null
    : latencies.length % 2 === 1 ? latencies[middle]!
      : latencies[middle - 1]! / 2 + latencies[middle]! / 2;
  return {
    runs: runs.length,
    passed,
    failed,
    unrecorded: runs.length - passed - failed,
    passRate: passed + failed > 0 ? (passed / (passed + failed)) * 100 : null,
    spend: spend.sum,
    spendUnmeasured: spend.missing,
    tokensIn: tokensIn.sum,
    tokensInUnmeasured: tokensIn.missing,
    tokensOut: tokensOut.sum,
    tokensOutUnmeasured: tokensOut.missing,
    medianLatency,
  };
}

export interface InsightDay extends InsightSummary {
  day: string;
}

/** One entry per UTC day of the window, oldest first; a day with no runs is present with zero runs. */
export function dailySeries(runs: readonly InsightRun[], now: number, days: number): InsightDay[] {
  return windowDays(now, days).map(day => ({ day, ...summary(runs.filter(run => run.day === day)) }));
}

/** Runs per UTC day (rows, oldest first) and hour (columns). */
export function hourGrid(runs: readonly InsightRun[], now: number, days: number): { days: string[]; counts: number[][]; max: number } {
  const gridDays = windowDays(now, days);
  const counts = gridDays.map(day => {
    const hours = new Array<number>(24).fill(0);
    for (const run of runs) if (run.day === day) hours[run.hour] = hours[run.hour]! + 1;
    return hours;
  });
  return { days: gridDays, counts, max: Math.max(0, ...counts.flat()) };
}

/** Runs per duration bucket [edges[i], edges[i+1]); a run with no recorded duration is counted apart. */
export function durationBuckets(runs: readonly InsightRun[], edges: readonly number[]): { buckets: number[]; unrecorded: number } {
  const buckets = new Array<number>(Math.max(0, edges.length - 1)).fill(0);
  let unrecorded = 0;
  for (const run of runs) {
    if (run.latencyMs === null) { unrecorded += 1; continue; }
    const index = edges.findIndex((edge, i) => i < edges.length - 1 && run.latencyMs! >= edge && run.latencyMs! < edges[i + 1]!);
    if (index >= 0) buckets[index] = buckets[index]! + 1;
  }
  return { buckets, unrecorded };
}

export interface InsightGroup {
  key: string;
  runs: number;
  passed: number;
  failed: number;
  unrecorded: number;
}

/** Runs grouped by task, tier or model, most runs first; a run with none recorded is grouped under Not recorded. */
export function countBy(runs: readonly InsightRun[], field: 'task' | 'tier' | 'model'): InsightGroup[] {
  const groups = new Map<string, InsightGroup>();
  for (const run of runs) {
    const key = run[field] ?? NOT_RECORDED;
    const group = groups.get(key) ?? { key, runs: 0, passed: 0, failed: 0, unrecorded: 0 };
    group.runs += 1;
    if (run.status === 'passed') group.passed += 1;
    else if (run.status === 'failed') group.failed += 1;
    else group.unrecorded += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.runs - a.runs || a.key.localeCompare(b.key));
}

export interface InsightCause {
  cause: string;
  count: number;
  /** The earliest and latest run time of this cause in the set, in epoch milliseconds (OV-7, OMN-19919 AC7). */
  firstSeen: number;
  lastSeen: number;
}

/** Failed runs per cause, most first, each with when it was first and last seen. */
export function causes(runs: readonly InsightRun[]): InsightCause[] {
  const groups = new Map<string, InsightCause>();
  for (const run of runs) {
    if (run.status !== 'failed') continue;
    const cause = run.cause ?? NOT_RECORDED;
    const group = groups.get(cause);
    if (group === undefined) groups.set(cause, { cause, count: 1, firstSeen: run.at, lastSeen: run.at });
    else {
      group.count += 1;
      group.firstSeen = Math.min(group.firstSeen, run.at);
      group.lastSeen = Math.max(group.lastSeen, run.at);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
}

/** A running total; a missing day's value (null) carries the total forward. */
export function cumulative(values: ReadonlyArray<number | null>): number[] {
  let total = 0;
  return values.map(value => { if (value !== null) total += value; return total; });
}
