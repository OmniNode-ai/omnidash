import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import {
  ArrowDownUp, ArrowUpRight, Award, Bot, CalendarDays, ChartLine, ChartSpline, Check, ChevronRight, CircleDollarSign, CloudOff, Coins, Copy, DatabaseZap,
  CircleDot, Flag, History, IdCard, Inbox, KeyRound, PiggyBank, Route, Server, ShieldCheck, Shrink, TrendingDown,
  Rows3, Scale, TableProperties, Waypoints, Cloud, Sparkles, Zap,
  type LucideIcon,
} from 'lucide-react';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { resolveConfiguredTenant } from '@/data-source/projection-tenant';
import { UsageByModelDayTable, UsageTokensByDay, formatUsd } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { MeteringDaySeries } from '@/components/dashboard/usage/SavingsSeriesWidget';
import { TenantNotConfiguredState } from '@/components/dashboard/TenantNotConfiguredState';
import { requestLocalPageRefresh, subscribeLocalPageRefresh } from '@/services/local-page-refresh';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import { PAGE_PATHS } from '@/navigation/page-routes';
import { normaliseRunId, readWorkflowRunId, workflowHref, writeWorkflowRunId } from '@/navigation/workflow-url-state';
import { RunDurationChart, RunMetricChart, RunTimingChart, RunTokensChart, SpendByDayChart, UNRESOLVED_BASELINE, type ListedRun } from '@/pages/local/charts';
import { PassRateMeter, TierShareChart, TIER_TONES } from '@/pages/local/shares';
import { InsightsSection, InsightsWindowContext, OverviewRunsContext, TaskIcon } from '@/pages/local/insight-charts';
import { SinceLastVisit } from '@/pages/local/since-last-visit';
import { RunFilterProvider, causeLabelOf, useRunFilter } from '@/pages/local/run-filter';
import { shortId } from '@/components/dashboard/event-dash/primitives';
import { FieldIcon } from '@/components/dashboard/FieldIcon';
import { modelIdentityStyle } from '@/components/dashboard/model-identity';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import '@/styles/local-dashboard.css';
import { DestinationIcon } from '@/navigation/destination-icons';
import { FlowConnector, WorkflowDecisionCharts, WorkflowRecordDetails, WorkflowRoutingFlow } from '@/pages/local/workflow-analysis';
import {
  loadLocalPageConfig,
  loadLocalPageSnapshots,
  rowsForLocalBinding,
  rowsForLocalComponent,
  resolveLocalPageEmptyState,
  withLastGood,
  newestRunId as newestWorkflowRunId,
  DELEGATION_DECISIONS_TOPIC,
  METERING_SUMMARY_TOPIC,
  RUN_TRACE_TOPIC,
  LOCAL_READ_TIMEOUT_MS,
  type BoundProjectionSnapshot,
  type LocalPageDocument,
  type LocalPageName,
} from '@/layout/local-page-loader';

interface LocalDashboardPageProps {
  pageName: LocalPageName;
  syncUrl?: boolean;
  navigationCache?: LocalDashboardCache;
}

export interface LocalDashboardCache {
  context: string | null;
  snapshots: Map<string, BoundProjectionSnapshot>;
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (typeof value === 'number' && !Number.isFinite(value));
}

export interface MetricCardConfig {
  metric_key: string;
  label: string;
  format?: 'number' | 'currency' | 'percent' | 'duration';
  precision?: number;
  unit?: string | null;
}

function formatMetric(value: number, config: MetricCardConfig): string {
  // OMN-21166 (Lakshman, 2026-10-18): an exact zero reads $0.00, not $0.0000; other figures keep their declared precision.
  const digits = config.format === 'currency' && value === 0 ? 2 : config.precision ?? 0;
  const grouped = value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (config.format === 'currency') return value < 0 ? `-$${grouped.slice(1)}` : `$${grouped}`;
  if (config.format === 'percent') return `${grouped}%`;
  return grouped;
}

interface MetricCardProps {
  component: LocalPageDocument['components'][number];
  config: MetricCardConfig;
  row: Record<string, unknown>;
  /** The served row of the component's second binding, rendered as a line under the figure. */
  caption?: Record<string, unknown> | null;
  /** A line shown directly under the figure, and only when there is a figure. */
  figureLine?: string | null;
  /** Required fields read only for `figureLine`: when one is absent or null the line goes, never the figure. */
  figureLineFields?: readonly string[];
}

/**
 * A card without a served binding shows NOT_AVAILABLE_YET (AC39); the exposures such cards will read are named only
 * here: overview-avg-saving-per-call reads metering-summary.v1 (OMN-20009, migration 0002), and overview-compression
 * and overview-cache-hit-rate read metering-summary.v1 (OMN-20226, migration 0003).
 */

/** AK-3: cloud keys are not linked in the local MVP; one line, no form. */
const CLOUD_NOT_LINKED = 'Cloud keys are not linked in the local runtime. There is nothing to set here.';

/** AC39: the one plain waiting line for a figure whose source is not served yet; no exposure or field is named. */
export const NOT_AVAILABLE_YET = 'Not available yet';

/**
 * AC39: failure text a user may read. The loader keeps the exposure name in `failure.message` for contracts and
 * tests; the page shows what it means in plain words.
 */
export function plainFailureMessage(failure: { kind: string; message: string }): string {
  switch (failure.kind) {
    case 'not-served': return `${NOT_AVAILABLE_YET}.`;
    case 'timeout': return 'No answer within 5 seconds.';
    case 'tenant-not-configured': return 'No tenant is configured for this dashboard.';
    default: {
      const status = /HTTP \d{3}.*$/.exec(failure.message)?.[0];
      return status ? `The data could not be read (${status}).` : 'The data could not be read.';
    }
  }
}

/** A component bound to no served exposure: what it waits on, never a blank panel (FR-3 partial pages, SV-3). */
export function PendingState({ componentId }: { componentId: string }) {
  if (componentId === 'api-keys-cloud') return <p className="local-dashboard-empty" role="status">{CLOUD_NOT_LINKED}</p>;
  return (
    <p className="local-dashboard-empty" role="status">
      {NOT_AVAILABLE_YET}
    </p>
  );
}

const SAVINGS_MODELLED = "Modelled: the runs' tokens priced at the baseline model's list price. The baseline never ran.";

function captionText(caption: Record<string, unknown> | null | undefined): string | null {
  if (!caption) return null;
  const fields = caption;
  const parts: string[] = [];
  if ('baseline_model' in fields) {
    parts.push(isMissing(fields.baseline_model) ? 'Baseline unresolved' : `Baseline ${String(fields.baseline_model)}`);
  }
  if ('pricing_manifest_version' in fields && !isMissing(fields.pricing_manifest_version)) {
    parts.push(`pricing manifest v${String(fields.pricing_manifest_version)}`);
  }
  if ('zero_token_run_count' in fields && !isMissing(fields.zero_token_run_count)) {
    parts.push(`Zero-token runs: ${String(fields.zero_token_run_count)}`);
  }
  // OMN-19980 Amendment 2: metering-summary.v1's run classes beside Measured runs, from the same all row. Every run is
  // in exactly one class (measured, no token counts, no spend), so the excluded counts are served, never derived.
  if ('runs_total' in fields) {
    parts.push(`Of ${recorded(fields.runs_total)} runs`);
    parts.push(`Unknown-token runs excluded: ${recorded(fields.runs_unknown_tokens)}`);
    parts.push(`Unknown-spend runs excluded: ${recorded(fields.runs_unknown_spend)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One figure from one served exposure row: the field the widget names. A
 * required field that is absent means the figure is not measured; when that
 * field is a baseline, the figure is a savings figure with no priced baseline,
 * which is BASELINE_UNRESOLVED and never a zero. No row at all is Not measured.
 */
export function MetricCard({ component, config, row, caption, figureLine, figureLineFields = [] }: MetricCardProps) {
  if ((component.data_bindings ?? []).length === 0) {
    return <p className="local-dashboard-empty" role="status">{NOT_AVAILABLE_YET}</p>;
  }
  const required = (component.data_bindings?.[0]?.required_fields ?? [config.metric_key])
    .filter((field) => !figureLineFields.includes(field));
  const missing = [...new Set([config.metric_key, ...required])].filter((field) => isMissing(row[field]));
  let figure = false;
  let text: string;
  // No served row is not an unresolved baseline: nothing was measured (OMN-19980 AC2c).
  if (Object.keys(row).length === 0) text = 'Not measured';
  // A metering-summary.v1 row says so itself: an unpriced baseline leaves its saving null (OMN-19977 AC7). Only a
  // card that asks for baseline_state is priced at the baseline; spend, run counts and tokens are not (Amendment 2).
  else if (row.baseline_state === 'unresolved' && required.includes('baseline_state')) text = 'Baseline unresolved';
  else if (missing.some((field) => field.includes('baseline'))) text = 'Baseline unresolved';
  else if (missing.length > 0) text = 'Not measured';
  else {
    text = formatMetric(Number(row[config.metric_key]), config);
    figure = true;
  }
  const line = captionText(caption);
  // A savings figure is a modelled counterfactual: served tokens priced at the baseline's list price, with no
  // baseline run behind it (Jonah's savings handoff on OMN-19981, aac9032d, item 5).
  const modelled = caption !== null && caption !== undefined && 'baseline_model' in caption;
  return (
    <>
      <p className="local-dashboard-metric" data-measured={figure}>{text}</p>
      {figure && figureLine && <p className="local-dashboard-caption">{figureLine}</p>}
      {/* OMN-21166 (Lakshman, 2026-10-18): the card's further lines fold under Details, every word kept. */}
      {(line || modelled) && (
        <details className="local-card-details">
          <summary>Details</summary>
          {line && <p className="local-dashboard-caption">{line}</p>}
          {modelled && <p className="local-dashboard-caption">{SAVINGS_MODELLED}</p>}
        </details>
      )}
    </>
  );
}

const ROUTING_SHARE_PENDING = NOT_AVAILABLE_YET;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * OMN-20009: the share of ALL runs whose tier is local, as the model-routing view serves it (local_call_share, over
 * every run, not-tier-routed ones included). The browser formats the served fraction as a percent and divides
 * nothing; the served counts are shown beside it so the not-tier-routed gap stays visible.
 */
export function RunLocallyCard({ row }: { row: Record<string, unknown> | null }) {
  if (row === null) return <NoRunsYet />;
  const byTier = asRecord(row.by_tier);
  if (byTier === null || !('local_call_share' in byTier)) {
    return <p className="local-dashboard-empty" role="status">{ROUTING_SHARE_PENDING}</p>;
  }
  const share = byTier.local_call_share;
  if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) return <p className="local-dashboard-metric" data-measured="false">Not measured</p>;
  const text = share.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div className="local-routing-summary">
      <div className="local-routing-share">
        <p className="local-dashboard-metric">{text}</p>
        <p className="local-dashboard-caption">of all runs executed locally</p>
        <div className="local-routing-meter" role="meter" aria-label="Local share of all runs" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share * 100} aria-valuetext={text}>
          <span style={{ width: `${share * 100}%` }} />
        </div>
      </div>
      <dl className="local-routing-counts">
        <div data-routing-count="local"><dt><Server size={15} aria-hidden="true" />Local runs</dt><dd>{recorded(byTier.local_call_count)}</dd></div>
        <div data-routing-count="total"><dt><Rows3 size={15} aria-hidden="true" />All runs</dt><dd>{recorded(byTier.total_call_count)}</dd></div>
        <div data-routing-count="untiered"><dt><Route size={15} aria-hidden="true" />Without a tier</dt><dd>{recorded(byTier.not_tier_routed_count)}</dd></div>
      </dl>
      <p className="local-routing-note">Runs without a routing tier are included in the total. They are not classified as local or cloud here.</p>
    </div>
  );
}

/** The Tokens card's widget key: two served columns shown side by side, never summed (SV-3: no combined total). */
const TOKENS_IN_AND_OUT = 'tokens_in_and_out';

/**
 * Tokens in and out from one metering-summary.v1 row. The fold sums tokens only over runs that recorded them, so when
 * every run is an unknown-token run the served 0 is not a measurement and reads Not measured, never 0.
 */
function tokensText(row: Record<string, unknown>): string {
  const tokensIn = Number(row.tokens_in);
  const tokensOut = Number(row.tokens_out);
  if (isMissing(row.tokens_in) || isMissing(row.tokens_out) || !Number.isFinite(tokensIn) || !Number.isFinite(tokensOut)) {
    return 'Not measured';
  }
  const withTokens = Number(row.runs_total) - Number(row.runs_unknown_tokens);
  if (!isMissing(row.runs_total) && !isMissing(row.runs_unknown_tokens) && Number.isFinite(withTokens) && withTokens <= 0) {
    return 'Not measured';
  }
  const grouped = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${grouped(tokensIn)} in · ${grouped(tokensOut)} out`;
}

/** OV-3: the window the Overview's metering cards show. The fold serves fixed windows only: all time, and UTC days. */
export type OverviewWindow = 'all' | 'today';

/** Restored by Lakshman's explicit instruction, 2026-10-19: use the populated old Overview aggregate. */
const LEGACY_OVERVIEW_TOPIC = 'onex.snapshot.projection.cost.savings-overview.v1';

export function OverviewAggregateCard({ component, config, rows, window }: {
  component: LocalPageDocument['components'][number]; config: MetricCardConfig;
  rows: readonly unknown[]; window: OverviewWindow;
}) {
  const unavailable = (message: string) => <p className="local-dashboard-metric" data-measured="false">{message}</p>;
  if (window === 'today') return unavailable('Not measured: daily totals unavailable (UTC)');
  const all = asRecords(rows).filter(row => row.window === 'all')
    .sort((a, b) => timeOf(b.captured_at) - timeOf(a.captured_at));
  const row = all[0];
  if (!row) return unavailable('Not measured: overview totals unavailable');
  if (all.length > 1 && timeOf(all[0].captured_at) === timeOf(all[1].captured_at)) return unavailable('Not measured: ambiguous overview totals');
  const value = row[config.metric_key];
  if (isMissing(value) || !['string', 'number'].includes(typeof value)
    || (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value))
    || !Number.isFinite(Number(value))) return unavailable('Not measured');
  const runs = component.component_id === 'overview-measured';
  return <>
    <MetricCard component={component} config={config} row={row} />
    <p className="local-dashboard-caption">{component.component_id === 'overview-savings'
      ? 'Modelled · vs cloud baseline' : runs ? 'All calls' : 'All-time aggregate'}</p>
    {/* OMN-21166 AC37: the headline is every call; the measured population is a labelled breakdown beside it, the
        same breakdown Delegation Evidence shows under the same figure. */}
    {runs && <RunBreakdown row={row} />}
  </>;
}

/**
 * OMN-21166 AC37: the served run classes of one cost.savings-overview.v1 row, as a caption line. A class the row does not
 * serve is left out, never shown as 0. When no run is estimated or unknown the figure already is the measured count, so
 * the line goes rather than repeat it (and the compact first screen keeps its height).
 */
export function runBreakdownText(row: Record<string, unknown>): string | null {
  const served = ([['measured_run_count', 'measured'], ['estimated_run_count', 'estimated'], ['unknown_run_count', 'unknown']] as const)
    .filter(([field]) => !isMissing(row[field]) && Number.isFinite(Number(row[field])));
  if (!served.some(([field], index) => index > 0 && Number(row[field]) > 0)) return null;
  return served
    .filter(([field], index) => index === 0 || Number(row[field]) > 0)
    .map(([field, label]) => `${Number(row[field]).toLocaleString('en-US')} ${label}`)
    .join(' · ');
}

function RunBreakdown({ row }: { row: Record<string, unknown> }) {
  const text = runBreakdownText(row);
  return text ? <p className="local-dashboard-caption">{text}</p> : null;
}

/** Said on an Overview panel whose exposure serves no row per window, while today is the chosen window. */
const OUTSIDE_WINDOW_NOTE = 'All time: this panel does not follow the window above.';

/**
 * The one metering-summary.v1 row every Overview metering card reads for the chosen window, or the card text that says
 * why none can be picked. All time is the fold's `all` row. Today is the fold's `day` row whose window_start is today's
 * UTC date: a row the runtime served, never a sum made here. A missing daily row means daily metering is unavailable;
 * it does not prove that no runs executed, and is not 0 or another day's row. The fold keys rows by baseline model and keeps an older baseline's rows, so after
 * a baseline change a window has two. The one refreshed last (newest as_of) is the baseline the runtime resolves now;
 * two refreshed at the same moment cannot be told apart and are refused by name, never one picked silently.
 */
function pickMeteringRow(
  rows: readonly unknown[],
  window: OverviewWindow = 'all',
  now: number = Date.now(),
): { row: Record<string, unknown> } | { message: string } {
  const today = utcDay(now);
  const all = asRecords(rows).filter((r) => (window === 'all'
    ? r.window_kind === 'all'
    : r.window_kind === 'day' && r.window_start === today));
  if (all.length === 0) {
    return { message: window === 'all' ? 'Not measured: no all-time row' : 'Not measured: daily metering data unavailable (UTC)' };
  }
  const newest = Math.max(...all.map((r) => timeOf(r.as_of)));
  const latest = all.filter((r) => timeOf(r.as_of) === newest);
  if (latest.length > 1) return { message: `Not measured: ${latest.length} baseline models` };
  return { row: latest[0] };
}

/**
 * OMN-19980 Step B: an Overview headline figure (Spend, Savings, Measured runs, Tokens in and out) from
 * metering-summary.v1's row for the chosen window (OV-3; all time by default, the row `onex metering` renders). Every
 * card picks the same row, so the four figures cannot disagree (Amendment 2). The fold keys rows by baseline model and keeps an older baseline's rows, so
 * after a baseline change there are two all rows; the one refreshed last is the baseline the runtime resolves now,
 * because every refresh runs under the resolved baseline. Two refreshed at the same moment cannot be told apart and
 * are refused by name, never one picked silently. The Savings card's caption is that row's baseline model and pricing
 * manifest version; Measured runs' caption is that row's run classes.
 */
export function MeteringTotalCard({ component, config, rows, window = 'all', now }: {
  component: LocalPageDocument['components'][number];
  config: MetricCardConfig;
  rows: readonly unknown[];
  window?: OverviewWindow;
  now?: number;
}) {
  const picked = pickMeteringRow(rows, window, now);
  if ('message' in picked) return <p className="local-dashboard-metric" data-measured="false">{picked.message}</p>;
  const row = picked.row;
  if (config.metric_key === TOKENS_IN_AND_OUT) {
    const text = tokensText(row);
    return <p className="local-dashboard-metric" data-measured={!text.startsWith('Not measured')}>{text}</p>;
  }
  const required = component.data_bindings?.[0]?.required_fields ?? [];
  const caption = required.includes('baseline_model')
    ? { baseline_model: row.baseline_model, pricing_manifest_version: row.pricing_manifest_version }
    : required.includes('runs_total')
      ? { runs_total: row.runs_total, runs_unknown_tokens: row.runs_unknown_tokens, runs_unknown_spend: row.runs_unknown_spend }
      : null;
  // OMN-20008 AC5: the Savings card's percentage line, from the same row as the figure, so it follows the chosen
  // window (OMN-21015 AC7). A row that does not serve the ratio yet (or serves null) loses only this line; the figure
  // and its captions stay as they were, and no other window's ratio stands in.
  const pctField = 'savings_pct_of_counterfactual';
  const pct = required.includes(pctField) ? pctAgainstBaseline(row[pctField], row.baseline_model) : null;
  return (
    <MetricCard component={component} config={config} row={row} caption={caption}
      figureLine={pct} figureLineFields={[pctField]} />
  );
}

/**
 * OMN-20008 AC5 (Jonah's decision on the ticket, 4f0e618d): the served ratio of the modelled saving to the baseline's
 * price, as a whole percent, naming the baseline and labelled modelled, e.g. "42% below the claude-sonnet-5-5 baseline
 * (modelled)". metering-summary.v1 serves the ratio; the browser only formats it, as RunLocallyCard formats its served
 * share, and divides nothing. A negative ratio (spend above the baseline's price) reads "above". No line when the
 * ratio is not a number. MetricCard shows the line only beside a figure, and the figure needs the baseline's name.
 */
function pctAgainstBaseline(ratio: unknown, baselineModel: unknown): string | null {
  if (typeof ratio !== 'number' && (typeof ratio !== 'string' || ratio.trim() === '')) return null;
  const value = Number(ratio);
  if (!Number.isFinite(value)) return null;
  const pct = value.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'never' });
  return `${pct} ${value < 0 ? 'above' : 'below'} the ${String(baselineModel)} baseline (modelled)`;
}

const SAVING_PER_RUN_PENDING = NOT_AVAILABLE_YET;

/**
 * OMN-20009: the average saving of a measured run, from metering-summary.v1's row for the chosen window (all time by
 * default), shown as the served decimal text. Only measured runs are in the served quotient. A null value says why; it is never $0.
 */
export function SavingsPerRunCard({ rows, window = 'all', now }: {
  rows: readonly unknown[];
  window?: OverviewWindow;
  now?: number;
}) {
  const picked = pickMeteringRow(rows, window, now);
  if ('message' in picked) return <p className="local-dashboard-metric" data-measured="false">{picked.message}</p>;
  const row = picked.row;
  if (!('savings_per_measured_run_usd' in row)) {
    return <p className="local-dashboard-empty" role="status">{SAVING_PER_RUN_PENDING}</p>;
  }
  const value = row.savings_per_measured_run_usd;
  if ((typeof value !== 'number' || !Number.isFinite(value)) && (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value)))) {
    const why = row.baseline_state === 'unresolved' ? 'Baseline unresolved'
      : row.runs_measured === 0 ? 'Not measured: no measured runs' : 'Not measured';
    return <p className="local-dashboard-metric" data-measured="false">{why}</p>;
  }
  const decimal = typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 20 }) : String(value);
  const text = decimal.startsWith('-') ? `-$${decimal.slice(1)}` : `$${decimal}`;
  return (
    <>
      <p className="local-dashboard-metric">{text}</p>
      <p className="local-dashboard-caption">
        {`Over ${recorded(row.runs_measured)} measured runs · baseline ${recorded(row.baseline_model)}`}
      </p>
    </>
  );
}

/** The raw served row (not the Runs session flattening) of a component's second binding. */
function captionRowFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): Record<string, unknown> | null {
  const topic = component.data_bindings?.[1]?.projection_topic;
  if (topic === undefined) return null;
  const first = snapshots.find((snapshot) => snapshot.topic === topic)?.rows?.[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
}

/** A placeholder or empty model is not a model: Jonah's handoff (OMN-19981, aac9032d) says render it as unknown. */
function modelOrUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'delegate-skill') return 'unknown';
  return String(value);
}

function metricConfigFor(page: LocalPageDocument, componentId: string): MetricCardConfig | null {
  const widget = page.dashboard.widgets.find((candidate) => candidate.data_source === componentId);
  const config = widget?.config as Record<string, unknown> | undefined;
  if (!config || typeof config.metric_key !== 'string') return null;
  return config as unknown as MetricCardConfig;
}

type Row = Record<string, unknown>;

/**
 * The one command that makes a first run (RU-4): the verify step of the local MVP plan
 * (knowledge-base-internal beta/plans/2026-09-28-local-mvp-plan.md, line 181 at main 5d4f2d8).
 */
export const FIRST_RUN_COMMAND = 'onex delegate "ping"';

function asRecords(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

function timeOf(value: unknown): number {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Decisions newest first by written_at, the binding's declared ordering authority. */
function newestFirst(decisions: readonly unknown[]): Row[] {
  return [...asRecords(decisions)].sort((a, b) => timeOf(b.written_at) - timeOf(a.written_at));
}

/** A served id to its row. A savings session's session_id is the decision's correlation_id (OMN-19981, aac9032d). */
function indexBy(rows: readonly unknown[], key: string): Map<string, Row> {
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
function servedBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  return null;
}

/** A run's status is its served quality-gate verdict; a run with no served decision has none recorded. */
function statusOf(decision: Row | undefined): RunStatus {
  const passed = servedBoolean(decision?.quality_gate_passed);
  if (passed === null) return 'Not recorded';
  return passed ? 'passed' : 'failed';
}

/** A failed run's typed cause is the served quality_gate_detail (a provider 429, a timeout, a refused answer). */
function causeOf(decision: Row | undefined): string {
  const status = statusOf(decision);
  if (status === 'passed') return 'none';
  if (status === 'Not recorded' || isMissing(decision?.quality_gate_detail)) return 'Not recorded';
  return String(decision?.quality_gate_detail);
}

/**
 * OMN-21166 (Lakshman, 2026-10-18): a served fraction or long decimal written for reading (0.8095238095238095 reads
 * 81.0% as a percent, 0.85 as a decimal), with the exact served text kept as the title. A value that is not a number
 * is shown as served; a missing one reads Not recorded.
 */
function Readable({ value, kind }: { value: unknown; kind: 'percent' | 'decimal' | 'count' }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number) || kind === 'count') return <>{String(value)}</>;
  const text = kind === 'percent'
    ? number.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : number.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return <span className="local-readable" title={String(value)}>{text}</span>;
}

function recorded(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : String(value);
}

/**
 * A run's cost in dollars, from its delegation.savings.v1 session when one is served, else from the decision row's
 * own measured cost_usd (OMN-20753). Never fewer than two decimals and never rounded, so 0 reads $0.00 and 0.0021
 * keeps its digits. A cost never measured is served null and reads Not recorded, never $0.00.
 */
function costOf(session: Row | undefined, decision: Row): string {
  const value = isMissing(session?.local_cost_usd) ? decision.cost_usd : session?.local_cost_usd;
  if (isMissing(value)) return 'Not recorded';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not recorded';
  const text = String(amount);
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  return `$${decimals >= 2 ? text : amount.toFixed(2)}`;
}

/** A plain decimal as the store serves it: optional minus, digits, optional fraction. No exponent, no grouping. */
const SERVED_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * OMN-21015 AC3: one run's modelled saving as served on delegation.decisions.v1, named against the baseline it was priced
 * against. The page formats the served figure and computes nothing. A run that was not measured says why, never 0; a
 * measured zero is a zero. The served decimal text is shown digit for digit, padded to two decimals and never passed
 * through a binary float, which would change its digits; anything that is not a plain decimal is not shown as a figure.
 */
export function runModelledCell(run: Row): string {
  const figure = run.modelled_savings_usd;
  const notMeasured = run.savings_measurement === 'unknown_tokens' ? 'Not measured: tokens not recorded'
    : run.savings_measurement === 'unknown_spend' ? 'Not measured: cost not recorded'
    : run.savings_measurement === 'baseline_unresolved' ? 'Not measured: baseline not resolved'
    : run.savings_measurement === 'unknown_timestamp' ? 'Not measured: time not recorded' : 'Not measured';
  if (isMissing(figure)) return notMeasured;
  const match = SERVED_DECIMAL.exec(String(figure).trim());
  if (match === null) return 'Not measured';
  const [, sign, whole, fraction = ''] = match;
  return `${sign}$${whole}.${fraction.padEnd(2, '0')} vs ${recorded(run.savings_baseline_model)}`;
}

/** The route tier as served, with its cost regime beside it when the row carries one (OMN-13649, OMN-20225). */
function tierOf(decision: Row): string {
  if (isMissing(decision.cost_tier_name)) return 'Not recorded';
  const name = String(decision.cost_tier_name);
  return isMissing(decision.cost_tier_type) ? name : `${name} (${String(decision.cost_tier_type)})`;
}

function duration(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : `${String(value)} ms`;
}

function age(value: unknown, now: number): string {
  const time = timeOf(value);
  if (!Number.isFinite(time)) return 'Not recorded';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function utcDay(time: number): string {
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

interface RunViewProps {
  decisions: readonly unknown[];
  sessions: readonly unknown[];
  now?: number;
}

/**
 * WF-3: a run's id as the way into its path on Workflow, wherever the run is named. A run with no recorded id has
 * nothing to open, so it reads Not recorded and is not a link.
 */
function RunRef({ id, short = false }: { id: unknown; short?: boolean }) {
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
function CellTime({ value }: { value: unknown }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const text = String(value);
  const readable = readableTime(text);
  return readable === null ? <>{text}</> : <time className="local-cell-time" dateTime={text} title={text}>{readable}</time>;
}

/** "Oct 16, 22:11:37 UTC" for an ISO timestamp (its own offset kept, nothing converted); null for any other text. */
export function readableTime(text: string): string | null {
  const parts = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  const month = parts ? MONTHS[Number(parts[1]) - 1] : undefined;
  if (!parts || month === undefined) return null;
  const zone = parts[4] === 'Z' || parts[4] === '+00:00' ? 'UTC' : parts[4];
  return `${month} ${Number(parts[2])}, ${parts[3]} ${zone}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** OV-4: the newest run, its typed cause when it failed, and every figure typed when it is not served. */
export function LastRunCard({ decisions, sessions, now = Date.now(), compact = false }: RunViewProps & { compact?: boolean }) {
  const last = newestFirst(decisions)[0];
  if (!last) return <NoRunsYet />;
  const session = indexBy(sessions, 'session_id').get(String(last.correlation_id));
  const status = statusOf(last);
  // The order answers the Overview's second question first (requirement Q2: is delegation working?): the newest run's
  // status, its typed cause when it failed, its model and its age, then the rest of what its row serves.
  const fields: Array<[string, ReactNode]> = [
    ['Status', <OutcomePill value={status} key="status" />],
    ...(status === 'failed' ? [['Cause', causeOf(last)] as [string, ReactNode]] : []),
    ['Model', modelOrUnknown(last.model_name)],
    ['Age', age(last.written_at, now)],
    ['Quality score', recorded(last.actual_score)],
    ['Run', <RunRef id={last.correlation_id} key="run" />],
    // OMN-20162's columns: the backend and host of the attempt that accepted the run.
    ['Backend', recorded(last.backend_id)],
    ['Host', recorded(last.host)],
    ['Duration', duration(last.latency_ms)],
    ['Tokens in', recorded(last.tokens_input)],
    ['Tokens out', recorded(last.tokens_output)],
    ['Cost', costOf(session, last)],
    ['Basis', recorded(session?.usage_source)],
    ['Task type', recorded(last.task_type)],
    ['Route tier', tierOf(last)],
  ];
  return (
    <section aria-label="Last run" className="local-last-run" data-status={status}>
      <dl className="local-dashboard-fields local-latest-primary">
        {fields.filter(([label]) => ['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
          .map(([label, value]) => <div key={label} data-field={label} data-field-tone={fieldTone(label, label === 'Status' ? status : value)} data-field-unavailable={isUnavailableField(value)}><dt><FieldIcon label={label} value={label === 'Status' ? status : value} />{label}</dt><dd>{compact && label === 'Cause' && typeof value === 'string' && value.length > 120
            ? <details className="local-run-cause"><summary><ChevronRight size={12} aria-hidden="true" /><span>{value.slice(0, 120)}…</span></summary><p>{value}</p></details>
            : value}</dd></div>)}
      </dl>
      <details className="local-run-more">
        <summary>Execution details</summary>
        <dl className="local-dashboard-fields">
          {fields.filter(([label]) => !['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
            .map(([label, value]) => <div key={label} data-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}><dt><FieldIcon label={label} value={value} />{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </details>
      {compact && typeof last.correlation_id === 'string' && last.correlation_id !== '' && <p className="local-dashboard-caption local-recent-footer"><Link href={workflowHref(last.correlation_id)}>Open run details <ArrowUpRight size={12} aria-hidden="true" /></Link></p>}
    </section>
  );
}

/** A bounded preview; full records, filters and charts belong on Runs. */
function OverviewRunPreview({ decisions, sessions, now = Date.now() }: RunViewProps) {
  const recent = newestFirst(decisions).slice(0, 5);
  return <>
    <ul className="local-run-preview" aria-label="Recent runs preview">{recent.map((run, index) => <li key={String(run.correlation_id ?? index)}>
      <div><RunRef id={run.correlation_id} /><span data-field-tone="model" data-field-unavailable={isUnavailableField(modelOrUnknown(run.model_name))}>{modelOrUnknown(run.model_name)}</span></div>
      <div><OutcomePill value={statusOf(run)} /><span data-field-tone="duration" data-field-unavailable={isMissing(run.latency_ms)}>{duration(run.latency_ms)}</span><span className="local-dashboard-caption">{age(run.written_at, now)}</span></div>
    </li>)}</ul>
    <p className="local-dashboard-caption local-recent-footer"><span>Latest five returned runs</span><Link href={PAGE_PATHS['local-runs']}>View all runs <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    <details className="local-recent-fields">
      <summary>Show recent run fields</summary>
      <RecentRunsTable decisions={decisions} sessions={sessions} now={now} showCharts />
    </details>
  </>;
}

/**
 * OV-5: the ten newest runs, newest first, with the Runs page's run columns. A run shows its cost, never a per-run
 * saving: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RecentRunsTable({ decisions, sessions, now = Date.now(), showCharts = false }: RunViewProps & { showCharts?: boolean }) {
  const [showAllFields, setShowAllFields] = useState(false);
  const [, navigate] = useLocation();
  const tableId = useId();
  const bySession = indexBy(sessions, 'session_id');
  // OMN-21166 (approved mockup): the latest runs filter by served verdict and, from the trends, by failure cause.
  const { filter, setFilter } = useRunFilter();
  const all = newestFirst(decisions);
  const count = (result: 'all' | 'passed' | 'failed') => all.filter(run => result === 'all' || statusOf(run) === result).length;
  const matching = all.filter(run => (filter.result === 'all' || statusOf(run) === filter.result)
    && (filter.cause === null || causeLabelOf(run.quality_gate_detail) === filter.cause));
  const recent = matching.slice(0, 10);
  const listed: ListedRun[] = recent.map(run => ({
    id: typeof run.correlation_id === 'string' && run.correlation_id !== '' ? run.correlation_id : null,
    status: statusOf(run), model: modelOrUnknown(run.model_name),
    duration: run.latency_ms, tokensIn: run.tokens_input, tokensOut: run.tokens_output,
  }));
  return (
    <>
      <div className="local-dashboard-filters local-run-filter">
        <div role="group" aria-label="Filter runs by result" className="local-run-filter-results">
          {(['all', 'passed', 'failed'] as const).map(result => (
            <button key={result} type="button" data-result={result} aria-pressed={filter.result === result}
              onClick={() => setFilter({ result, cause: result === 'failed' ? filter.cause : null })}>
              {result === 'all' ? 'All' : result === 'passed' ? 'Passed' : 'Failed'} <span>{count(result).toLocaleString('en-US')}</span>
            </button>
          ))}
        </div>
        {filter.cause !== null && (
          <button type="button" className="local-run-filter-cause" aria-label={`Clear cause ${filter.cause}`} onClick={() => setFilter({ cause: null, result: 'all' })}>
            Cause: {filter.cause} <span aria-hidden="true">✕</span>
          </button>
        )}
        <label className="local-recent-toolbar">
          <input type="checkbox" checked={showAllFields} onChange={event => setShowAllFields(event.target.checked)} aria-controls={tableId} />
          Show all run fields
        </label>
      </div>
      {showCharts && <section className="local-overview-run-charts" aria-label="Latest ten run charts">
        <RunDurationChart runs={listed} onOpen={id => navigate(workflowHref(id))} />
        <RunTokensChart runs={listed} onOpen={id => navigate(workflowHref(id))} />
      </section>}
      {recent.length === 0 && <p className="local-dashboard-empty" role="status">No runs match this filter</p>}
      <div className={`local-dashboard-table-wrap local-dashboard-table-wrap--fit local-recent-runs-wrap${showAllFields ? ' local-recent-runs-wrap--all' : ''}`} role="region" aria-label="Recent run fields">
        <table id={tableId}>
          <thead><tr>
            <th>Time</th><th>Run</th><th>Status</th><th>Model</th><th>Cost</th><th>Duration</th>
            <th>Age</th><th>Cause</th><th>Task type</th><th>Backend</th><th>Host</th><th>Tokens in</th><th>Tokens out</th>
            <th>Basis</th><th>Route tier</th><th>Quality score</th>
          </tr></thead>
          <tbody>{recent.map((decision, index) => {
            const session = bySession.get(String(decision.correlation_id));
            return <tr key={String(decision.correlation_id ?? index)}>
              <td className="local-dashboard-cell-token local-dashboard-cell-time" data-label="Time"><span className="local-recent-value"><CellTime value={decision.written_at} /></span></td>
              <td className="local-dashboard-cell-token" data-label="Run"><span className="local-recent-value"><RunRef id={decision.correlation_id} short /></span></td>
              <td data-label="Status"><span className="local-recent-value"><OutcomePill value={statusOf(decision)} /></span></td>
              <td className="local-dashboard-cell-token" data-label="Model"><span className="local-recent-value">{modelOrUnknown(decision.model_name)}</span></td>
              <td data-label="Cost"><span className="local-recent-value">{costOf(session, decision)}</span></td>
              <td data-label="Duration"><span className="local-recent-value">{duration(decision.latency_ms)}</span></td>
              <td data-label="Age"><span className="local-recent-value">{age(decision.written_at, now)}</span></td>
              <td data-label="Cause"><span className="local-recent-value">{causeOf(decision)}</span></td>
              <td data-label="Task type"><span className="local-recent-value">{recorded(decision.task_type)}</span></td>
              <td className="local-dashboard-cell-token" data-label="Backend"><span className="local-recent-value">{recorded(decision.backend_id)}</span></td>
              <td className="local-dashboard-cell-token" data-label="Host"><span className="local-recent-value">{recorded(decision.host)}</span></td>
              <td data-label="Tokens in"><span className="local-recent-value">{recorded(decision.tokens_input)}</span></td>
              <td data-label="Tokens out"><span className="local-recent-value">{recorded(decision.tokens_output)}</span></td>
              <td data-label="Basis"><span className="local-recent-value">{recorded(session?.usage_source)}</span></td>
              <td data-label="Route tier"><span className="local-recent-value">{tierOf(decision)}</span></td>
              <td data-label="Quality score"><span className="local-recent-value">{recorded(decision.actual_score)}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="local-dashboard-caption local-recent-footer"><span>Ten most recent runs</span><Link href={PAGE_PATHS['local-runs']}>View all runs <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    </>
  );
}

/** RU-4: the typed empty state names the one command that makes the first run. */
export function NoRunsYet() {
  return (
    <div className="local-dashboard-empty" role="status">
      <p>No runs yet</p>
      <p>Make the first run with <code>{FIRST_RUN_COMMAND}</code> <CopyButton text={FIRST_RUN_COMMAND} label="Copy the first-run command" /></p>
    </div>
  );
}

interface RunsTableProps {
  /** delegation.decisions.v1 rows: every run, failed ones included (RU-1's source). */
  decisions: readonly unknown[];
  /** delegation.savings.v1 sessions, looked up by session_id = correlation_id for the cost and baseline-label columns. */
  sessions: readonly unknown[];
  now?: number;
  /** The widget's declared page_size. */
  pageSize?: number;
  syncUrl?: boolean;
  truncated?: boolean;
}

/** A row whose served data_source names anything but real data is fixture data (FR-2). */
function isFixture(decision: Row): boolean {
  return typeof decision.data_source === 'string' && decision.data_source !== '' && decision.data_source !== 'real';
}

/**
 * RU-1: every served run with its status, cause and cost, filtered by status, cause, model, backend and window,
 * paged. The backend is the served backend_id; a run served without one is filtered as Not recorded. No
 * per-run saving or baseline price: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RunsTable({ decisions, sessions, now = Date.now(), pageSize = 25, syncUrl = false, truncated = false }: RunsTableProps) {
  const id = useId();
  // OMN-21166 AC27: the table opens on its primary fields; every one of the 18 stays in the page, one switch away.
  const [showAllFields, setShowAllFields] = useState(false);
  const search = useSearch();
  const [, navigate] = useLocation();
  const [localView, setLocalView] = useState<RunsViewState>(DEFAULT_RUNS_VIEW);
  const view = syncUrl ? readRunsSearch(search) : localView;
  const { status, cause, model, backend, span, query = '' } = view;
  const pageIndex = view.page - 1;
  const bySession = indexBy(sessions, 'session_id');
  const runs = newestFirst(decisions);
  const models = [...new Set(runs.map((run) => modelOrUnknown(run.model_name)))].sort();
  const causes = [...new Set(runs.filter((run) => statusOf(run) === 'failed').map((run) => causeOf(run)))].sort();
  const backends = [...new Set(runs.map((run) => recorded(run.backend_id)))].sort();
  const today = utcDay(now);
  const needle = query.trim().toLocaleLowerCase();
  const shown = runs.filter((run) => (status === 'all' || statusOf(run) === status)
    && (cause === 'all' || causeOf(run) === cause)
    && (model === 'all' || modelOrUnknown(run.model_name) === model)
    && (backend === 'all' || recorded(run.backend_id) === backend)
    && (span === 'all' || utcDay(timeOf(run.created_at)) === today)
    && (needle === '' || [run.correlation_id, run.model_name, run.backend_id, run.task_type, run.host, statusOf(run), causeOf(run)]
      .some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle))));
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(pageIndex, pages - 1);
  const page = shown.slice(current * pageSize, (current + 1) * pageSize);
  const canonicalSearch = writeRunsSearch(search, { ...view, page: current + 1 });
  useEffect(() => {
    if (syncUrl && canonicalSearch !== search.replace(/^\?/, '')) {
      navigate(`/runs${canonicalSearch ? `?${canonicalSearch}` : ''}`, { replace: true });
    }
  }, [canonicalSearch, navigate, search, syncUrl]);
  const updateView = (change: Partial<RunsViewState>, replace = false) => {
    const next = { ...view, ...change };
    if (syncUrl) {
      const query = writeRunsSearch(search, next);
      navigate(`/runs${query ? `?${query}` : ''}`, { replace });
    } else setLocalView(next);
  };
  const filter = (key: 'status' | 'cause' | 'model' | 'backend' | 'span') => (event: { target: { value: string } }) =>
    updateView({ [key]: event.target.value, page: 1 });
  const listed: ListedRun[] = page.map((run) => ({
    id: typeof run.correlation_id === 'string' && run.correlation_id !== '' ? run.correlation_id : null,
    status: statusOf(run),
    model: modelOrUnknown(run.model_name),
    duration: run.latency_ms,
    tokensIn: run.tokens_input,
    tokensOut: run.tokens_output,
    cost: isMissing(bySession.get(String(run.correlation_id))?.local_cost_usd) ? run.cost_usd : bySession.get(String(run.correlation_id))?.local_cost_usd,
    score: run.actual_score,
  }));
  const openRun = (runId: string) => navigate(workflowHref(runId));
  const filtered = status !== 'all' || cause !== 'all' || model !== 'all' || backend !== 'all' || span !== 'all' || query !== '';
  return (
    <>
      <div className="local-runs-search">
        <label htmlFor={`${id}-search`}>Search runs</label>
        <input id={`${id}-search`} type="search" value={query} placeholder="Run ID, model, task, backend or failure…"
          autoComplete="off" spellCheck={false} onChange={event => updateView({ query: event.target.value, page: 1 }, true)}
          aria-describedby={`${id}-scope`} />
        <p id={`${id}-scope`} className="local-dashboard-caption">{truncated
          ? `${runs.length} recent runs returned. Earlier history is not included; search, filters and charts use these records.`
          : `${runs.length} returned runs. Search, filters and charts use these records.`}</p>
      </div>
      <div className="local-dashboard-filters">
        <div className="local-filter-field">
        <label htmlFor={`${id}-status`}>Status</label>
        <select id={`${id}-status`} value={status} onChange={filter('status')}>
          <option value="all">All</option>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="Not recorded">Not recorded</option>
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-cause`}>Cause</label>
        <select id={`${id}-cause`} value={cause} onChange={filter('cause')}>
          <option value="all">All</option>
          {cause !== 'all' && !causes.includes(cause) && <option value={cause}>{cause} (not in current data)</option>}
          {causes.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-model`}>Model</label>
        <select id={`${id}-model`} value={model} onChange={filter('model')}>
          <option value="all">All</option>
          {model !== 'all' && !models.includes(model) && <option value={model}>{model} (not in current data)</option>}
          {models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-backend`}>Backend</label>
        <select id={`${id}-backend`} value={backend} onChange={filter('backend')}>
          <option value="all">All</option>
          {backend !== 'all' && !backends.includes(backend) && <option value={backend}>{backend} (not in current data)</option>}
          {backends.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-window`}>Window</label>
        <select id={`${id}-window`} value={span} onChange={filter('span')}>
          <option value="all">All time</option>
          <option value="today">Today (UTC)</option>
        </select>
        </div>
        {filtered && (
          <button type="button" className="local-filter-clear" onClick={() => updateView({ ...DEFAULT_RUNS_VIEW, query: '' })}>Clear filters</button>
        )}
      </div>
      {shown.length === 0 ? <p className="local-dashboard-empty" role="status">No runs match these filters</p> : (
        <>
          <h3 className="local-dashboard-caption local-section-heading" data-page-heading tabIndex={-1}>Run list</h3>
          <p className="local-dashboard-caption local-recent-toolbar"><label>
            <input type="checkbox" checked={showAllFields} onChange={event => setShowAllFields(event.target.checked)} aria-controls={`${id}-table`} />
            Show all run fields
          </label></p>
          <div className={`local-dashboard-table-wrap local-dashboard-table-wrap--fit local-runs-wrap${showAllFields ? ' local-runs-wrap--all' : ''}`}>
            <table id={`${id}-table`}>
              <thead>
                <tr>
                  <th>Run</th><th>Created</th><th>Status</th><th>Cause</th><th>Model</th><th>Backend</th><th>Host</th>
                  <th>Tokens in</th><th>Tokens out</th><th>Local cost</th><th>Modelled saving</th><th>Baseline model</th>
                  <th>Basis</th><th>Task type</th><th>Duration</th><th>Tokens to compliance</th><th>Route tier</th><th>Quality score</th>
                </tr>
              </thead>
              <tbody>{page.map((run, index) => {
                const session = bySession.get(String(run.correlation_id));
                return <tr key={String(run.correlation_id ?? index)}>
                  <td className="local-dashboard-cell-token">
                    {/* WF-3: a run opens its own path on Workflow; a run with no recorded id has nothing to open. */}
                    <RunRef id={run.correlation_id} short />
                    {isFixture(run) && <span className="local-dashboard-badge">fixture</span>}
                  </td>
                  <td className="local-dashboard-cell-token local-dashboard-cell-time"><CellTime value={run.created_at} /></td>
                  <td><OutcomePill value={statusOf(run)} /></td>
                  <td>{causeOf(run).length > 120
                    ? <details className="local-run-failure"><summary>Read failure details</summary><p className="local-runs-cause" title={causeOf(run)}>{causeOf(run)}</p></details>
                    : <span className="local-runs-cause" title={causeOf(run)}>{causeOf(run)}</span>}</td>
                  {/* A run's model and backend set that filter: the same filters as the selects above, from the row. */}
                  <td className="local-dashboard-cell-token">
                    <button type="button" className="local-cell-filter" aria-label={`Show only runs of model ${modelOrUnknown(run.model_name)}`} onClick={() => updateView({ model: modelOrUnknown(run.model_name), page: 1 })}>
                      {modelOrUnknown(run.model_name)}
                    </button>
                  </td>
                  <td className="local-dashboard-cell-token">
                    <button type="button" className="local-cell-filter" aria-label={`Show only runs of backend ${recorded(run.backend_id)}`} onClick={() => updateView({ backend: recorded(run.backend_id), page: 1 })}>
                      {recorded(run.backend_id)}
                    </button>
                  </td>
                  <td className="local-dashboard-cell-token">{recorded(run.host)}</td>
                  <td>{recorded(run.tokens_input)}</td>
                  <td>{recorded(run.tokens_output)}</td>
                  <td>{costOf(session, run)}</td>
                  <td>{runModelledCell(run)}</td>
                  <td>{recorded(isMissing(run.savings_baseline_model) ? session?.baseline_model : run.savings_baseline_model)}</td>
                  <td>{recorded(session?.usage_source)}</td>
                  <td>{isMissing(run.task_type) ? recorded(run.task_type) : <span className="local-task-cell"><TaskIcon task={String(run.task_type)} />{String(run.task_type)}</span>}</td>
                  <td>{recorded(run.latency_ms)}</td>
                  <td>{recorded(run.tokens_to_compliance)}</td>
                  <td>{tierOf(run)}</td>
                  <td>{recorded(run.actual_score)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="local-dashboard-pager">
            <span>{`Runs ${current * pageSize + 1}–${current * pageSize + page.length} of ${shown.length}`}</span>
            <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => updateView({ page: current })}>Previous</button>
            <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => updateView({ page: current + 2 })}>Next</button>
          </div>
          <h3 className="local-dashboard-caption local-section-heading" data-page-heading tabIndex={-1}>Run charts</h3>
          <div className="local-run-charts">
            <RunDurationChart runs={listed} onOpen={openRun} />
            <RunTokensChart runs={listed} onOpen={openRun} />
            <RunMetricChart runs={listed} onOpen={openRun} metric="cost" />
            <RunMetricChart runs={listed} onOpen={openRun} metric="score" />
          </div>
        </>
      )}
    </>
  );
}

/** The quality-gate exposure's fields the quality panel shows, each as served. */
const QUALITY_FIELDS: ReadonlyArray<[string, string]> = [
  ['Pass rate', 'overall_pass_rate'],
  ['Passed', 'total_passed'],
  ['Failed', 'total_failed'],
  ['Checks', 'total_checks'],
  ['Average score', 'avg_actual_score'],
  ['Average required bar', 'avg_required_bar'],
];

/**
 * OMN-20225 AC3: the quality panel, one row of delegation.quality-gate.v1. Every figure is a served field; the
 * browser divides, sums and rounds nothing, so a pass rate here is the view's and never recomputed from the counts.
 */
export function QualityPanel({ row }: { row: Row | null }) {
  if (!row) return <p className="local-dashboard-empty" role="status">No quality checks served yet</p>;
  return (
    <section aria-label="Quality">
      <PassRateMeter row={row} />
      <dl className="local-dashboard-fields">
        {QUALITY_FIELDS.map(([label, field]) => <div key={field} data-quality-field={field} data-field-tone={fieldTone(label)} data-field-unavailable={isUnavailableField(row[field])}><dt><FieldIcon label={label} />{label}</dt><dd><Readable value={row[field]} kind={field === 'overall_pass_rate' ? 'percent' : field.startsWith('avg_') ? 'decimal' : 'count'} /></dd></div>)}
      </dl>
      <p className="local-dashboard-caption local-recent-footer"><Link href="/delegation-evidence">View delegation evidence <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    </section>
  );
}

/**
 * OMN-21015 AC2: a model's cost under its tier, as served (summed by the view). A group with no priced run is served
 * null and says how many runs were not measured, never $0; a priced group with some unpriced runs says so beside it.
 * A model served without its unmeasured count is never read as fully measured: the count is unknown, not zero.
 */
function tierModelCost(model: Row): string {
  const unmeasured = isMissing(model.unmeasured_cost_count) ? null : Number(model.unmeasured_cost_count);
  const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`;
  if (isMissing(model.cost_usd)) {
    return unmeasured !== null && unmeasured > 0 ? `Not measured (${runs(unmeasured)})` : 'Not measured';
  }
  const text = String(model.cost_usd);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  const dollars = match === null ? `$${text}` : `${match[1]}$${match[2]}.${(match[3] ?? '').padEnd(2, '0')}`;
  if (unmeasured === null) return `${dollars} (unpriced runs unknown)`;
  return unmeasured > 0 ? `${dollars} (+${runs(unmeasured)} not measured)` : dollars;
}

/**
 * OMN-20225 AC3: the tier mix, from delegation.model-routing.v1's served by_tier (view migration 0045). Each tier's
 * count and share are the view's; runs with no tier are the served not_tier_routed_count, never folded into a tier.
 * OMN-21015 AC2: under each tier, the models the view lists for it (migration 0060), with their served runs, share of
 * the tier-routed runs and cost. Nothing is added up here; a tier served without models shows none.
 */
export function TierMixPanel({ row, compact = false }: { row: Row | null; compact?: boolean }) {
  const byTier = row && typeof row.by_tier === 'object' && row.by_tier !== null && !Array.isArray(row.by_tier)
    ? (row.by_tier as Row) : null;
  const tiers = byTier && Array.isArray(byTier.tiers) ? asRecords(byTier.tiers) : [];
  if (!byTier || tiers.length === 0) {
    return <p className="local-dashboard-empty" role="status">No tier mix served yet</p>;
  }
  return (
    <section aria-label="Tier mix">
      {/* The bar and the table show the same served tiers; the bar's widths are the served shares. */}
      <TierShareChart byTier={byTier} variant={compact ? 'donut' : 'bars'} />
      <details className="local-routing-details local-tier-details">
      <summary><span className="local-routing-summary-label"><Waypoints size={15} aria-hidden="true" />Full routing breakdown</span></summary>
      <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit">
        <table>
          <thead><tr><th><span><Route size={13} aria-hidden="true" />Tier</span></th><th><span><Rows3 size={13} aria-hidden="true" />Runs</span></th><th><span><ChartLine size={13} aria-hidden="true" />Share of tier-routed</span></th><th><span><CircleDollarSign size={13} aria-hidden="true" />Cost</span></th></tr></thead>
          <tbody>{tiers.flatMap((tier, index) => {
            const name = String(tier.cost_tier_name);
            const TierIcon = ({ local: Server, harness: Bot, cheap_frontier: Zap, cheap_cloud: Cloud, cloud: Cloud, claude: Sparkles, frontier: Sparkles } as Record<string, LucideIcon>)[name] ?? Route;
            const tone = TIER_TONES[name] ?? 'other';
            return [
            <tr className="local-routing-tier-row" data-tone={tone} key={`${name}-${index}`}>
              {/* A served share is a long decimal and a name has no break opportunity: each may break inside itself, as
                  the repo's other token cells do, so the Cost column stays inside the panel at 1440x900 with no
                  sideways scroll. Costs wrap at their spaces. */}
              <td className="local-dashboard-cell-token local-dashboard-cell-name"><span className="local-routing-name"><TierIcon size={16} aria-hidden="true" />{recorded(tier.cost_tier_name)}</span></td>
              <td data-column="runs">{recorded(tier.count)}</td>
              <td data-column="share" className="local-dashboard-cell-token"><Readable value={tier.pct_of_tier_routed} kind="percent" /></td>
              <td />
            </tr>,
            ...(Array.isArray(tier.models) ? asRecords(tier.models) : []).map((model, modelIndex) => (
              <tr data-tone={tone} key={`${name}-${index}-${String(model.model_name)}-${modelIndex}`} className="local-dashboard-row--nested local-routing-model-row">
                <td className="local-dashboard-cell-token local-dashboard-cell-name"><span className="local-routing-name local-model-identity" style={modelIdentityStyle(model.model_name)}><FieldIcon tone="model" size={14} />{recorded(model.model_name)}</span></td>
                <td data-column="runs">{recorded(model.count)}</td>
                <td data-column="share" className="local-dashboard-cell-token"><Readable value={model.pct_of_tier_routed} kind="percent" /></td>
                <td data-column="cost" data-unavailable={isMissing(model.cost_usd)}>{tierModelCost(model)}</td>
              </tr>
            )),
          ];})}</tbody>
        </table>
      </div>
      </details>
      <dl className="local-dashboard-fields">
        <div data-field-tone="routing" data-field-unavailable={isMissing(byTier.tier_routed_total)}><dt><FieldIcon label="Tier-routed" />Tier-routed</dt><dd>{recorded(byTier.tier_routed_total)}</dd></div>
        <div data-field-tone="unrouted" data-field-unavailable={isMissing(byTier.not_tier_routed_count)}><dt><FieldIcon label="Not tier-routed" />Not tier-routed</dt><dd>{recorded(byTier.not_tier_routed_count)}</dd></div>
        <div data-field-tone="delegations" data-field-unavailable={isMissing(byTier.total_tasks)}><dt><FieldIcon label="All runs" />All runs</dt><dd>{recorded(byTier.total_tasks)}</dd></div>
      </dl>
      {compact && <p className="local-dashboard-caption local-recent-footer"><Link href={PAGE_PATHS['local-runs']}>View routing breakdown <ArrowUpRight size={12} aria-hidden="true" /></Link></p>}
    </section>
  );
}

/** CR-1 to CR-3: provider key references only (never a value), with their fingerprint prefix and set time, or the
 * command that sets the first one. */
export function CredentialsTable({ rows }: { rows: readonly unknown[] }) {
  const keys = asRecords(rows);
  if (keys.length === 0) {
    return (
      <div className="local-dashboard-empty" role="status">
        <p>No provider key set</p>
        <p>Set one with <code>onex secret set</code> <CopyButton text="onex secret set" label="Copy the command that sets a key" /></p>
      </div>
    );
  }
  return (
    <div className="local-dashboard-table-wrap local-credentials-records">
      <table aria-label="Provider key references">
        <thead><tr><th>Provider</th><th>Key ref</th><th>Fingerprint</th><th>Set</th><th>Revoked</th></tr></thead>
        <tbody>{keys.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            <td data-label="Provider">{recorded(key.provider)}</td>
            <td data-label="Key ref">{recorded(key.name)}</td>
            {/* OMN-19985: the served fingerprint prefix (8 hex of sha256) and the time the key was set; a row its
                producer sent without them says so. created_at is when the projection first saw the row, not this. */}
            <td data-label="Fingerprint">{recorded(key.fingerprint)}</td>
            <td data-label="Set">{recorded(key.set_at)}</td>
            <td data-label="Revoked">{isMissing(key.revoked_at) ? 'Not revoked' : String(key.revoked_at)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** A served flag as a word. The stores serve it as 1 and 0 or as true and false; anything else is shown as served. */
function yesOrNo(value: unknown): string {
  if (isMissing(value)) return recorded(value);
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  return String(value);
}

/**
 * The decision row of the run shown: its verdict, and the backend, host and tier that accepted it (OMN-20225). Every
 * value is one served field of that run's own row; a run with no served decision says so and borrows no other run's.
 */
export function RunSummary({ decision, showAnalysis = false }: { decision: Row | undefined; showAnalysis?: boolean }) {
  const sectionId = useId();
  if (!decision) return <p className="local-dashboard-empty" role="status">No decision is served for this run</p>;
  const status = statusOf(decision);
  const fields: Array<[string, string]> = [
    ...(status === 'failed' ? [['Cause', causeOf(decision)] as [string, string]] : []),
    ['Quality score', recorded(decision.actual_score)],
    ['Task type', recorded(decision.task_type)],
    ['Model', modelOrUnknown(decision.model_name)],
    ['Backend', recorded(decision.backend_id)],
    ['Host', recorded(decision.host)],
    ['Route tier', tierOf(decision)],
    // OMN-21015: more of what the run's own row serves, each as served. A served zero is a figure and is shown; a
    // fact the row does not carry says Not recorded.
    ['Required bar', recorded(decision.required_bar)],
    ['Tokens in', recorded(decision.tokens_input)],
    ['Tokens out', recorded(decision.tokens_output)],
    ['Finish reason', recorded(decision.finish_reason)],
    ['Truncated', yesOrNo(decision.truncated)],
    ['Escalations', recorded(decision.escalation_count)],
    // The model the caller asked for, beside the model that answered; and the two timings the row serves beside its
    // duration. Each new one is the served column (omnimarket v0.4.309, OMN-19448): missing is Not recorded, never zero.
    ['Requested model', recorded(decision.requested_model)],
    // The three timings stand together and last, in the order their bars are drawn in under the tiles.
    ['Queue wait', duration(decision.queue_wait_ms)],
    ['Execution', duration(decision.execution_ms)],
    ['Duration', duration(decision.latency_ms)],
  ];
  const timingChart = <RunTimingChart timings={[
    { key: 'queue_wait_ms', label: 'Queue wait', value: decision.queue_wait_ms },
    { key: 'execution_ms', label: 'Execution', value: decision.execution_ms },
    { key: 'latency_ms', label: 'Duration', value: decision.latency_ms },
  ]} compact={showAnalysis} accentToken={showAnalysis ? '--workflow-timing-accent' : undefined} />;
  return (
    <section aria-label="Run summary" className="local-dashboard-run-summary">
      <div className="local-run-summary-groups">
        {[
          { name: 'Run outcome', icon: Award, labels: ['Cause', 'Quality score', 'Required bar', 'Task type'] },
          { name: 'Routing and model', icon: Route, labels: ['Model', 'Requested model', 'Backend', 'Host', 'Route tier'] },
          { name: 'Tokens and completion', icon: Coins, labels: ['Tokens in', 'Tokens out', 'Finish reason', 'Truncated', 'Escalations'] },
          { name: 'Timing', icon: History, labels: ['Queue wait', 'Execution', 'Duration'] },
        ].map(({ name, icon: Icon, labels }, index) => <section key={name} className="local-run-summary-group" aria-labelledby={`${sectionId}-${index}`}>
          <h3 className="local-dashboard-caption" id={`${sectionId}-${index}`}><Icon size={16} aria-hidden="true" />{name}</h3>
          <dl className="local-dashboard-fields">
            {index === 0 && <div data-field-tone={fieldTone('Status', status)}><dt><FieldIcon label="Status" value={status} />Status</dt><dd><OutcomePill value={status} /></dd></div>}
            {fields.filter(([label]) => labels.includes(label)).map(([label, value]) => <div key={label} data-summary-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}><dt><FieldIcon label={label} value={value} />{label}</dt><dd>{label === 'Cause' && value.length > 120
              ? <details className="local-run-failure-details"><summary title={value}>Show failure reason</summary><p>{value}</p></details>
              : value}</dd></div>)}
          </dl>
        </section>)}
      </div>
      {/* The same three timings as bars, under the labels their tiles carry. */}
      {showAnalysis ? <WorkflowDecisionCharts decision={decision}>{timingChart}</WorkflowDecisionCharts> : timingChart}
    </section>
  );
}

/**
 * OMN-21015: from one run to the next. A run that is among the served runs links to the run before it and the run
 * after it in the list's newest-first order, so the runs are walked without going back to the list. Only a run with a
 * recorded id is a neighbour, since only it has a path to open; a run that is not among the served runs (a pasted id)
 * has no place between them and gets no links.
 */
export function RunNeighbours({ decisions, runId }: { decisions: readonly unknown[]; runId: string }) {
  const ids = newestFirst(decisions)
    .map((run) => run.correlation_id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  const at = ids.indexOf(runId);
  if (at < 0) return null;
  const newer = ids[at - 1];
  const older = ids[at + 1];
  if (newer === undefined && older === undefined) return null;
  return (
    // It stands in the run's title line, beside the id it leads away from, so it is a span with the navigation role.
    <span className="local-run-neighbours" role="navigation" aria-label="Neighbouring runs">
      {newer !== undefined && <Link href={workflowHref(newer)} title={newer} data-direction="newer">Newer run</Link>}
      {older !== undefined && <Link href={workflowHref(older)} title={older} data-direction="older">Older run</Link>}
    </span>
  );
}

/** The step kinds run-trace.v1 serves today; any other kind is shown as served, never dropped. */
const RUN_STEP_LABELS: Record<string, string> = {
  request: 'Request',
  routing_decision: 'Routing decision',
  provider_call: 'Provider call',
  quality_gate: 'Quality gate',
  terminal: 'Terminal',
};

/**
 * WF-1 and WF-2: one run's steps, exactly as run-trace.v1 serves them (OMN-19987). The order is the exposure's, the
 * step sequence the delegate orchestrator assigned, so this renders rows in the order given and sorts nothing. The
 * step that failed a run is the one the terminal row names in failing_step_sequence; it is looked up, never inferred.
 */
export function RunTimeline({ steps }: { steps: readonly unknown[] }) {
  const rows = asRecords(steps);
  if (rows.length === 0) {
    return <p className="local-dashboard-empty" role="status">No steps recorded for this run</p>;
  }
  const named = rows.find((row) => !isMissing(row.failing_step_sequence))?.failing_step_sequence;
  return (
    <ol className="local-dashboard-steps">
      {rows.map((row, index) => {
        const kind = String(row.step_kind ?? '');
        const failing = !isMissing(named) && row.step_sequence === named;
        const candidates = Array.isArray(row.candidates) ? row.candidates.map(String) : [];
        // Each served detail under its own name; a detail the row does not carry is left out, never shown empty.
        const details: Array<[string, string]> = [
          ...(isMissing(row.failure_cause) ? [] : [['cause', String(row.failure_cause)] as [string, string]]),
          ...(isMissing(row.backend_id) ? [] : [['backend', String(row.backend_id)] as [string, string]]),
          ...(isMissing(row.model_id) ? [] : [['model', String(row.model_id)] as [string, string]]),
          ...(isMissing(row.attempt_number) ? [] : [['attempt', String(row.attempt_number)] as [string, string]]),
          ...(candidates.length === 0 ? [] : [['candidates', candidates.join(', ')] as [string, string]]),
        ];
        return (
          <li
            id={`run-step-${index + 1}`}
            key={`${String(row.step_sequence)}-${index}`}
            data-failing-step={failing ? 'true' : undefined}
            data-outcome={isMissing(row.outcome) ? undefined : String(row.outcome)}
          >
            <div className="local-run-step-head">
              <strong>{RUN_STEP_LABELS[kind] ?? recorded(row.step_kind)}</strong>
              <OutcomePill value={row.outcome} />
              {failing && <span className="local-dashboard-badge">Failed here</span>}
              <span className="local-run-step-duration" data-measured={isMissing(row.duration_ms) ? 'false' : 'true'}>
                <span>Duration</span> {duration(row.duration_ms)}
              </span>
            </div>
            <ServedTime value={row.started_at} />
            {details.length > 0 && (
              <div className="local-run-chips">
                {details.map(([name, value]) => (
                  <span className="local-run-chip" key={name}><span>{name}:</span> {value}</span>
                ))}
              </div>
            )}
            {!isMissing(row.reason) && <p className="local-run-step-reason">{String(row.reason)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * OMN-21015 U3: the run's served steps as a left-to-right diagram, one node per served step in the order served. It
 * reads the same rows as the timeline under it and decides nothing itself: no step is sorted, merged or dropped, a
 * kind this page does not know is a node named as served, and the failing node is the step the terminal names. Each
 * node leads to its own step in the timeline.
 */
export function RunDiagram({ steps }: { steps: readonly unknown[] }) {
  const rows = asRecords(steps);
  if (rows.length === 0) return null;
  const named = rows.find((row) => !isMissing(row.failing_step_sequence))?.failing_step_sequence;
  return (
    <nav className="local-run-diagram" aria-label="Run steps, in the order served">
      {rows.map((row, index) => {
        const kind = String(row.step_kind ?? '');
        const failing = !isMissing(named) && row.step_sequence === named;
        const Icon = ({ request: Inbox, routing_decision: Route, provider_call: Bot, quality_gate: ShieldCheck, terminal: Flag } as Record<string, LucideIcon>)[kind] ?? CircleDot;
        return (
          <a
            href={`#run-step-${index + 1}`}
            key={`${String(row.step_sequence)}-${index}`}
            data-step-kind={kind}
            data-outcome={isMissing(row.outcome) ? undefined : String(row.outcome)}
            data-failing-step={failing ? 'true' : undefined}
            title={failing ? 'The step the run failed at' : undefined}
          >
            <span className="local-run-node-icon" aria-hidden="true"><Icon size={18} /></span>
            <span className="local-run-node-name">{RUN_STEP_LABELS[kind] ?? recorded(row.step_kind)}</span>
            <span className="local-run-node-outcome">{recorded(row.outcome)}</span>
            {index < rows.length - 1 && <FlowConnector />}
          </a>
        );
      })}
    </nav>
  );
}

/** A served outcome or verdict as a pill, coloured by its own value; a value never served reads Not recorded. */
function OutcomePill({ value }: { value: unknown }) {
  return (
    <span className="local-run-pill" data-outcome={isMissing(value) ? undefined : String(value)}>{recorded(value)}</span>
  );
}

/**
 * A step's served timestamp, written for reading as the run tables write theirs (OMN-21166 R-A): nothing is moved to
 * another zone, and the exact served text is the element's datetime and title. Any other text is shown as served.
 */
function ServedTime({ value }: { value: unknown }) {
  if (isMissing(value)) return <span className="local-run-step-time">{recorded(value)}</span>;
  const text = String(value);
  const readable = readableTime(text);
  return <time className="local-run-step-time" dateTime={text} title={text}>{readable ?? text}</time>;
}

/** WF-3: open a run by a pasted correlation id, or go back to the newest run. */
function RunPicker({ requested, onOpen }: { requested: string | null; onOpen: (runId: string | null) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(requested ?? '');
  return (
    <form
      className="local-dashboard-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onOpen(normaliseRunId(draft));
      }}
    >
      <label htmlFor={`${id}-run`}>Correlation id</label>
      <input
        id={`${id}-run`}
        type="text"
        value={draft}
        placeholder="Paste a correlation id to open that run"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit">Open run</button>
      {requested !== null && <button type="button" onClick={() => onOpen(null)}>Newest run</button>}
    </form>
  );
}

interface WorkflowRunProps {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  /** The run the address or the picker names; null shows the newest run. */
  requested: string | null;
  onOpen: (runId: string | null) => void;
}

/**
 * WF-1 to WF-3 (OMN-19987, OMN-21015 AC9): one run, the one asked for or the newest, with its decision row and its
 * steps from run-trace.v1. The loader read the steps for exactly the run named on their snapshot (runId), so this
 * shows that run or says why it cannot: it never falls back to another run, and steps answered for another run are
 * refused rather than shown under this run's id.
 */
export function WorkflowRun({ component, snapshots, requested, onOpen }: WorkflowRunProps) {
  const decisionsRead = snapshots.find((snapshot) => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
  const decisionsBinding = (component.data_bindings ?? [])
    .findIndex((binding) => binding.projection_topic === DELEGATION_DECISIONS_TOPIC);
  const decisions = decisionsBinding < 0 ? [] : asRecords(rowsForLocalBinding(component, snapshots, decisionsBinding));
  const stepsRead = snapshots.find((snapshot) => snapshot.topic === RUN_TRACE_TOPIC);
  const runId = stepsRead?.runId ?? null;
  // The decisions exposure gates nothing here (a pasted id needs no decision row), so its not-served state is named.
  const decisionsNotServed = decisionsRead?.failure?.kind === 'not-served' && !decisionsRead.lastGoodAt
    ? <p className="local-dashboard-empty" role="status">{plainFailureMessage(decisionsRead.failure)}</p>
    : null;
  if (runId === null) {
    return (
      <>
        <RunPicker key={requested ?? ''} requested={requested} onOpen={onOpen} />
        {decisionsNotServed}
        {/* A failed decisions read is named by the panel's read state; it is not an empty store. */}
        {decisionsRead?.failure ? null
          : decisions.length === 0 ? <NoRunsYet />
          : <p className="local-dashboard-empty" role="status">The newest run has no correlation id recorded</p>}
      </>
    );
  }
  const rows = asRecords(stepsRead?.rows ?? []);
  // A failed or unserved steps read with no last good rows is named by the panel's read state, never as "no steps".
  const stepsUnread = Boolean(stepsRead?.failure) && !stepsRead?.lastGoodAt;
  const foreign = rows.some((row) => row.correlation_id !== runId);
  return (
    <div>
      <RunPicker key={requested ?? ''} requested={requested} onOpen={onOpen} />
      <p className="local-dashboard-subtitle local-run-title">
        Run <code>{runId}</code>
        {requested === null && <span className="local-run-tag">newest run</span>}
        <CopyButton text={runId} label="Copy the run id" />
        <RunNeighbours decisions={decisions} runId={runId} />
      </p>
      {decisionsNotServed}
      {!foreign && rows.length === 0 && (() => {
        const decision = decisions.find(row => row.correlation_id === runId);
        return decision ? <WorkflowRoutingFlow decision={decision} outcome={statusOf(decision)} /> : null;
      })()}
      {!decisionsNotServed && <RunSummary decision={decisions.find((row) => row.correlation_id === runId)} showAnalysis />}
      {stepsUnread ? null : foreign ? (
        <p className="local-dashboard-error" role="alert">run-trace.v1 answered steps of another run; none are shown</p>
      ) : (
        <>
          <RunDiagram steps={rows} />
          <RunTimeline steps={rows} />
          {stepsRead?.truncated && (
            <p className="local-dashboard-empty" role="status">
              {`Not the whole run: run-trace.v1 answered a truncated page of ${rows.length} steps`}
            </p>
          )}
        </>
      )}
      <WorkflowRecordDetails decision={decisions.find((row) => row.correlation_id === runId)} steps={stepsUnread || foreign ? [] : rows} />
    </div>
  );
}

/** AK-1: the tenant id from a served row; minted-at waits on local-identity.v1. */
export function LocalIdentity({ row }: { row: Record<string, unknown> | null }) {
  return (
    <dl className="local-dashboard-fields">
      <div data-field-tone={fieldTone('Tenant')} data-field-unavailable={isUnavailableField(row?.tenant_id)}><dt><FieldIcon label="Tenant" />Tenant</dt><dd className="local-identity-value"><span>{recorded(row?.tenant_id)}</span>{typeof row?.tenant_id === 'string' && row.tenant_id.trim() !== '' && <CopyButton text={row.tenant_id} label="Copy the tenant identity" />}</dd></div>
      <div data-field-tone="age" data-field-unavailable="true"><dt><FieldIcon label="Minted" />Minted</dt><dd>Mint time unavailable.</dd></div>
    </dl>
  );
}

/** The raw served rows of a component's binding, before any envelope unpacking. */
function rawRowsFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
  index: number,
): unknown[] {
  const topic = component.data_bindings?.[index]?.projection_topic;
  return snapshots.find((snapshot) => snapshot.topic === topic)?.rows ?? [];
}

/** A table column as the page declares it: the served field it shows, its header, and how the value is written. */
interface DeclaredColumn {
  key: string;
  header: string;
  format?: string | null;
}

const NO_DAY_ROWS = 'No day rows yet.';
const DAY_FIGURES_MODELLED = "Baseline figures are modelled: the runs' tokens priced at the baseline model's list price. The baseline never ran.";

/**
 * The metering-summary.v1 figures measured from the runs themselves: actual spend, run counts, tokens and the
 * compression and cache figures. None of them is priced at the baseline model, so none waits on a baseline. This page
 * names no baseline-priced figure (the OMN-19980 guard, rule R4): what is not listed here is one of those when the
 * row's baseline is unresolved.
 */
export const RUN_MEASURED_FIELDS: ReadonlySet<string> = new Set([
  'spend_usd', 'runs_total', 'runs_measured', 'runs_unknown_tokens', 'runs_unknown_spend', 'tokens_in', 'tokens_out',
  'compression_ratio', 'cache_hit_rate', 'runs_cache_answered',
]);

/**
 * One declared cell of a metering-summary.v1 row, as served. A missing figure says why; it is never written as 0.
 * A run-measured figure that is missing was not measured, whatever the baseline. Any other missing figure on an
 * unresolved-baseline row is missing because of the baseline.
 */
function declaredCell(row: Row, column: DeclaredColumn): string {
  const value = row[column.key];
  if (isMissing(value)) {
    return row.baseline_state === 'unresolved' && !RUN_MEASURED_FIELDS.has(column.key) ? 'Baseline unresolved' : 'Not measured';
  }
  return column.format === 'currency' ? formatUsd(value) : String(value);
}

/**
 * OMN-21015 AC1: metering-summary.v1's day rows, one table per baseline, in the order served, showing the columns the
 * page declares. The last line of each table is that baseline's served `all` row, the row the headline cards read, so
 * this sums nothing. When a baseline has no single newest all row the line is left out rather than guessed.
 */
export function MeteringDayTable({ title, rows, columns }: {
  title: string;
  rows: readonly unknown[];
  columns: readonly DeclaredColumn[];
}) {
  const served = asRecords(rows);
  const baselineOf = (row: Row) => (isMissing(row.baseline_model) ? UNRESOLVED_BASELINE : String(row.baseline_model));
  const groups = new Map<string, Row[]>();
  for (const row of served) {
    if (row.window_kind !== 'day') continue;
    groups.set(baselineOf(row), [...(groups.get(baselineOf(row)) ?? []), row]);
  }
  if (groups.size === 0) return (
    <div className="local-spend-unavailable">
      <p role="status">Daily spend data unavailable.</p>
      <details>
        <summary>Why is this unavailable?</summary>
        <p className="local-dashboard-caption">{NO_DAY_ROWS}</p>
      </details>
    </div>
  );
  const allTimeFor = (baseline: string): Row | null => {
    const all = served.filter((row) => row.window_kind === 'all' && baselineOf(row) === baseline);
    const newest = Math.max(...all.map((row) => timeOf(row.as_of)));
    const latest = all.filter((row) => timeOf(row.as_of) === newest);
    return latest.length === 1 ? latest[0]! : null;
  };
  return (
    <>
      {[...groups.entries()].map(([baseline, days]) => {
        const allTime = allTimeFor(baseline);
        return (
          <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit" key={baseline}>
            <table aria-label={`${title} vs ${baseline}`}>
              <thead><tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr></thead>
              <tbody>
                {days.map((row, index) => (
                  <tr key={`${String(row.window_start)}-${index}`}>
                    {columns.map((column) => <td key={column.key}>{declaredCell(row, column)}</td>)}
                  </tr>
                ))}
                {allTime && (
                  <tr>
                    {columns.map((column) => (
                      <td key={column.key}>{column.key === 'window_start' ? 'All time' : declaredCell(allTime, column)}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="local-dashboard-caption">{DAY_FIGURES_MODELLED}</p>
    </>
  );
}

/** The renderer for a table component: its first binding's rows, joined to its second binding by a served id. */
function TableComponent({ component, snapshots, pageSize, syncUrl, columns }: {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  pageSize: number;
  syncUrl: boolean;
  columns: readonly DeclaredColumn[];
}) {
  const [, navigate] = useLocation();
  const rows = rowsForLocalComponent(component, snapshots);
  const lookup = rowsForLocalBinding(component, snapshots, 1);
  if (component.component_id === 'overview-last-run') return <LastRunCard decisions={rows} sessions={lookup} compact />;
  if (component.component_id === 'overview-recent-runs') {
    return rows.length === 0 ? <NoRunsYet /> : <OverviewRunPreview decisions={rows} sessions={lookup} />;
  }
  // OMN-21166 AC26: trends and breakdowns, counted from the served decision rows (rule change R-B, 2026-10-18).
  if (component.component_id === 'overview-insights') return rows.length === 0 ? <NoRunsYet /> : <>
    <InsightsSection decisions={rows} now={Date.now()} view="summary" />
    <details className="local-analysis-details"><summary>Detailed activity analysis</summary>
      <InsightsSection decisions={rows} now={Date.now()} view="analysis" onInspectFailure={cause => navigate(`/runs?status=failed&q=${encodeURIComponent(cause)}`)} />
    </details>
  </>;
  if (component.component_id === 'runs-insights') return <details className="local-analysis-details"><summary>Show run analysis</summary>{rows.length === 0 ? <NoRunsYet /> : <InsightsSection decisions={rows} now={Date.now()} view="analysis" onInspectFailure={cause => {
    navigate(`/runs?status=failed&q=${encodeURIComponent(cause)}`);
    document.querySelector('[data-component="recent-runs"]')?.scrollIntoView?.({ block: 'start' });
  }} />}</details>;
  if (component.component_id === 'overview-quality' || component.component_id === 'overview-tier-mix' || component.component_id === 'runs-tier-mix') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    const row = first && typeof first === 'object' && !Array.isArray(first) ? (first as Row) : null;
    return component.component_id === 'overview-quality'
      ? <QualityPanel row={row} />
      : <TierMixPanel row={row} compact={component.component_id === 'overview-tier-mix'} />;
  }
  if (component.component_id === 'credentials-keys') return <CredentialsTable rows={rows} />;
  // US-1, US-2, US-4: served rows as served. The exposure is tenant-scoped, so the server filters, not the browser.
  if (component.component_id === 'usage-by-model-day') return <UsageByModelDayTable rows={rows} interactive />;
  // US-1 (OMN-21015 AC4): the same served rows as a stacked series, tokens in and out apart, split by model.
  if (component.component_id === 'usage-tokens-by-day') return <UsageTokensByDay rows={rows} />;
  // US-3: metering-summary.v1's day rows, as served; the series renders no all row and sums nothing.
  if (component.component_id === 'usage-savings-series') {
    return (
      <>
        {/* OMN-21015 U2: the same served day rows as bars; the chart plots the money columns this panel declares.
            Its one series takes the chart's third colour, the colour the same figure has on Overview. */}
        <SpendByDayChart title={component.title} rows={rows} columns={columns} colourPlaces={[3]} />
        <MeteringDaySeries rows={rows} />
      </>
    );
  }
  // OV: baseline against actual spend per UTC day, the declared columns of the served rows (OMN-21015 AC1).
  if (component.component_id === 'overview-spend-by-day') {
    const dayRows = rawRowsFor(component, snapshots, 0);
    return (
      <>
        {/* The chart and the table under it show the same served day rows; the chart adds no figure of its own. */}
        <SpendByDayChart title={component.title} rows={dayRows} columns={columns} />
        <MeteringDayTable title={component.title} rows={dayRows} columns={columns} />
      </>
    );
  }
  if (component.component_id === 'api-keys-local-identity') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    return <LocalIdentity row={first && typeof first === 'object' ? (first as Record<string, unknown>) : null} />;
  }
  return rows.length === 0 ? <NoRunsYet /> : <RunsTable decisions={rows} sessions={lookup} pageSize={pageSize} syncUrl={syncUrl}
    truncated={snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)?.truncated} />;
}

/** Resolve a widget's bindings once per exposure; contracts can request several fields from one topic. */
function boundSnapshotsFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): BoundProjectionSnapshot[] {
  const seen = new Set<string>();
  const bound: BoundProjectionSnapshot[] = [];
  // The compact preview displays decision rows only. Its retained contract lookup
  // is used by the full Runs table, but cannot affect any value in this preview.
  const bindings = component.component_id === 'overview-recent-runs'
    ? component.data_bindings?.slice(0, 1) : component.data_bindings;
  for (const binding of bindings ?? []) {
    const topic = binding.projection_topic;
    if (seen.has(topic)) continue;
    const snapshot = snapshots.find((candidate) => candidate.topic === topic);
    if (snapshot) {
      seen.add(topic);
      bound.push(snapshot);
    }
  }
  return bound;
}

/** One widget's read state: the failure of any binding it reads, and how old its data is (requirements, section 2). */
function ReadFailureNotice({ snapshot, title, now, savedMessage, onRetry = requestLocalPageRefresh }: {
  snapshot: Pick<BoundProjectionSnapshot, 'topic' | 'failure' | 'lastGoodAt'>;
  title: string; now: number; savedMessage?: string; onRetry?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => setRetrying(false), [snapshot.failure]);
  const slow = snapshot.failure?.kind === 'timeout';
  const names: Record<string, string> = {
    'page': 'Dashboard',
    'catalogue': 'Dashboard connection',
    'delegation.quality-gate.v1': 'Quality data',
    'delegation.savings.v1': 'Cost data',
    'delegation.decisions.v1': 'Run data',
    'delegation.model-routing.v1': 'Routing data',
    'metering-summary.v1': 'Spending and usage data',
    'usage-by-model-day.v1': 'Usage data',
    'run-trace.v1': 'Run steps',
  };
  const label = names[snapshot.topic.replace('onex.snapshot.projection.', '')] ?? `${title} data`;
  return <div className={`local-read-notice${slow || snapshot.lastGoodAt || savedMessage ? ' local-read-notice--warning' : ' local-read-notice--error'}`} role="alert" aria-live="polite">
    <div className="local-read-notice-head">
      {slow ? <History size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
      <strong>{label}{slow ? ' is taking longer than expected.' : snapshot.lastGoodAt || savedMessage ? ' couldn’t refresh.' : ' is unavailable.'}</strong>
      <button type="button" disabled={retrying} aria-busy={retrying} onClick={() => { setRetrying(true); onRetry(); }}>{retrying ? 'Retrying…' : 'Try again'}</button>
    </div>
    <p>{savedMessage ?? (snapshot.lastGoodAt ? `Showing saved data from ${age(snapshot.lastGoodAt, now)}.` : 'You can retry now or wait for the next refresh.')}</p>
    <details><summary>Technical details</summary><p className="local-read-technical">{plainFailureMessage(snapshot.failure!)}{snapshot.lastGoodAt ? `; last good ${age(snapshot.lastGoodAt, now)}` : ''}</p></details>
  </div>;
}

function WidgetReadState({ component, snapshots, now, interval }: {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  now: number;
  interval: number;
}) {
  const bound = boundSnapshotsFor(component, snapshots);
  const primary = bound[0];
  if (!primary) return null;
  // A tenant-scoped binding with no tenant configured is a typed state, not a read error (OMN-19994), and a panel
  // that binds several such exposures says so once.
  const tenantNotConfigured = bound.some((snapshot) => snapshot.failure?.kind === 'tenant-not-configured');
  const failures = bound.filter((snapshot) => snapshot.failure
    && snapshot.failure.kind !== 'tenant-not-configured'
    && (snapshot.failure.kind !== 'not-served' || snapshot.lastGoodAt));
  // A table's unserved lookup does not hide its rows (rowGatingSnapshots), so it is named here instead.
  const gating = rowGatingSnapshots(component, snapshots);
  const unservedLookups = bound.filter((snapshot) => snapshot.failure?.kind === 'not-served'
    && !snapshot.lastGoodAt && !gating.includes(snapshot));
  const readAt = primary.failure ? primary.lastGoodAt ?? null : primary.readAt;
  const stale = readAt !== null && now - timeOf(readAt) > 2 * interval * 1000;
  return (
    <>
      {tenantNotConfigured && <TenantNotConfiguredState />}
      {failures.map((snapshot) => (
        <ReadFailureNotice key={snapshot.topic} snapshot={snapshot} title={component.title} now={now} />
      ))}
      {unservedLookups.map((snapshot) => (
        <p className="local-dashboard-empty" role="status" key={snapshot.topic}>{plainFailureMessage(snapshot.failure!)}</p>
      ))}
      {readAt !== null && (
        // OMN-21166 (Lakshman, 2026-10-18): a fresh read is not drawn on every panel; it stays for assistive tech, and a
        // stale read is drawn as before.
        <p className={`local-dashboard-asof${stale ? ' local-dashboard-asof--stale' : ' local-dashboard-asof--fresh'}`}>{`As of ${age(readAt, now)}`}</p>
      )}
    </>
  );
}

/**
 * The bindings whose read decides whether a component's rows can render. A table's first binding supplies its rows
 * and a later one is a lookup joined by a served id (a run's cost and basis), so an unserved or failed lookup leaves
 * the served rows on screen and is named under them (OMN-19994 AC1: a fresh store serves decisions but has no
 * savings table). Every other component needs all of its bindings.
 */
function rowGatingSnapshots(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): BoundProjectionSnapshot[] {
  const bound = boundSnapshotsFor(component, snapshots);
  if (component.component_kind !== 'table') return bound;
  const rowsTopic = component.data_bindings?.[0]?.projection_topic;
  return bound.filter((snapshot) => snapshot.topic === rowsTopic);
}

/** A component with any unavailable row-gating binding and no last good read names the unavailable exposure. */
function notServedTopic(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): string | null {
  const snapshot = rowGatingSnapshots(component, snapshots)
    .find((candidate) => candidate.failure?.kind === 'not-served' && !candidate.lastGoodAt);
  return snapshot?.failure ? plainFailureMessage(snapshot.failure) : null;
}

/** A component whose row-gating binding failed with no last good rows renders only its read state. */
function bindingFailedEmpty(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): boolean {
  return rowGatingSnapshots(component, snapshots)
    .some((snapshot) => Boolean(snapshot.failure) && !snapshot.lastGoodAt);
}

/** The icon beside a panel's title, by component. A component not listed here gets none; nothing depends on it. */
export const PANEL_ICONS: Record<string, LucideIcon> = {
  'overview-spend': CircleDollarSign,
  'overview-savings': PiggyBank,
  'overview-measured': Bot,
  'overview-tokens': Coins,
  'overview-last-run': History,
  'overview-recent-runs': Rows3,
  'overview-insights': ChartSpline,
  'runs-insights': ChartSpline,
  'runs-tier-mix': Waypoints,
  'overview-run-locally': Server,
  'overview-avg-saving-per-call': TrendingDown,
  'overview-baseline-spend': Scale,
  'overview-quality': Award,
  'overview-tier-mix': Waypoints,
  'overview-compression': Shrink,
  'overview-cache-hit-rate': DatabaseZap,
  'overview-spend-by-day': ChartLine,
  'recent-runs': Rows3,
  'workflow-run-path': Route,
  'usage-by-model-day': TableProperties,
  'usage-tokens-by-day': ArrowDownUp,
  'usage-savings-series': CalendarDays,
  'credentials-keys': KeyRound,
  'api-keys-local-identity': IdCard,
  'api-keys-cloud': CloudOff,
};

const PAGE_TITLES: Record<LocalPageName, string> = {
  overview: 'Overview',
  runs: 'Runs',
  workflow: 'Workflow',
  usage: 'Usage',
  credentials: 'Credentials',
  'api-keys': 'API Keys',
};

export function LocalDashboardPage({ pageName, syncUrl = false, navigationCache }: LocalDashboardPageProps) {
  const [page, setPage] = useState<LocalPageDocument | null>(null);
  const [snapshots, setSnapshots] = useState<BoundProjectionSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // OV-3: which fixed window the Overview's metering cards read. Kept by the page so every card moves together.
  const [overviewWindow, setOverviewWindow] = useState<OverviewWindow>('all');
  const windowId = useId();
  const latest = useRef<BoundProjectionSnapshot[]>([]);
  // Memory only: reuse recent successful reads between local destinations, scoped
  // to the configured source/tenant and (for traces) the exact requested run.
  const ownCache = useRef<LocalDashboardCache>({ context: null, snapshots: new Map() });
  const recent = navigationCache ?? ownCache.current;
  // One source per mounted page, so a double mount (React's development mode) shares its reads in flight.
  const source = useRef<ReturnType<typeof createSnapshotSource> | null>(null);
  // WF-3: the run Workflow shows is the one its address names (or, without address sync, the one picked here).
  const search = useSearch();
  const [, navigate] = useLocation();
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const requestedRunId = pageName !== 'workflow' ? null : syncUrl ? readWorkflowRunId(search) : pickedRunId;
  const openRun = (runId: string | null) => {
    if (!syncUrl) {
      setPickedRunId(runId);
      return;
    }
    const query = writeWorkflowRunId(search, runId);
    navigate(`${PAGE_PATHS['local-workflow']}${query ? `?${query}` : ''}`);
  };

  useEffect(() => {
    let active = true;
    // A page switch must never show another page's document or another run's steps.
    setPage(null);
    setSnapshots([]);
    latest.current = [];
    setError(null);
    setRefreshError(null);
    setLoading(true);
    let document: LocalPageDocument;
    try {
      document = loadLocalPageConfig(pageName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
      return () => { active = false; };
    }
    const tenant = resolveConfiguredTenant();
    const context = JSON.stringify([resolveEffectiveDataSource(), tenant]);
    if (recent.context !== context) {
      recent.snapshots.clear();
      source.current = null;
      recent.context = context;
    }
    const topics = [...new Set(document.components.flatMap(component =>
      (component.data_bindings ?? []).map(binding => binding.projection_topic)))];
    const snapshotKey = (snapshot: BoundProjectionSnapshot) => `${snapshot.topic}\0${snapshot.runId ?? ''}`;
    // An implicit server tenant is not safe to cache across navigation: the same
    // origin can begin serving another install without a client config change.
    const cached = tenant === null ? [] : topics.flatMap(topic => {
      if (topic === RUN_TRACE_TOPIC && requestedRunId === null) return [];
      const key = `${topic}\0${topic === RUN_TRACE_TOPIC ? requestedRunId ?? '' : ''}`;
      const snapshot = recent.snapshots.get(key);
      return snapshot && Date.now() - timeOf(snapshot.readAt) < 60_000 ? [snapshot] : [];
    });
    latest.current = cached;
    setSnapshots(cached);
    setPage(document);
    setLoading(false);
    // Reads of one page can overlap: the interval and the refresh button each start one while an earlier one is still
    // unanswered. Only the read started last may write. A read that was overtaken answers a question the page has
    // already asked again (the newest run may have changed since), so its rows, its failure and its end of loading
    // are all dropped, however late it answers.
    let started = 0;
    // Every read after the first keeps the last good rows on screen while it runs, and when it fails (F25).
    async function load() {
      const mine = ++started;
      const current = () => active && mine === started;
      const publish = (snapshot: BoundProjectionSnapshot) => {
        if (!current()) return;
        const retained = withLastGood(latest.current, [snapshot])[0];
        latest.current = [...latest.current.filter(candidate => candidate.topic !== snapshot.topic), retained];
        if (pageName === 'workflow' && requestedRunId === null
          && snapshot.topic === DELEGATION_DECISIONS_TOPIC && !snapshot.failure) {
          const runId = newestWorkflowRunId(document, [retained]);
          latest.current = latest.current.filter(candidate => candidate.topic !== RUN_TRACE_TOPIC || candidate.runId === runId);
        }
        setSnapshots(latest.current);
        if (tenant !== null && !snapshot.failure) {
          recent.snapshots.set(snapshotKey(snapshot), snapshot);
          if (recent.snapshots.size > 64) {
            recent.snapshots.delete(recent.snapshots.keys().next().value!);
          }
        }
      };
      let catalogueTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { mode } = resolveEffectiveDataSource();
        if (mode !== 'http') {
          throw new Error('Local pages require HTTP mode to read runtime exposures.');
        }
        // The catalogue precedes the bounded projection reads. Bound this UI
        // wait too: a stalled catalogue must not leave the whole page loading.
        const census = await Promise.race([
          fetchExposureCensus(),
          new Promise<never>((_, reject) => {
            catalogueTimer = setTimeout(() => reject(new Error('Exposure catalogue: no answer in 5 s')), LOCAL_READ_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(catalogueTimer);
        if (!current()) return;
        // Decide from the catalogue before any projection read. Only the explicit
        // local-store absence selects metering; a read error never changes source.
        if (pageName === 'overview') {
          const declared = census.rows.find(row => row.topic === LEGACY_OVERVIEW_TOPIC);
          const localStoreMissing = declared?.reachability === 'refused'
            && declared.backing === 'not_in_local_store' && declared.refusal === 'projection_table_missing';
          const selected = loadLocalPageConfig(pageName, localStoreMissing ? 'metering' : 'savings');
          if (selected.components[0].data_bindings?.[0]?.projection_topic !== document.components[0].data_bindings?.[0]?.projection_topic) {
            // A changed catalogue must not leave an old source's figures visible.
            latest.current = latest.current.filter(snapshot => snapshot.topic !== LEGACY_OVERVIEW_TOPIC && snapshot.topic !== METERING_SUMMARY_TOPIC);
            setSnapshots(latest.current);
          }
          document = selected;
          setPage(document);
        }
        setError(null);
        setRefreshError(null);
        const availableTopics = new Set(
          census.rows.filter((row) => row.reachability === 'reachable').map((row) => row.topic),
        );
        source.current ??= createSnapshotSource();
        await loadLocalPageSnapshots(document, source.current, {
          mode,
          availableTopics,
          runId: requestedRunId,
          onSnapshot: publish,
          isCurrent: current,
        });
        if (current()) {
          setPage(document);
          // Every result has already been published. Reapplying the collected
          // results here could replace a late recovery with an older timeout.
          setSnapshots(latest.current);
          setError(null);
          setRefreshError(null);
        }
      } catch (cause) {
        if (current()) {
          const message = cause instanceof Error ? cause.message : String(cause);
          if (latest.current.length === 0) setError(message);
          else {
            setRefreshError(message);
            // A failed catalogue must terminate uncached panel loading too.
            for (const topic of topics) {
              if (latest.current.some(snapshot => snapshot.topic === topic)) continue;
              publish({ topic, rows: [], rowCount: 0, dataFreshness: 'unknown', latestEventAt: null,
                readAt: new Date().toISOString(), failure: { kind: 'error', message },
                ...(topic === RUN_TRACE_TOPIC ? { runId: requestedRunId } : {}) });
            }
          }
        }
      } finally {
        clearTimeout(catalogueTimer);
        if (current()) setLoading(false);
      }
    }
    const unsubscribeRefresh = subscribeLocalPageRefresh(() => { void load(); });
    void load();
    // The page's declared refresh interval (requirements: the dashboard shows the runtime's data as it changes).
    const timer = setInterval(() => { void load(); }, (document.dashboard.refresh_interval_seconds ?? 30) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribeRefresh();
    };
  }, [pageName, requestedRunId, recent]);

  const emptyState = page ? resolveLocalPageEmptyState(page, snapshots) : null;
  const now = Date.now();
  const interval = page?.dashboard.refresh_interval_seconds ?? 30;

  const renderComponent = (component: LocalPageDocument['components'][number]) => {
    if (!page) return null;
    const rows = rowsForLocalComponent(component, snapshots);
    const first = (rows[0] ?? {}) as Record<string, unknown>;
    const widget = page.dashboard.widgets.find((candidate) => candidate.data_source === component.component_id);
    const pageSize = Number((widget?.config as Record<string, unknown> | undefined)?.page_size ?? 25);
    const notServed = notServedTopic(component, snapshots);
    const unbound = (component.data_bindings ?? []).length === 0;
    const bindings = component.component_id === 'workflow-run-path'
      ? (component.data_bindings ?? []).filter(binding => binding.projection_topic === RUN_TRACE_TOPIC)
      : component.component_kind === 'table' ? (component.data_bindings ?? []).slice(0, 1) : component.data_bindings ?? [];
    const pending = bindings.some(binding => !snapshots.some(snapshot => snapshot.topic === binding.projection_topic));
    const PanelIcon = PANEL_ICONS[component.component_id];
    // OV-3: only the panels that read metering-summary.v1 have a row per window. Every other Overview panel
    // reads an exposure with no day rows, so with today chosen it still shows all time and has to say so:
    // seen on a store of two real days, "Agent calls 4" beside "6 of 6 runs local".
    const outsideWindow = pageName === 'overview' && overviewWindow === 'today'
      && component.data_bindings?.[0]?.projection_topic !== METERING_SUMMARY_TOPIC
      && component.data_bindings?.[0]?.projection_topic !== LEGACY_OVERVIEW_TOPIC
      // OMN-21166: the trends follow the window themselves.
      && component.component_id !== 'overview-insights';
    return (
      <article
        className="local-dashboard-panel"
        data-width={String(pageName === 'overview' && component.component_id === 'overview-spend-by-day' ? 12
          : pageName === 'overview' && ['overview-quality', 'overview-last-run'].includes(component.component_id) ? 6
          : pageName === 'overview' && ['overview-recent-runs', 'overview-tier-mix'].includes(component.component_id) ? 6 : widget?.width ?? 12)}
        data-component={component.component_id}
        data-kind={component.component_kind}
        data-field-tone={component.component_kind === 'metric_card' ? fieldTone(component.title) : undefined}
        aria-busy={pending}
        key={component.component_id}
      >
        <h2 data-page-heading={pageName !== 'overview' || ['overview-quality', 'overview-insights', 'overview-spend-by-day', 'overview-last-run', 'overview-recent-runs', 'overview-tier-mix'].includes(component.component_id) ? '' : undefined} tabIndex={-1}>{PanelIcon && <PanelIcon size={14} aria-hidden="true" />}{pageName === 'overview' && component.component_id === 'overview-insights' ? 'Activity trends' : component.title}</h2>
        {outsideWindow && <p className="local-dashboard-caption">{OUTSIDE_WINDOW_NOTE}</p>}
        {pending ? <p className="local-dashboard-caption" role="status">Loading data…</p>
          : unbound && component.component_kind !== 'metric_card' ? <PendingState componentId={component.component_id} />
          : component.component_id === 'workflow-run-path' ? (
            <WorkflowRun component={component} snapshots={snapshots} requested={requestedRunId} onOpen={openRun} />
          ) : notServed ? <p className="local-dashboard-empty" role="status">{notServed}</p>
          : bindingFailedEmpty(component, snapshots) ? null
          : emptyState === 'NO_RUNS_YET' ? <NoRunsYet />
          : emptyState ? <p className="local-dashboard-empty" role="status">Baseline unresolved</p>
          : component.component_kind === 'table' ? (
            <TableComponent
              component={component}
              snapshots={snapshots}
              pageSize={pageSize}
              syncUrl={syncUrl}
              columns={((widget?.config as { columns?: DeclaredColumn[] } | undefined)?.columns) ?? []}
            />
          ) : component.component_id === 'overview-run-locally' ? (
            <RunLocallyCard row={asRecord(rows[0])} />
          ) : pageName === 'overview' && component.data_bindings?.[0]?.projection_topic === LEGACY_OVERVIEW_TOPIC ? (() => {
            const config = metricConfigFor(page, component.component_id);
            return config ? <OverviewAggregateCard component={component} config={config} rows={rows} window={overviewWindow} />
              : <p className="local-dashboard-empty">Not measured</p>;
          })() : component.component_id === 'overview-avg-saving-per-call' && !unbound ? (
            <SavingsPerRunCard rows={rows} window={overviewWindow} now={now} />
          ) : component.data_bindings?.[0]?.projection_topic === METERING_SUMMARY_TOPIC ? (() => {
            const config = metricConfigFor(page, component.component_id);
            return config
              ? <MeteringTotalCard component={component} config={config} rows={rows} window={overviewWindow} now={now} />
              : <p className="local-dashboard-empty">Not measured</p>;
          })() : (() => {
            const config = metricConfigFor(page, component.component_id);
            return config
              ? <MetricCard component={component} config={config} row={first} caption={captionRowFor(component, snapshots)} />
              : <p className="local-dashboard-empty">Not measured</p>;
          })()}
        {!pending && <WidgetReadState component={component} snapshots={snapshots} now={now} interval={interval} />}
      </article>
    );
  };
  const overviewGroups = {
    summary: ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'],
    focus: ['overview-quality', 'overview-last-run'],
    insights: ['overview-insights'],
  };
  const renderGroup = (ids: string[]) => ids.map(id => {
    const component = page?.components.find(candidate => candidate.component_id === id);
    return component ? renderComponent(component) : null;
  });
  return (
    <RunFilterProvider>
    <main data-destination={`local-${pageName}`} aria-label={`${page?.dashboard.name ?? 'Local dashboard'} page`} className={`local-dashboard-page local-dashboard-page--${pageName}`}>
      <header className="local-dashboard-header">
        <div className="local-dashboard-title">
          <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page={`local-${pageName}`} size={20} /></span>
          <div>
            <h1>{page?.dashboard.name ?? PAGE_TITLES[pageName]}</h1>
            <p>{page?.dashboard.description}</p>
          </div>
        </div>
        {/* One toolbar row: the page's own control when it has one, and the runtime mode at the right. */}
        {pageName === 'overview' && !loading && !error && page && (
          // OMN-21166 mockup build: the window is a two-button switch (radio semantics), not a dropdown.
          <div className="local-dashboard-filters local-window-switch">
            <span id={windowId}>Figures for</span>
            <div role="radiogroup" aria-labelledby={windowId} className="local-window-options">
              {([['all', 'All time'], ['today', 'Today (UTC)']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" data-window={value} aria-checked={overviewWindow === value}
                  onClick={() => setOverviewWindow(value)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <span className="local-dashboard-mode">Local runtime · HTTP</span>
        {/* OMN-21166: new runs and failures since this browser's last Overview visit, from the served runs. */}
        {pageName === 'overview' && !loading && !error && page && (() => {
          const recent = page.components.find(candidate => candidate.component_id === 'overview-recent-runs');
          const decisions = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
            return recent && decisions && !decisions.failure ? <SinceLastVisit decisions={rowsForLocalComponent(recent, snapshots)} now={now} onOpenFailures={() => navigate('/runs?status=failed')} /> : null;
        })()}
        {pageName === 'overview' && <Link className="local-explore-runs" href={PAGE_PATHS['local-runs']}>Explore runs <ArrowUpRight size={14} aria-hidden="true" /></Link>}
      </header>
      {loading && <p role="status">Loading runtime exposures…</p>}
      {error && <ReadFailureNotice title="Dashboard" now={now}
        snapshot={{ topic: 'page', failure: { kind: error.includes('no answer') ? 'timeout' : 'error', message: error } }}
        onRetry={page ? requestLocalPageRefresh : () => window.location.reload()} />}
      {refreshError && <ReadFailureNotice title="Dashboard connection" now={now}
        snapshot={{ topic: 'catalogue', failure: { kind: refreshError.includes('no answer') ? 'timeout' : 'error', message: refreshError } }}
        savedMessage="Showing saved data. Each panel shows when it was updated." />}
      {!loading && !error && page && (
        <section className="local-dashboard-grid" aria-label="Dashboard components">
          {pageName === 'overview' ? <>
            <OverviewRunsContext.Provider value={(() => {
              const recent = page.components.find(candidate => candidate.component_id === 'overview-recent-runs');
              return recent ? { decisions: rowsForLocalComponent(recent, snapshots), now } : null;
            })()}>
            <InsightsWindowContext.Provider value={overviewWindow}>
            <div className="local-overview-surface">
              <section className="local-overview-summary" aria-label="Runtime summary">{renderGroup(overviewGroups.summary)}</section>
              <section className="local-overview-focus" aria-label="Delegation quality">{renderGroup(overviewGroups.focus)}</section>
            </div>
            {renderGroup(overviewGroups.insights)}
            <section className="local-overview-bottom" aria-label="Routing and recent activity">
              {renderGroup(['overview-tier-mix', 'overview-recent-runs'])}
            </section>
            <details className="local-overview-secondary">
              <summary>Additional runtime metrics</summary>
              <section className="local-dashboard-grid" aria-label="Additional runtime metrics">
                {renderGroup(['overview-run-locally', 'overview-avg-saving-per-call', 'overview-baseline-spend',
                  'overview-compression', 'overview-cache-hit-rate', 'overview-spend-by-day'])}
              </section>
            </details>
            </InsightsWindowContext.Provider>
            </OverviewRunsContext.Provider>
          </> : page.components.map(renderComponent)}
        </section>
      )}
    </main>
    </RunFilterProvider>
  );
}
