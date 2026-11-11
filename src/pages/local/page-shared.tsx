// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. Shared helpers of the local pages: rows, times, run status and cause, served cells.
import { formatDashboardCount } from '@/theme/format';
import { readableTime } from '@/theme/format';
import { formatDuration } from '@/theme/format';
import { exactTokens } from '@/components/dashboard/usage/TokenCount';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Check, Copy } from '@/theme/design-system/icons';
import { formatDashboardUsd as formatUsd } from '@/theme/format';
import { workflowHref } from '@/navigation/workflow-url-state';
import { failureCauseLabel, failureDetailText, tierLabel } from '@/pages/local/plain-text';
import { causeLabelOf } from '@/pages/local/run-filter';
import { typedFailureCauseOf } from '@/pages/local/insights';
import { shortId } from '@/components/dashboard/event-dash/primitives';
import { type LocalPageDocument } from '@/layout/local-page-loader';
import { localeString as fmtLocaleString } from '@/theme/format';
import { formatShare } from '@/theme/format';
import { type MetricCardConfig } from '@/pages/local/page-headline';

export function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (typeof value === 'number' && !Number.isFinite(value));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A served count as a number: a finite number or decimal text; anything else (true, {}, '') is not a count. */
export function countOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/** A placeholder or empty model is not a model: Jonah's handoff (OMN-19981, aac9032d) says render it as unknown. */
export function modelOrUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'delegate-skill') return 'unknown';
  return String(value);
}

export function metricConfigFor(page: LocalPageDocument, componentId: string): MetricCardConfig | null {
  const widget = page.dashboard.widgets.find((candidate) => candidate.data_source === componentId);
  const config = widget?.config as Record<string, unknown> | undefined;
  if (!config || typeof config.metric_key !== 'string') return null;
  return config as unknown as MetricCardConfig;
}

export type Row = Record<string, unknown>;

/**
 * The one command that makes a first run (RU-4): the verify step of the local MVP plan
 * (knowledge-base-internal beta/plans/2026-09-28-local-mvp-plan.md, line 181 at main 5d4f2d8).
 */
export const FIRST_RUN_COMMAND = 'onex delegate "ping"';

export function asRecords(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

export function timeOf(value: unknown): number {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Decisions newest first by written_at, the binding's declared ordering authority. */
export function newestFirst(decisions: readonly unknown[]): Row[] {
  return [...asRecords(decisions)].sort((a, b) => timeOf(b.written_at) - timeOf(a.written_at));
}

/** Runs newest first by the time the run table shows (created_at, else written_at), ties by written_at. */
export function byRunTime(decisions: readonly unknown[]): Row[] {
  const shown = (row: Row) => timeOf(row.created_at ?? row.written_at);
  return newestFirst(decisions).sort((a, b) => shown(b) - shown(a) || timeOf(b.written_at) - timeOf(a.written_at));
}

/** A served id to its row. A savings session's session_id is the decision's correlation_id (OMN-19981, aac9032d). */
export function indexBy(rows: readonly unknown[], key: string): Map<string, Row> {
  const index = new Map<string, Row>();
  for (const row of asRecords(rows)) {
    const id = row[key];
    if (typeof id === 'string' && id !== '' && !index.has(id)) index.set(id, row);
  }
  return index;
}

type RunStatus = 'passed' | 'failed' | 'Not recorded';

/**
 * A served boolean, read as Postgres sends it (true/false) or as the local SQLite store does (1/0), which has no
 * boolean type (OMN-20753). Anything else, null included, is not recorded.
 */
export function servedBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  return null;
}

/**
 * A run's status is its served quality-gate verdict; a run with no served decision has none recorded. OMN-19919 AC5:
 * a run whose terminal was served not ok failed even when no verdict was served (it ended before the gate ran).
 */
export function statusOf(decision: Row | undefined): RunStatus {
  if (servedBoolean(decision?.terminal_ok) === false) return 'failed';
  const passed = servedBoolean(decision?.quality_gate_passed);
  if (passed === null) return 'Not recorded';
  return passed ? 'passed' : 'failed';
}

/**
 * A failed run's cause, as the Overview's "Why runs failed" groups it and its link filters it (OMN-19919 AC5, AC7):
 * the served typed terminal_failure_cause, else the label the quality_gate_detail leads with, else Not recorded.
 */
export function causeOf(decision: Row | undefined): string {
  const status = statusOf(decision);
  if (status === 'passed') return 'none';
  if (status === 'Not recorded' || decision === undefined) return 'Not recorded';
  return causeLabelOf(decision);
}

export function displayCauseOf(decision: Row | undefined): string {
  const raw = decision?.terminal_failure_cause;
  const cause = causeOf(decision);
  if (raw !== null && raw !== undefined && typeof raw !== 'string') return failureCauseLabel(raw);
  if (cause === 'none' || cause === 'Not recorded' || (decision !== undefined && typedFailureCauseOf(decision) !== null)) {
    return failureCauseLabel(cause);
  }
  const readable = failureDetailText(cause);
  return readable === 'Failure details unavailable' ? failureCauseLabel(cause) : readable;
}

/** A failed run's served failure detail, the text its cause was read from, kept readable beside the cause. */
export function failureDetailOf(decision: Row | undefined): string | null {
  return statusOf(decision) === 'failed' && !isMissing(decision?.quality_gate_detail) ? String(decision?.quality_gate_detail) : null;
}

/**
 * One run's cause on its own card: the served typed cause, else the whole served detail as before OMN-19919, so a
 * card preserves readable detail while opaque diagnostic codes use a plain unavailable state.
 */
export function causeTextOf(decision: Row | undefined): string {
  if (decision?.terminal_failure_cause !== null && decision?.terminal_failure_cause !== undefined
    && typeof decision.terminal_failure_cause !== 'string') return failureCauseLabel(decision.terminal_failure_cause);
  return decision === undefined || typedFailureCauseOf(decision) === null
    ? failureDetailText(failureDetailOf(decision) ?? 'Not recorded')
    : displayCauseOf(decision);
}

/**
 * OMN-21166 (Lakshman, 2026-10-18): a served fraction or long decimal written for reading (0.8095238095238095 reads
 * 81.0% as a percent, 0.85 as a decimal), with the exact served text kept as the title. A value that is not a number
 * is shown as served; a missing one reads Not recorded.
 */
export function Readable({ value, kind }: { value: unknown; kind: 'percent' | 'decimal' | 'count' }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (kind === 'count') return <span className="local-readable" title={String(value)}>{formatDashboardCount(value)}</span>;
  if (!Number.isFinite(number)) return <>{String(value)}</>;
  const text = kind === 'percent'
    ? formatShare(number)
    : fmtLocaleString(number, 'en-US', { maximumFractionDigits: 2 });
  return <span className="local-readable" title={String(value)}>{text}</span>;
}

export function recordedCount(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatDashboardCount(value);
}
// OMN-22168: a token count reads short by the dashboard count rule; its exact count is the hover title.
export function recordedTokens(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatDashboardCount(value);
}
export function tokensTitle(value: unknown, direction?: 'in' | 'out'): string | undefined {
  return isMissing(value) ? undefined : exactTokens(value, direction);
}

export function recorded(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : String(value);
}

/**
 * A run's cost in dollars, from its delegation.savings.v1 session when one is served, else from the decision row's
 * own measured cost_usd (OMN-20753). The approved display policy truncates to two decimals,
 * preserving tiny nonzero amounts as $0.01. A cost never measured is served null and reads Not recorded, never $0.00.
 */
export function costOf(session: Row | undefined, decision: Row): string {
  const value = isMissing(session?.local_cost_usd) ? decision.cost_usd : session?.local_cost_usd;
  if (isMissing(value)) return 'Not recorded';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not recorded';
  return formatUsd(value);
}

/**
 * Run table item 8 (Lakshman 2026-11-05): a measured zero cost reads "$0", muted, so a free run is told apart from a
 * priced one at a glance; the route is named in its title only ("we are showing them model"), and every other cost is
 * costOf's text.
 */
export function CostCell({ session, run }: { session: Row | undefined; run: Row }) {
  const text = costOf(session, run);
  const value = isMissing(session?.local_cost_usd) ? run.cost_usd : session?.local_cost_usd;
  // Lakshman 2026-11-05 (a free cheap-frontier run read "$0.00" in ink beside the local runs' grey "$0"): every served
  // zero takes the short, muted form, whatever the route; the route is named in its title. The short form drops the
  // served zero's empty cents ("$0.00" to "$0"); the figure is still the served one.
  const route = isMissing(run.cost_tier_name) ? '' : `, ${tierLabel(run.cost_tier_name).toLowerCase()} route`;
  return !isMissing(value) && Number(value) === 0
    ? <span className="local-cost-free" title={`${text}${route}`}>{text.replace(/\.0+$/, '')}</span> : <>{text}</>;
}

/** A plain decimal as the store serves it: optional minus, digits, optional fraction. No exponent, no grouping. */
const SERVED_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * OMN-21015 AC3: one run's modelled saving as served on delegation.decisions.v1, named against the baseline it was priced
 * against. The page formats the served figure and computes nothing. A run that was not measured says why, never 0; a
 * measured zero is a zero. Decimal text is formatted as dashboard money: two decimals, up to four under $1 (OMN-22168)
 * without changing the source value; anything that is not a plain decimal is not shown as a figure.
 */
export function runModelledCell(run: Row, withBaseline = true): string {
  // withBaseline false: the table names one shared baseline in its Saving header's tooltip, so each cell shows the
  // figure alone (Lakshman 2026-11-05, run table item 1, and "instead of column vs claude-sonnet-5-5 add into tooltip").
  const figure = run.modelled_savings_usd;
  const notMeasured = run.savings_measurement === 'unknown_tokens' ? 'Not measured: tokens not recorded'
    : run.savings_measurement === 'unknown_spend' ? 'Not measured: cost not recorded'
    : run.savings_measurement === 'baseline_unresolved' ? 'Not measured: baseline not resolved'
    : run.savings_measurement === 'unknown_timestamp' ? 'Not measured: time not recorded' : 'Not measured';
  if (isMissing(figure)) return notMeasured;
  const match = SERVED_DECIMAL.exec(String(figure).trim());
  if (match === null) return 'Not measured';
  return withBaseline ? `${formatUsd(figure)} vs ${recorded(run.savings_baseline_model)}` : formatUsd(figure);
}

/** The route tier as served, with its cost regime beside it when the row carries one (OMN-13649, OMN-20225). */
export function tierOf(decision: Row): string {
  if (isMissing(decision.cost_tier_name)) return 'Not recorded';
  const name = tierLabel(decision.cost_tier_name);
  return isMissing(decision.cost_tier_type) ? name : `${name} (${tierLabel(decision.cost_tier_type).toLowerCase()})`;
}

/** OMN-21166 AC55: "12.2 s", one formatter for every page; the exact served milliseconds go in the title. */
export function duration(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatDuration(value);
}

export function age(value: unknown, now: number): string {
  const time = timeOf(value);
  if (!Number.isFinite(time)) return 'Not recorded';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function utcDay(time: number): string {
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

export interface RunViewProps {
  decisions: readonly unknown[];
  sessions: readonly unknown[];
  now?: number;
}

/**
 * WF-3: a run's id as the way into its path on Workflow, wherever the run is named. A run with no recorded id has
 * nothing to open, so it reads Not recorded and is not a link.
 */
export function RunRef({ id, short = false }: { id: unknown; short?: boolean }) {
  // `short` (OMN-21166 R-A): a run table shows a long id's head and tail; the link target and title keep the whole id.
  return typeof id === 'string' && id !== ''
    ? <Link href={workflowHref(id)} title={id} aria-label={short ? id : undefined}>{short ? shortId(id) : id}</Link>
    : <>{recorded(id)}</>;
}

/**
 * Copy one piece of shown text (a run id, a command). It copies exactly the text it is given and says what happened:
 * Copied only after the clipboard took it, Copy failed when there is no clipboard or it refused.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  // What the last copy did, kept with the text it copied: the button says so only while that text is still the one
  // beside it. On Workflow the run id changes under a mounted button when a newer run arrives.
  const [result, setResult] = useState<{ text: string; state: 'copied' | 'failed' } | null>(null);
  const started = useRef(0);
  const state = result !== null && result.text === text ? result.state : 'idle';
  const copy = async () => {
    const mine = ++started.current;
    // Of overlapping copies only the one started last reports: it is the one the reader asked for last.
    const report = (outcome: 'copied' | 'failed') => { if (mine === started.current) setResult({ text, state: outcome }); };
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      report('copied');
    } catch {
      report('failed');
    }
  };
  return (
    <button type="button" className="local-copy" data-state={state} aria-label={label} onClick={() => { void copy(); }}>
      {state === 'copied' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </button>
  );
}

/**
 * A served timestamp in a run table, written for reading (OMN-21166 rule change R-A, Lakshman 2026-10-18): month, day
 * and time to the second, with its offset (UTC for Z or +00:00). Nothing is converted: the reader's time zone never
 * moves the figure, and another offset is written as served. The exact served text stays on the element, as its
 * datetime and title. A timestamp in any other form is shown exactly as served.
 */
export function CellTime({ value }: { value: unknown }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const text = String(value);
  const readable = readableTime(text);
  return readable === null ? <>{text}</> : <time className="local-cell-time" dateTime={text} title={text}>{readable}</time>;
}
