import { formatDashboardCount, formatFullCount, wholeCount } from '@/lib/dashboard-count';
import { readableTime } from '@/lib/readable-time';
import { exactMs, formatDuration } from '@/lib/duration';
import { dailyMeteringTokens } from '@/lib/daily-metering-tokens';
import { DailyMeteringTokens } from '@/components/dashboard/usage/DailyMeteringTokens';
import { TokenDirections } from '@/components/dashboard/usage/TokenDirections';
import { Fragment, createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { modelColor, tierColor, tierConcept } from '@/lib/dashboard-colors';
import { Link, useLocation, useSearch } from 'wouter';
import {
  CalendarDays,
  ArrowUpRight, Check, ChevronRight, Copy,
  type LucideIcon,
} from 'lucide-react';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus, type ExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { resolveConfiguredTenant } from '@/data-source/projection-tenant';
import { UsageByModelDayTable, UsageTokensChart, formatUsd } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { MeteringDaySeries, meteringDaysByBaseline } from '@/components/dashboard/usage/SavingsSeriesWidget';
import { TenantNotConfiguredState } from '@/components/dashboard/TenantNotConfiguredState';
import { latestServedRead, publishLocalPageRead, requestLocalPageRefresh, subscribeLocalPageRefresh } from '@/services/local-page-refresh';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import { runsToCsv, runsToJson, sortRuns, type RunSortKey } from '@/pages/local/runs-sort-export';
import { PAGE_PATHS } from '@/navigation/page-routes';
import { normaliseRunId, readWorkflowRunId, workflowHref, writeWorkflowRunId } from '@/navigation/workflow-url-state';
import { RunDurationChart, RunMetricChart, RunTimingChart, RunTokensChart, SpendByDayChart, runTimingBars, UNRESOLVED_BASELINE, type ListedRun } from '@/pages/local/charts';
import { PassRateMeter, TIER_TONES } from '@/pages/local/shares';
import { InsightsSection, InsightsWindowContext, MeteringActivityInsights, OverviewRunsContext, PassRateSparkline, TaskIcon, type ActivityWindow } from '@/pages/local/insight-charts';
import { UsageInsights } from '@/pages/local/usage-insights';
import { SinceLastVisit } from '@/pages/local/since-last-visit';
import { ModelKeys } from '@/pages/local/model-keys';
import { EnvironmentPanel } from '@/pages/local/environment';
import { failureCauseLabel, failureDetailText, notAvailableYet, plainFailureMessage, taskLabel, tierLabel } from '@/pages/local/plain-text';
import { RunFilterProvider, causeHref, causeLabelOf, useRunFilter } from '@/pages/local/run-filter';
import { dailySeries, summary as runSummary, toInsightRuns, typedFailureCauseOf } from '@/pages/local/insights';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { NO_RUNS_USD, sumDashboardUsd } from '@/lib/dashboard-money-total';
import { KpiStrip, type KpiItem } from '@/components/dashboard/KpiStrip';
import { CardBasis } from '@/components/dashboard/CardBasis';
import { DashboardAccess, dashboardAccessRow } from '@/pages/local/access';
import { shortId } from '@/components/dashboard/event-dash/primitives';
import { ConceptIcon, FIELD_ICONS, FieldIcon } from '@/components/dashboard/FieldIcon';
import { modelIdentityStyle } from '@/components/dashboard/model-identity';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import '@/styles/local-dashboard.css';
import '@/styles/dashboard-cards.css';
import '@/styles/seven-page-design.css';
import { overviewRunCount } from '@/lib/dashboard-overview-count';
import { DestinationIcon } from '@/navigation/destination-icons';
import { RunAnswer, WorkflowDecisionCharts, WorkflowRecordDetails, WorkflowRoutingFlow } from '@/pages/local/workflow-analysis';
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
  CORRELATION_TRACE_TOPIC,
  isPerRunTopic,
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

function formatMetric(value: unknown, config: MetricCardConfig): string {
  // Currency uses the approved display policy; counts compact, while ratios retain declared precision.
  if (config.format === 'currency') return formatUsd(value);
  if (config.format === 'number' && (config.precision ?? 0) === 0) return formatDashboardCount(value);
  const digits = config.precision ?? 0;
  const grouped = Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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
  /** Further basis lines the caller adds (Overview headline cards put them in the card's tooltip, part 12). */
  basisExtra?: ReactNode;
}

/** AK-3: cloud keys are not linked in the local MVP; one line, no form. */
const CLOUD_NOT_LINKED = 'Cloud keys are not linked in the local runtime. There is nothing to set here.';

/**
 * What a card without a served binding waits on (requirements: an empty state names what it waits on; OMN-19980 AC2c).
 * A page contract cannot carry free text, so it lives here, one entry per such card: the exposure, kept in code for
 * the contract tests, and what it means in plain words, which is all the user reads (OMN-21166 AC39).
 */
export const PENDING_SOURCES: Readonly<Record<string, { exposure: string; waitsOn: string }>> = {
  // OMN-20009: the per-run saving is a metering-summary.v1 column (migration 0002).
  'overview-avg-saving-per-call': { exposure: 'metering-summary.v1', waitsOn: 'savings per run' },
  // OMN-20226: compression_ratio and cache_hit_rate are metering-summary.v1 columns (migration 0003).
  'overview-compression': { exposure: 'metering-summary.v1', waitsOn: 'compression data' },
  'overview-cache-hit-rate': { exposure: 'metering-summary.v1', waitsOn: 'cache hit data' },
};

/** A component bound to no served exposure: what it waits on, never a blank panel (FR-3 partial pages, SV-3). */
export function PendingState({ componentId }: { componentId: string }) {
  if (componentId === 'api-keys-cloud') return <p className="local-dashboard-empty" role="status">{CLOUD_NOT_LINKED}</p>;
  return (
    <p className="local-dashboard-empty" role="status">
      {notAvailableYet(PENDING_SOURCES[componentId]?.waitsOn)}
    </p>
  );
}

const SAVINGS_MODELLED = "Modelled: the runs' tokens priced at the baseline model's list price. The baseline never ran.";

export function captionText(caption: Record<string, unknown> | null | undefined): string | null {
  if (!caption) return null;
  const fields = caption;
  const parts: string[] = [];
  if ('baseline_model' in fields) {
    parts.push(isMissing(fields.baseline_model) ? 'Baseline unresolved' : `Baseline ${String(fields.baseline_model)}`);
  }
  // OMN-21304 AC4: an exposure that serves no baseline or pricing version says so; it is never left blank.
  if ('basis_not_served' in fields) parts.push('Baseline model not recorded', 'Pricing manifest not recorded');
  if ('pricing_manifest_version' in fields) {
    parts.push(isMissing(fields.pricing_manifest_version)
      ? 'Pricing manifest not recorded' : `pricing manifest v${String(fields.pricing_manifest_version)}`);
  }
  // OMN-21304 AC4: an exposure that serves no count of unpriced runs says so, rather than standing another count in.
  if ('unpriced_not_served' in fields) parts.push('Unpriced runs not recorded');
  // OMN-21304 AC4: the runs the total leaves out, each served class under its own name; a missing count is not 0.
  if (Array.isArray(fields.excluded_runs)) {
    const classes = (fields.excluded_runs as Array<[unknown, string, string]>).map(([value, one, many]) => {
      const n = countOf(value);
      return n === null ? `${many}: not recorded` : `${formatDashboardCount(n)} ${n === 1 ? one : many}`;
    });
    parts.push(`Not in this total: ${classes.join(', ')}`);
  }
  if ('zero_token_run_count' in fields && !isMissing(fields.zero_token_run_count)) {
    parts.push(`Zero-token runs: ${formatDashboardCount(fields.zero_token_run_count)}`);
  }
  // OMN-19980 Amendment 2: metering-summary.v1's run classes beside Measured runs, from the same all row. Every run is
  // in exactly one class (measured, no token counts, no spend), so the excluded counts are served, never derived.
  if ('runs_total' in fields) {
    parts.push(`Of ${recordedCount(fields.runs_total)} runs`);
    parts.push(`Unknown-token runs excluded: ${recordedCount(fields.runs_unknown_tokens)}`);
    parts.push(`Unknown-spend runs excluded: ${recordedCount(fields.runs_unknown_spend)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One figure from one served exposure row: the field the widget names. A
 * required field that is absent means the figure is not measured; when that
 * field is a baseline, the figure is a savings figure with no priced baseline,
 * which is BASELINE_UNRESOLVED and never a zero. No row at all is Not measured.
 */
export function MetricCard({ component, config, row, caption, figureLine, figureLineFields = [], basisExtra }: MetricCardProps) {
  if ((component.data_bindings ?? []).length === 0) {
    return <p className="local-dashboard-empty" role="status">{notAvailableYet(PENDING_SOURCES[component.component_id]?.waitsOn)}</p>;
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
    text = config.format === 'currency' ? formatUsd(row[config.metric_key]) : formatMetric(row[config.metric_key], config);
    figure = true;
  }
  const line = captionText(caption);
  // A savings figure is a modelled counterfactual: served tokens priced at the baseline's list price, with no
  // baseline run behind it (Jonah's savings handoff on OMN-19981, aac9032d, item 5).
  // A card captioned with a baseline is modelled, except Spend, which carries the baseline as context and is measured
  // (OMN-21304).
  const modelled = caption !== null && caption !== undefined && 'baseline_model' in caption
    && component.component_id !== SPEND_CARD;
  const details = <>
    {figure && figureLine && <p className="local-dashboard-caption">{figureLine}</p>}
    {line && <p className="local-dashboard-caption local-card-basis">{line}</p>}
    {modelled && <p className="local-dashboard-caption">{SAVINGS_MODELLED}</p>}
    {basisExtra}
  </>;
  const hasDetails = Boolean((figure && figureLine) || line || modelled || basisExtra);
  return (
    <>
      <p className="local-dashboard-metric" data-measured={figure} title={figure && config.format === 'number' ? String(row[config.metric_key]) : undefined}>{text}</p>
      {/* OMN-21166 part 12 AC73 (Lakshman, 2026-10-25, "Figure only, details on hover"): an Overview headline card shows
          its figure; its basis lines live in the card's tooltip, still in the page as the info button's description.
          Every other card keeps its lines in view. */}
      {OVERVIEW_HEADLINE_CARDS.has(component.component_id)
        ? hasDetails && <CardBasis label={component.title}>{details}</CardBasis>
        : details}
    </>
  );
}

/**
 * OMN-21166 Maple grid (Lakshman 2026-10-25): each panel's width in the page's twelve columns, keyed page:component
 * or page:component:slice. A chart takes 8 beside its ranking at 4; everything else spans the row.
 */
const MAPLE_WIDTHS: Readonly<Record<string, number>> = {
  'overview:overview-insights:runs': 12, 'overview:overview-model-usage': 12, 'overview:overview-tier-mix': 12,
  'overview:overview-insights:tokens': 12,
  'overview:overview-quality:card': 3, 'overview:overview-recent-runs': 8, 'overview:overview-last-run': 12,
  'usage:usage-savings-series': 12, 'usage:usage-savings-series:by-model': 12,
  'usage:usage-insights:spend': 12, 'usage:usage-tokens-by-day': 12,
  'usage:usage-insights:cost-per-run': 12, 'usage:usage-insights:tokens-by-model': 12, 'usage:usage-insights:cost-by-route': 12,
  'usage:usage-by-model-day': 12,
};

/**
 * OMN-21166 part 18 AC118: Runs has one "More analysis". The per-run charts belong to the run list (its runs and its
 * click-to-open), so the list draws them into this slot inside the page's "More analysis" instead of a second disclosure.
 */
const RunChartsSlot = createContext<HTMLElement | null | undefined>(undefined);

/** Runs' secondary panels, shown under its "More analysis" (part 13 AC74). */
const RUNS_SECONDARY: ReadonlySet<string> = new Set(['runs-tier-mix', 'runs-insights']);

/** The four Overview headline cards whose basis lines sit in a tooltip (part 12 AC73). */
const OVERVIEW_HEADLINE_CARDS: ReadonlySet<string> = new Set(['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens']);

// OMN-21166 part 15: CardBasis moved to components/dashboard/CardBasis so the shared KPI cards can use it.
export { CardBasis };

/** Overview's "Delegation Quality" card: the served overall pass rate; its hover names the served passed and checked runs. */
/**
 * OMN-21166 part 19 AC133: Delegation Quality's change, from the returned decision rows: the pass rate over runs with a
 * verdict in the last N UTC days against the N days before, in percentage points. Rows that do not reach back over the
 * whole previous window, or a previous window with no verdict, read "No earlier data" (written by claude-920f62a6 after
 * onex delegate run a450aca8 failed).
 */
export function qualityChangeLine(decisions: readonly unknown[], window: ActivityWindow, now: number = Date.now()): string | null {
  if (window.kind !== 'days' || ![7, 15, 30].includes(window.days)) return null;
  const DAY = 86_400_000;
  const today = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const currentStart = utcDay(today - (window.days - 1) * DAY);
  const previousStart = utcDay(today - (2 * window.days - 1) * DAY);
  const dated = asRecords(decisions).map(row => ({ row, day: utcDay(timeOf(row.created_at ?? row.written_at)) }))
    .filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.day));
  if (!dated.some(entry => entry.day <= previousStart)) return 'No earlier data';
  const rate = (from: string, to: string) => {
    const verdicts = dated.filter(entry => entry.day >= from && entry.day <= to && typeof entry.row.quality_gate_passed === 'boolean');
    return verdicts.length === 0 ? null : verdicts.filter(entry => entry.row.quality_gate_passed === true).length / verdicts.length;
  };
  const current = rate(currentStart, utcDay(now));
  if (current === null) return null;
  const previous = rate(previousStart, utcDay(Date.parse(`${currentStart}T00:00:00Z`) - DAY));
  if (previous === null) return 'No earlier data';
  const points = (current - previous) * 100;
  const span = `vs previous ${window.days} days`;
  if (Math.abs(points).toFixed(1) === '0.0') return `Last ${window.days} days: no change ${span}`;
  return `Last ${window.days} days: ${points > 0 ? '+' : '\u2212'}${Math.abs(points).toFixed(1)} pts ${span}`;
}

export function QualityCard({ row, change = null }: { row: Row | null; change?: string | null }) {
  if (!row || isMissing(row.overall_pass_rate) || !Number.isFinite(Number(row.overall_pass_rate))) {
    return <p className="local-dashboard-metric" data-measured="false">Not measured</p>;
  }
  const count = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? 'Not recorded' : formatFullCount(String(value)));
  return <>
    <p className="local-dashboard-metric" data-measured="true">{`${(Number(row.overall_pass_rate) * 100).toFixed(1)}%`}</p>
    {change && <p className="local-card-change">{change}</p>}
    <HeadlineHover label="Delegation Quality" lines={[`${count(row.total_passed)} of ${count(row.total_checks)} runs passed the quality gate`,
      `${count(row.total_failed)} failed · deterministic checks`, 'All time: the window above does not change this figure']} />
  </>;
}

/** The hover of an Overview headline card: its short lines, opened by hovering the card or focusing it (no icon). */
function HeadlineHover({ label, lines }: { label: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return <CardBasis label={label}>{lines.map((line, index) => <p key={index} className="local-dashboard-caption">{line}</p>)}</CardBasis>;
}

// OMN-20009: waits on local_call_share in delegation.model-routing.v1.
const ROUTING_SHARE_PENDING = notAvailableYet('share of runs kept local');

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
        <div data-routing-count="local"><dt><ConceptIcon concept="local-run" size={15} />Local runs</dt><dd>{recordedCount(byTier.local_call_count)}</dd></div>
        <div data-routing-count="total"><dt><FieldIcon label="All runs" size={15} />All runs</dt><dd>{recordedCount(byTier.total_call_count)}</dd></div>
        <div data-routing-count="untiered" data-field-tone="unrouted"><dt><FieldIcon label="Without a tier" size={15} />Without a tier</dt><dd>{recordedCount(byTier.not_tier_routed_count)}</dd></div>
      </dl>
      <p className="local-routing-note">Runs without a routing tier are included in the total. They are not classified as local or cloud here.</p>
    </div>
  );
}

/** The Tokens card's widget key: two served columns shown side by side, never summed (SV-3: no combined total). */
const TOKENS_IN_AND_OUT = 'tokens_in_and_out';
/**
 * The Overview's spend and savings cards, by component, under both headline sources (OMN-21304 AC4). Named by card,
 * not by field, so no savings field is read by name here (OMN-19980 R4).
 */
const SPEND_CARD = 'overview-spend';
const SPEND_AND_SAVINGS_CARDS: ReadonlySet<string> = new Set([SPEND_CARD, 'overview-savings']);

/** A served count as a number: a finite number or decimal text; anything else (true, {}, '') is not a count. */
function countOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/**
 * Tokens in and out from one metering-summary.v1 row. The fold sums tokens only over runs that recorded them, so when
 * every run is an unknown-token run the served 0 is not a measurement and reads Not measured, never 0.
 */
/** OV-3: the window the Overview's metering cards show. The fold serves fixed windows only: all time, and UTC days. */
/** All time, today (UTC), or one served UTC day chosen in the calendar (`day:YYYY-MM-DD`, live review 2026-10-25). */
export type OverviewWindow = 'all' | 'today' | `day:${string}` | `range:${string}`;

/** The last `days` UTC days ending today, as an Overview window (live review 2026-10-25, "unified"). */
export function meteringRangeFor(days: number, now: number = Date.now()): OverviewWindow {
  const end = utcDay(now);
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return `range:${start}..${end}`;
}

/** OMN-21166 part 19 AC134 (onex delegate run 88c90d98): the page each Overview headline card opens. */
const CARD_LINKS: Readonly<Record<string, { href: string; page: string }>> = {
  'overview-spend': { href: '/usage', page: 'Usage' },
  'overview-savings': { href: '/usage', page: 'Usage' },
  'overview-tokens': { href: '/usage', page: 'Usage' },
  'overview-measured': { href: '/runs', page: 'Runs' },
  'overview-quality': { href: '/delegation-evidence', page: 'Delegation Evidence' },
};

const WINDOW_DAYS: Readonly<Record<string, number>> = { today: 1, '7d': 7, '15d': 15, '30d': 30 };

/** OMN-21166 part 19 AC136 (onex delegate run abfb8d86, UTC-safe): the Overview window from its address. `?window=today`,
 * `7d`, `15d` or `30d`, or `?day=YYYY-MM-DD`; anything else is all time and marked malformed so the address is corrected. */
export function readOverviewWindow(search: string, now: number = Date.now()): { overview: OverviewWindow; activity: ActivityWindow; malformed: boolean } {
  const params = new URLSearchParams(search);
  const window = params.get('window');
  const day = params.get('day');
  const all = { overview: 'all' as OverviewWindow, activity: { kind: 'all' } as ActivityWindow };
  if (window === null && day === null) return { ...all, malformed: false };
  if (window !== null && day !== null) return { ...all, malformed: true };
  if (window !== null) {
    const days = WINDOW_DAYS[window];
    if (days === undefined) return { ...all, malformed: true };
    return { overview: days === 1 ? 'today' : meteringRangeFor(days, now), activity: { kind: 'days', days }, malformed: false };
  }
  const realDay = /^\d{4}-\d{2}-\d{2}$/.test(day!) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
  if (!realDay) return { ...all, malformed: true };
  return { overview: `day:${day!}`, activity: { kind: 'custom', start: day!, end: day! }, malformed: false };
}

/** OMN-21166 part 19 AC136: the address for an Overview window, keeping every other parameter. */
export function writeOverviewWindow(search: string, activity: ActivityWindow): string {
  const params = new URLSearchParams(search);
  params.delete('window');
  params.delete('day');
  if (activity.kind === 'days') {
    const key = Object.entries(WINDOW_DAYS).find(([, days]) => days === activity.days)?.[0];
    if (key) params.set('window', key);
  } else if (activity.kind === 'custom' && activity.start !== '' && activity.start === activity.end) params.set('day', activity.start);
  return params.toString();
}

const RANGE_MONEY = ['spend_usd', 'savings_usd', 'counterfactual_usd'] as const;
const RANGE_COUNTS = ['runs_total', 'runs_measured', 'runs_unknown_tokens', 'runs_unknown_spend', 'tokens_in', 'tokens_out'] as const;

/**
 * A window of UTC days as one row: the current baseline's served day rows summed, as AC42 sums them. Lakshman's ruling
 * (live review 2026-10-25, "instead of not measured say 0") replaces AC42's missing-day rule: the runtime writes a day
 * row only for a day with runs, so a day with no row is a day with no runs and adds zero; the row counts such days in
 * `days_without_runs` so the hover can say so. A served day row missing one value still makes that figure null (that
 * value is unknown, not zero), and with no metering rows at all nothing was read, so the window is Not measured. Money
 * adds as exact decimals; the baseline and pricing come from the all-time row; no single-day percentage is carried.
 */
function meteringRangeRow(rows: readonly unknown[], start: string, end: string): { row: Record<string, unknown> } | { message: string } {
  const records = asRecords(rows);
  const allRows = records.filter(r => r.window_kind === 'all');
  const dayRowsServed = records.filter(r => r.window_kind === 'day');
  if (allRows.length === 0 && dayRowsServed.length === 0) return { message: 'Not measured: no metering rows served' };
  const allRow = allRows.length > 0 ? allRows.reduce((a, b) => (timeOf(b.as_of) > timeOf(a.as_of) ? b : a))
    : dayRowsServed.reduce((a, b) => (timeOf(b.as_of) > timeOf(a.as_of) ? b : a));
  const dates: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) dates.push(new Date(t).toISOString().slice(0, 10));
  const byDay = new Map<string, Row>();
  for (const r of dayRowsServed) {
    if (r.baseline_model !== allRow.baseline_model || typeof r.window_start !== 'string') continue;
    const date = String(r.window_start).slice(0, 10);
    const held = byDay.get(date);
    if (!held || timeOf(r.as_of) > timeOf(held.as_of)) byDay.set(date, r);
  }
  const days = dates.flatMap(date => (byDay.has(date) ? [byDay.get(date)!] : []));
  const row: Record<string, unknown> = {
    window_kind: start === end ? 'day' : 'range', window_start: start, window_end: end, as_of: allRow.as_of,
    baseline_model: allRow.baseline_model, pricing_manifest_version: allRow.pricing_manifest_version, baseline_state: allRow.baseline_state,
    days_without_runs: dates.length - days.length,
  };
  for (const field of RANGE_MONEY) row[field] = days.some(d => isMissing(d[field])) ? null : days.length === 0 ? NO_RUNS_USD : sumDashboardUsd(days.map(d => d[field]));
  for (const field of RANGE_COUNTS) {
    row[field] = days.some(d => isMissing(d[field]) || !Number.isFinite(Number(d[field]))) ? null : days.reduce((sum, d) => sum + Number(d[field]), 0);
  }
  return { row };
}

/**
 * OMN-21166 part 19 AC133: a headline card's change against the previous window of the same length, from served metering
 * day rows only, summed as the card's own window is (meteringRangeRow). Written by claude-920f62a6 after the onex delegate
 * draft failed (run a450aca8). A previous window the served day rows do not reach back over reads "No earlier data";
 * never a 0% or 100% from absent rows.
 */
export function periodChangeLine(rows: readonly unknown[], window: string, metricKey: string, current: Record<string, unknown>): string | null {
  const match = /^range:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(window);
  if (!match) return null;
  const DAY = 86_400_000;
  const start = Date.parse(`${match[1]!}T00:00:00Z`);
  const end = Date.parse(`${match[2]!}T00:00:00Z`);
  const days = Math.round((end - start) / DAY) + 1;
  if (!Number.isFinite(days) || days < 1) return null;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const previousStart = iso(start - days * DAY);
  const previousEnd = iso(start - DAY);
  const valueOf = (row: Record<string, unknown>): number | null => {
    const read = (field: string) => (isMissing(row[field]) || !Number.isFinite(Number(row[field])) ? null : Number(row[field]));
    if (metricKey === TOKENS_IN_AND_OUT) {
      const tokensIn = read('tokens_in');
      const tokensOut = read('tokens_out');
      return tokensIn === null || tokensOut === null ? null : tokensIn + tokensOut;
    }
    return read(metricKey);
  };
  const now = valueOf(current);
  if (now === null) return null;
  const reachesBack = asRecords(rows).some(row => row.window_kind === 'day' && typeof row.window_start === 'string'
    && row.window_start.slice(0, 10) <= previousStart);
  if (!reachesBack) return 'No earlier data';
  const previousRow = meteringRangeRow(rows, previousStart, previousEnd);
  const before = 'row' in previousRow ? valueOf(previousRow.row) : null;
  if (before === null) return 'No earlier data';
  const span = `vs previous ${days} days`;
  if (before === 0) return now > 0 ? 'New this period' : `No change ${span}`;
  const pct = ((now - before) / Math.abs(before)) * 100;
  const size = Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : String(Math.round(Math.abs(pct)));
  if (Number(size) === 0) return `No change ${span}`;
  return `${pct > 0 ? '+' : '\u2212'}${size}% ${span}`;
}

/** Restored by Lakshman's explicit instruction, 2026-10-19: use the populated old Overview aggregate. */
const LEGACY_OVERVIEW_TOPIC = 'onex.snapshot.projection.cost.savings-overview.v1';

/**
 * Which exposure the Overview headline reads, decided from the catalogue before any projection read. Only the
 * explicit local-store absence of the old aggregate selects metering; a read error never changes source. Delegation
 * Evidence asks the same question (OMN-21166 AC50), so its headline figures come from the same row as Overview's.
 */
export function overviewHeadlineSource(census: ExposureCensus): 'savings' | 'metering' {
  const declared = census.rows.find(row => row.topic === LEGACY_OVERVIEW_TOPIC);
  return declared?.reachability === 'refused' && declared.backing === 'not_in_local_store'
    && declared.refusal === 'projection_table_missing' ? 'metering' : 'savings';
}

export function OverviewAggregateCard({ component, config, rows, window }: {
  component: LocalPageDocument['components'][number]; config: MetricCardConfig;
  rows: readonly unknown[]; window: OverviewWindow;
}) {
  const unavailable = (message: string) => <p className="local-dashboard-metric" data-measured="false">{message}</p>;
  if (window !== 'all') return unavailable('Not measured: daily totals unavailable (UTC)');
  const all = asRecords(rows).filter(row => row.window === 'all')
    .sort((a, b) => timeOf(b.captured_at) - timeOf(a.captured_at));
  const servedRow = all[0];
  if (!servedRow) return unavailable('Not measured: overview totals unavailable');
  if (all.length > 1 && timeOf(all[0].captured_at) === timeOf(all[1].captured_at)) return unavailable('Not measured: ambiguous overview totals');
  const row = component.component_id === 'overview-measured'
    ? { ...servedRow, run_count: overviewRunCount(servedRow) } : servedRow;
  const value = row[config.metric_key];
  if (isMissing(value) || !['string', 'number'].includes(typeof value)
    || (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value))
    || !Number.isFinite(Number(value))) return unavailable('Not measured');
  const runs = component.component_id === 'overview-measured';
  // OMN-21304 AC4: this exposure serves no baseline model, pricing version or unpriced count. Its money totals sum
  // measured-provenance rows only, so the estimated and unknown-provenance runs are what each total leaves out.
  const basis = SPEND_AND_SAVINGS_CARDS.has(component.component_id) ? {
    basis_not_served: true, unpriced_not_served: true,
    excluded_runs: [[row.estimated_run_count, 'estimated run', 'estimated runs'],
      [row.unknown_run_count, 'unknown-provenance run', 'unknown-provenance runs']],
  } : null;
  return <>
    <MetricCard component={component} config={config} row={row} caption={basis} basisExtra={component.component_id !== 'overview-savings' && !runs && component.component_id !== 'overview-tokens' ? undefined : <>
      {/* OMN-21166 part 9 AC45: only Savings keeps a caption: its basis (in the tooltip since part 12). */}
      {component.component_id === 'overview-savings' && <p className="local-dashboard-caption">Modelled · vs cloud baseline</p>}
      {/* OMN-21166 AC37: the headline is every call; the measured population is a labelled breakdown beside it, the
          same breakdown Delegation Evidence shows under the same figure. */}
      {runs && <RunBreakdown row={row} />}
      {/* OMN-21015: cost.savings-overview.v1 serves the directions as tokens_input_total and tokens_output_total
          (omnimarket#4341). Live review 2026-10-25 ("in out token also - show it when hover it"): they are in the
          card's hover, as on the metering source. */}
      {component.component_id === 'overview-tokens' && <TokenDirections input={row.tokens_input_total} output={row.tokens_output_total} />}
    </>} />
  </>;
}

/**
 * OMN-21166 AC37: the served run classes of one cost.savings-overview.v1 row, as a caption line. A class the row does not
 * serve is left out, never shown as 0. When no run is estimated or unknown the figure already is the measured count, so
 * the line goes rather than repeat it (and the compact first screen keeps its height).
 */
function runBreakdownParts(row: Record<string, unknown>): Array<{ label: string; count: string }> | null {
  // By field, never by position: measured stays whenever it is served (a measured 0 is a value); estimated and unknown
  // only when above 0, and the line only when one of them is.
  const served = ([['measured_run_count', 'measured'], ['estimated_run_count', 'estimated'], ['unknown_run_count', 'unknown']] as const)
    .filter(([field]) => !isMissing(row[field]) && Number.isFinite(Number(row[field])));
  if (!served.some(([field, label]) => label !== 'measured' && Number(row[field]) > 0)) return null;
  return served
    .filter(([field, label]) => label === 'measured' || Number(row[field]) > 0)
    .map(([field, label]) => ({ label, count: formatDashboardCount(row[field]) }));
}

export function runBreakdownText(row: Record<string, unknown>): string | null {
  return runBreakdownParts(row)?.map(({ label, count }) => `${count} ${label}`).join(' · ') ?? null;
}

/**
 * OMN-21166 part 9 AC46: each run class is its own labelled count in its own shared field tone, so no two classes share
 * a colour and the label, not the colour, carries the meaning. Unknown is no measurement: it reads in the not-measured
 * tone, never the failed one.
 */
function RunBreakdown({ row }: { row: Record<string, unknown> }) {
  const parts = runBreakdownParts(row);
  if (!parts) return null;
  return <p className="local-dashboard-caption local-run-classes">
    {parts.map(({ label, count }, index) => <Fragment key={label}>
      {index > 0 && ' · '}
      <span className="local-run-class" data-run-class={label} data-field-tone={`run-${label}`}>{count} {label}</span>
    </Fragment>)}
  </p>;
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
export function pickMeteringRow(
  rows: readonly unknown[],
  window: OverviewWindow = 'all',
  now: number = Date.now(),
): { row: Record<string, unknown> } | { message: string } {
  if (window.startsWith('range:')) {
    const [start, end] = window.slice(6).split('..');
    return meteringRangeRow(rows, start!, end!);
  }
  const date = window === 'today' ? utcDay(now) : window.startsWith('day:') ? window.slice(4) : null;
  // A chosen day with no served row is a day with no runs (Lakshman 2026-10-25): its zero row comes from the range path.
  if (date !== null && !asRecords(rows).some(r => r.window_kind === 'day' && r.window_start === date)) return meteringRangeRow(rows, date, date);
  const all = asRecords(rows).filter((r) => (date === null
    ? r.window_kind === 'all'
    : r.window_kind === 'day' && r.window_start === date));
  if (all.length === 0) {
    return { message: date === null ? 'Not measured: no all-time row' : `Not measured: no metering row for ${window === 'today' ? 'today' : date} (UTC)` };
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
/**
 * Tokens in and out of one metering-summary.v1 row. The fold sums tokens only over runs that recorded them, so when
 * every run is an unknown-token run the served 0 is not a measurement: all three read null, never 0. Shared by the
 * Overview Tokens card and Delegation Evidence (OMN-21166 AC50), so both pages show one figure.
 */
export function meteringTokens(row: Row): { input: bigint | null; output: bigint | null; total: string | null } {
  const runs = wholeCount(row.runs_total);
  const unknown = wholeCount(row.runs_unknown_tokens);
  const allUnknown = runs !== null && unknown !== null && runs <= unknown;
  const input = allUnknown ? null : wholeCount(row.tokens_in);
  const output = allUnknown ? null : wholeCount(row.tokens_out);
  return { input, output, total: input !== null && output !== null ? (input + output).toString() : null };
}

/**
 * The basis line beside a metering-summary.v1 money total: baseline, pricing version and the runs the total leaves
 * out. The fold classes a run with no token counts before it looks at spend, so both classes are left out of the
 * money total; the second is the unpriced count. Shared by Overview's Spend and Savings and Delegation Evidence.
 */
export function meteringMoneyBasis(row: Row): Record<string, unknown> {
  return { baseline_model: row.baseline_model, pricing_manifest_version: row.pricing_manifest_version,
    excluded_runs: [[row.runs_unknown_tokens, 'run with no token counts', 'runs with no token counts'],
      [row.runs_unknown_spend, 'run with no spend recorded', 'runs with no spend recorded']] };
}

/** The UTC days metering-summary.v1 serves a day row for, each once, newest first: the calendar offers only these. */
export function servedMeteringDays(rows: readonly unknown[]): string[] {
  const days = new Set(asRecords(rows).filter(row => row.window_kind === 'day' && typeof row.window_start === 'string')
    .map(row => String(row.window_start).slice(0, 10)));
  return [...days].sort().reverse();
}

const shortDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Live review 2026-10-25 ("open the full calendar"): the calendar of Overview's window control, a month grid. Any past
 * or present UTC day can be picked (a day with no served row is a day with no runs, Lakshman 2026-10-25); days with a
 * served row carry a dot; future days are disabled. The chosen day names itself on the button.
 */
export function OverviewDayPicker({ days, value, onChange, now = Date.now() }: {
  days: readonly string[]; value: OverviewWindow; onChange: (window: OverviewWindow) => void; now?: number;
}) {
  const [open, setOpen] = useState(false);
  const chosen = value.startsWith('day:') ? value.slice(4) : null;
  const today = utcDay(now);
  // The active window, marked on the grid: today for Today, the span for 7/15/30 days, the picked day for a day.
  const [spanStart, spanEnd] = value === 'today' ? [today, today] : value.startsWith('range:') ? value.slice(6).split('..') as [string, string]
    : chosen ? [chosen, chosen] : ['', ''];
  const [month, setMonth] = useState(() => (chosen ?? today).slice(0, 7));
  const served = new Set(days);
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // weeks start on Monday
  const shift = (by: number) => setMonth(new Date(Date.UTC(year, monthIndex - 1 + by, 1)).toISOString().slice(0, 7));
  const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const titleId = useId();
  return (
    <div className="local-day-picker" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <button type="button" className="local-day-button" aria-haspopup="dialog" aria-expanded={open}
        aria-pressed={chosen !== null} aria-label={`Pick a UTC day${chosen ? `, ${chosen} chosen` : ''}`}
        onClick={() => { setOpen(current => !current); setMonth((chosen ?? today).slice(0, 7)); }}>
        <CalendarDays size={14} aria-hidden="true" />{chosen && <span>{shortDay(chosen)}</span>}
      </button>
      {open && (
        <div className="local-day-pop local-calendar" role="dialog" aria-labelledby={titleId}>
          <div className="local-calendar-head">
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)}><ChevronRight size={16} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} /></button>
            <h3 id={titleId}>{title}</h3>
            <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
          <div className="local-calendar-grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(name => <span key={name} className="local-calendar-weekday" aria-hidden="true">{name}</span>)}
            {Array.from({ length: lead }, (_, index) => <span key={`lead-${index}`} aria-hidden="true" />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, '0')}`;
              const future = date > today;
              const label = `${shortDay(date)}, ${year}, ${future ? 'future' : served.has(date) ? 'has runs' : 'no runs'}`;
              return (
                <button key={date} type="button" className="local-calendar-day" aria-label={label} aria-pressed={chosen === date || (value === 'today' && date === today)}
                  data-in-window={spanStart !== '' && date >= spanStart && date <= spanEnd ? 'true' : undefined}
                  data-window-edge={date === spanStart || date === spanEnd ? 'true' : undefined}
                  data-served={served.has(date) ? 'true' : undefined} data-today={date === today ? 'true' : undefined} disabled={future}
                  onClick={() => { onChange(`day:${date}`); setOpen(false); }}>
                  {index + 1}
                </button>
              );
            })}
          </div>
          <p className="local-calendar-key"><i aria-hidden="true" /> has runs · other days count as no runs</p>
        </div>
      )}
    </div>
  );
}

/**
 * Live review 2026-10-25 ("crisp and important info in short"): an Overview headline card's hover lines. Each count is
 * the served value; one the row does not serve reads Not recorded, a zero exclusion is left out, and Spend and Savings
 * keep naming their baseline and pricing version (OMN-21304 AC4). `pctLine` is the served savings ratio line, read by
 * the card that owns that field.
 */
export function headlineHoverLines(componentId: string, row: Row, pctLine: string | null, window: OverviewWindow = 'all'): string[] {
  const count = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? 'Not recorded' : formatFullCount(String(value)));
  const unknownTokens = row.runs_unknown_tokens;
  const unknownSpend = row.runs_unknown_spend;
  const excluded = isMissing(unknownTokens) && isMissing(unknownSpend) ? 'Runs not counted: Not recorded' : (() => {
    const parts = [
      isMissing(unknownTokens) ? 'runs without token counts: Not recorded' : Number(unknownTokens) > 0 ? `${count(unknownTokens)} ${Number(unknownTokens) === 1 ? 'run' : 'runs'} without token counts` : null,
      isMissing(unknownSpend) ? 'runs without spend: Not recorded' : Number(unknownSpend) > 0 ? `${count(unknownSpend)} ${Number(unknownSpend) === 1 ? 'run' : 'runs'} without spend` : null,
    ].filter((part): part is string => part !== null);
    return parts.length === 0 ? null : `Not counted: ${parts.join(', ')}`;
  })();
  const basis = `Baseline ${isMissing(row.baseline_model) ? 'Not recorded' : String(row.baseline_model)} · pricing ${isMissing(row.pricing_manifest_version) ? 'Not recorded' : `v${String(row.pricing_manifest_version)}`}`;
  const noRuns = Number(row.days_without_runs);
  if (Number.isFinite(noRuns) && noRuns > 0 && row.window_kind === 'day') {
    const named = window === 'today' ? 'No runs today (UTC)' : `No runs on ${window.slice(4)} (UTC)`;
    return componentId === 'overview-spend' || componentId === 'overview-savings'
      ? [named, `Baseline ${isMissing(row.baseline_model) ? 'Not recorded' : String(row.baseline_model)} · pricing ${isMissing(row.pricing_manifest_version) ? 'Not recorded' : `v${String(row.pricing_manifest_version)}`}`]
      : [named];
  }
  const when = window === 'all' ? 'all time' : window === 'today' ? 'today (UTC)'
    : window.startsWith('range:') ? `${window.slice(6).replace('..', ' to ')} (UTC)` : `on ${window.slice(4)} (UTC)`;
  const lines: Array<string | null> = componentId === 'overview-spend' ? [window === 'all' ? 'What you paid, all time' : `What you paid ${when}`, excluded, basis]
    : componentId === 'overview-savings' ? [`Modelled at ${isMissing(row.baseline_model) ? 'the cloud baseline' : String(row.baseline_model)} prices. The baseline never ran.`, pctLine, excluded, basis]
      : componentId === 'overview-measured' ? [`${count(row.runs_measured)} of ${count(row.runs_total)} runs measured`, excluded]
        : componentId === 'overview-tokens' ? [`${count(row.tokens_in)} in · ${count(row.tokens_out)} out`]
          : [];
  if (Number.isFinite(noRuns) && noRuns > 0) lines.push(`Includes ${noRuns} ${noRuns === 1 ? 'day' : 'days'} with no runs`);
  return lines.filter((line): line is string => line !== null);
}

export function MeteringTotalCard({ component, config, rows, window = 'all', now }: {
  component: LocalPageDocument['components'][number];
  config: MetricCardConfig;
  rows: readonly unknown[];
  window?: OverviewWindow;
  now?: number;
}) {
  const picked = pickMeteringRow(rows, window, now);
  // OMN-19980 M6/M7: a card that cannot show its figure says why on the card ("Not measured: no all-time row",
  // "Not measured: 2 baseline models"); days with no runs are zeros, so this is only nothing read or an ambiguous row.
  if ('message' in picked) return <p className="local-dashboard-metric" data-measured="false">{picked.message}</p>;
  const row = picked.row;
  if (config.metric_key === TOKENS_IN_AND_OUT) {
    // A day (or window) with no runs at all processed no tokens: that is a measured 0 (Lakshman 2026-10-25), unlike a
    // served row whose every run lacks token counts, which meteringTokens reads as not measured.
    const noRunsAtAll = Number(row.runs_total) === 0 && Number(row.days_without_runs) > 0;
    // The window's summed counts are the zeros of its run-less days; they are read, not typed.
    const total = noRunsAtAll ? Number(row.tokens_in) + Number(row.tokens_out) : meteringTokens(row).total;
    // Live review 2026-10-25: the card shows its figure; its hover says tokens in and out in one line.
    const tokenChange = OVERVIEW_HEADLINE_CARDS.has(component.component_id) ? periodChangeLine(rows, window, TOKENS_IN_AND_OUT, row) : null;
    return <><p className="local-dashboard-metric" data-measured={total !== null}>{formatDashboardCount(total)}</p>
      {tokenChange && <p className="local-card-change">{tokenChange}</p>}
      <HeadlineHover label={component.title} lines={headlineHoverLines(component.component_id, row, null, window)} /></>;
  }
  const required = component.data_bindings?.[0]?.required_fields ?? [];
  // OMN-21304 AC4: Spend and Savings each name the baseline, the pricing version and the runs left unpriced.
  const caption = SPEND_AND_SAVINGS_CARDS.has(component.component_id)
    ? meteringMoneyBasis(row)
    : required.includes('baseline_model')
    ? { baseline_model: row.baseline_model, pricing_manifest_version: row.pricing_manifest_version }
    : required.includes('runs_total')
      ? { runs_total: row.runs_total, runs_unknown_tokens: row.runs_unknown_tokens, runs_unknown_spend: row.runs_unknown_spend }
      : null;
  // OMN-20008 AC5: the Savings card's percentage line, from the same row as the figure, so it follows the chosen
  // window (OMN-21015 AC7). A row that does not serve the ratio yet (or serves null) loses only this line; the figure
  // and its captions stay as they were, and no other window's ratio stands in.
  const pctField = 'savings_pct_of_counterfactual';
  const pct = required.includes(pctField) ? pctAgainstBaseline(row[pctField], row.baseline_model) : null;
  // Live review 2026-10-25: a headline card is its figure; the hover is a few short lines (headlineHoverLines).
  if (OVERVIEW_HEADLINE_CARDS.has(component.component_id)) {
    // A multi-day window sums served day rows and carries no single-day savings percentage, so the figure does not
    // require it (the hover then names the window instead of a percentage).
    // The savings percentage is an optional line (OMN-20008 L4: an absent ratio still shows the figure, never Not
    // measured), so the figure never requires it; a multi-day window carries none at all.
    const figureComponent = { ...component, data_bindings: component.data_bindings?.map(binding => ({
      ...binding, required_fields: binding.required_fields?.filter(field => field !== pctField) })) };
    return <>
      <MetricCard component={figureComponent} config={config} row={row} caption={null} />
      {/* Part 19 AC133: the change against the previous window of the same length, only on a 7, 15 or 30 day window. */}
      {(() => { const change = periodChangeLine(rows, window, config.metric_key, row); return change && <p className="local-card-change">{change}</p>; })()}
      {/* OMN-20008 L6: no figure, no line: the percentage shows only beside a measured saving with a named, resolved baseline. */}
      <HeadlineHover label={component.title} lines={headlineHoverLines(component.component_id, row,
        row.baseline_state === 'unresolved' || isMissing(row[config.metric_key]) || isMissing(row.baseline_model) ? null : pct, window)} />
    </>;
  }
  return (
    <MetricCard component={component} config={config} row={row} caption={caption}
      figureLine={pct} figureLineFields={[pctField]} />
  );
}

/** Days a strip's sparkline covers: the latest 14 UTC days the rows were served for. */
const SPARK_DAYS = 14;


/**
 * OMN-21166 AC63: the Runs page's KPI strip, from the returned decision rows only (the rows the run list below shows):
 * runs, pass rate with its coverage, median and p95 duration with what is unrecorded, failed runs and escalated runs.
 * The sparkline is runs per UTC day over the same rows; a day with no row is a gap, never zero.
 */
export function RunsKpis({ rows, now }: { rows: readonly unknown[]; now: number }) {
  const runs = toInsightRuns(rows);
  if (runs.length === 0) return null;
  const totals = runSummary(runs);
  const latencies = runs.map(run => run.latencyMs).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const p95 = latencies.length === 0 ? null : latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]!;
  const escalationServed = asRecords(rows).filter(row => !isMissing(row.escalation_count) && Number.isFinite(Number(row.escalation_count)));
  const escalated = escalationServed.filter(row => Number(row.escalation_count) > 0).length;
  const days = dailySeries(runs, now, SPARK_DAYS);
  // Part 15 AC91: each figure is an Overview card in its own colour; its caption and what the sparkline showed (runs
  // and pass rate per UTC day over the same rows, a day with no run skipped) are in the card's tooltip.
  const dayKeys = days.map(day => day.day);
  const items: KpiItem[] = [
    // One concept, one colour: a count of runs is Overview's Agent calls concept and colour.
    { label: 'Runs', value: formatDashboardCount(totals.runs), accent: 'var(--field-calls)', concept: 'calls',
      lines: [`Latest ${formatDashboardCount(totals.runs)} returned runs`],
      trend: { days: dayKeys, values: days.map(day => (day.runs > 0 ? day.runs : null)), format: value => formatDashboardCount(value) } },
    { label: 'Pass rate', value: totals.passRate === null ? 'Not recorded' : `${totals.passRate.toFixed(1)}%`, unavailable: totals.passRate === null,
      accent: 'var(--field-pass)', concept: 'pass',
      lines: [`${formatDashboardCount(totals.passed + totals.failed)} of ${formatDashboardCount(totals.runs)} runs have a verdict`],
      trend: { days: dayKeys, values: days.map(day => day.passRate), format: value => `${value.toFixed(1)}%` } },
    { label: 'Median duration', value: totals.medianLatency === null ? 'Not recorded' : formatDuration(totals.medianLatency), unavailable: totals.medianLatency === null,
      title: totals.medianLatency === null ? undefined : exactMs(totals.medianLatency), accent: 'var(--field-duration)', concept: 'duration',
      lines: [totals.medianLatency === null ? null : `Exactly ${exactMs(totals.medianLatency)}`, `${formatDashboardCount(runs.length - latencies.length)} without a duration`] },
    { label: 'p95 duration', value: p95 === null ? 'Not recorded' : formatDuration(p95), unavailable: p95 === null, title: p95 === null ? undefined : exactMs(p95),
      accent: 'var(--field-age)', concept: 'age', lines: [p95 === null ? null : `Exactly ${exactMs(p95)}`, `Over ${formatDashboardCount(latencies.length)} recorded durations`] },
    { label: 'Failed', value: formatDashboardCount(totals.failed), accent: 'var(--field-fail)', concept: 'fail',
      lines: [totals.unrecorded > 0 ? `${formatDashboardCount(totals.unrecorded)} without a verdict` : 'Of the returned runs'] },
    { label: 'Escalated', value: escalationServed.length === 0 ? 'Not recorded' : formatDashboardCount(escalated), unavailable: escalationServed.length === 0,
      accent: 'var(--field-threshold)', concept: 'threshold',
      lines: [escalationServed.length === 0 ? null : `Of ${formatDashboardCount(escalationServed.length)} runs recording escalations`] },
  ];
  return <KpiStrip label="Run summary" items={items} />;
}

/**
 * OMN-21166 AC63: the Usage page's KPI strip, from the same all-time metering-summary.v1 row as Overview's headline
 * (pickMeteringRow), so the two pages show one figure per concept; the sparklines are that exposure's served day rows
 * for the latest days, a missing day a gap. Nothing is computed from prices here.
 */
export function UsageKpis({ rows }: { rows: readonly unknown[] }) {
  const picked = pickMeteringRow(rows, 'all');
  if ('message' in picked) return null;
  const row = picked.row;
  const days = asRecords(rows).filter(day => day.window_kind === 'day' && typeof day.window_start === 'string')
    .sort((a, b) => String(a.window_start).localeCompare(String(b.window_start))).slice(-SPARK_DAYS);
  const series = (field: string) => days.map(day => (isMissing(day[field]) || !Number.isFinite(Number(day[field])) ? null : Number(day[field])));
  const money = (value: unknown) => (isMissing(value) ? 'Not measured' : formatUsd(value));
  const tokens = meteringTokens(row);
  const unresolved = row.baseline_state === 'unresolved';
  const baseline = isMissing(row.baseline_model) ? 'the baseline' : String(row.baseline_model);
  // Part 15 AC91: Overview cards; the captions and what each sparkline showed (the served day rows, a missing day
  // skipped) are in the tooltips.
  const dayKeys = days.map(day => String(day.window_start).slice(0, 10));
  // The day rows exist only for days with runs, so the scope names those days, not a calendar span.
  const scope = `Latest ${dayKeys.length} days with usage`;
  const usd = (value: number) => formatUsd(String(value));
  const count = (value: number) => formatFullCount(String(value));
  const items: KpiItem[] = [
    { label: 'You paid', value: money(row.spend_usd), unavailable: isMissing(row.spend_usd), accent: 'var(--field-cost)', concept: 'cost',
      lines: ['Measured spend, all time'], trend: { days: dayKeys, values: series('spend_usd'), format: usd, scope } },
    { label: 'Baseline cost', value: unresolved ? 'Baseline unresolved' : money(row.counterfactual_usd), unavailable: unresolved || isMissing(row.counterfactual_usd),
      accent: 'var(--field-baseline)', concept: 'baseline', lines: [`Same tokens at ${baseline} list price (modelled)`],
      trend: unresolved ? null : { days: dayKeys, values: series('counterfactual_usd'), format: usd, scope } },
    { label: 'Saved', value: unresolved ? 'Baseline unresolved' : money(row.savings_usd), unavailable: unresolved || isMissing(row.savings_usd),
      accent: 'var(--field-savings)', concept: 'savings', lines: ['Modelled · vs cloud baseline'],
      trend: unresolved ? null : { days: dayKeys, values: series('savings_usd'), format: usd, scope } },
    { label: 'Tokens in', value: tokens.input === null ? 'Not measured' : formatFullCount(tokens.input.toString()), unavailable: tokens.input === null,
      accent: 'var(--field-tokens-in)', concept: 'tokens-in', trend: { days: dayKeys, values: series('tokens_in'), format: count, scope } },
    { label: 'Tokens out', value: tokens.output === null ? 'Not measured' : formatFullCount(tokens.output.toString()), unavailable: tokens.output === null,
      accent: 'var(--field-tokens-out)', concept: 'tokens-out', trend: { days: dayKeys, values: series('tokens_out'), format: count, scope } },
  ];
  return <KpiStrip label="Usage summary" items={items} />;
}

/**
 * OMN-21166 AC66: each model's modelled saving, spend and runs, as the all-time metering-summary.v1 row serves them in
 * summary_json.by_model (the breakdown `onex metering` prints). A model with no measured run has no saving: it reads
 * Not measured with its run count, never $0. The bar is layout only (a model's saving against the largest); nothing
 * here is summed, so the list cannot disagree with the Savings total it breaks down.
 */
export function SavingsByModel({ row }: { row: Row }) {
  const summary = asRecord(row.summary_json);
  const models = summary && Array.isArray(summary.by_model) ? asRecords(summary.by_model) : [];
  // The breakdown adds to the panel's own figures; a row that serves none adds nothing, not a second waiting line.
  if (models.length === 0) return null;
  const saving = (model: Row) => (isMissing(model.savings_usd) || !Number.isFinite(Number(model.savings_usd)) ? null : Number(model.savings_usd));
  const max = Math.max(0, ...models.map(saving).filter((n): n is number => n !== null));
  return (
    <section className="local-savings-by-model" aria-label="Savings by model">
      <h3 className="local-dashboard-caption local-section-heading"><ConceptIcon concept="savings" size={16} />Savings by model</h3>
      {/* OMN-21166 AC64: modelled savings are estimates, so their bars are hatched; the per-model rows are one click away. */}
      <RankedBars layout="vertical" label="Savings by model" unit={`USD · modelled saving against ${isMissing(row.baseline_model) ? 'an unresolved baseline' : String(row.baseline_model)} · higher is better`}
        order="desc" items={models.map((model, index) => {
          const name = isMissing(model.model) ? 'Unknown model' : String(model.model);
          const n = saving(model);
          return { key: `${name}-${index}`, name, value: n, basis: 'estimated' as const, color: modelColor(name),
            display: n === null ? 'Not measured' : formatUsd(model.savings_usd), title: `${recordedCount(model.runs_measured)} of ${recordedCount(model.runs)} runs measured` };
        })} />
      <details className="local-more">
      <summary>Savings by model as a table</summary>
      <ul>
        {models.map((model, index) => {
          const n = saving(model);
          const name = isMissing(model.model) ? 'Unknown model' : String(model.model);
          const runs = recordedCount(model.runs);
          return (
            <li key={`${name}-${index}`} data-semantic-concept={`model:${name}`} style={{ '--model-color': modelColor(name) } as CSSProperties}>
              <span className="local-model-identity" style={modelIdentityStyle(name)}>{name}</span>
              <span className="local-savings-bar" aria-hidden="true">{n !== null && max > 0 && <i style={{ width: `${Math.max(1, (n / max) * 100)}%` }} />}</span>
              <strong data-field-tone="savings" data-field-unavailable={n === null}>{n === null ? 'Not measured' : formatUsd(model.savings_usd)}</strong>
              <span>{`${recordedCount(model.runs_measured)} of ${runs} runs measured`}</span>
              <span>{isMissing(model.spend_usd) ? 'Spend not measured' : `Spend ${formatUsd(model.spend_usd)}`}</span>
            </li>
          );
        })}
      </ul>
      </details>
      <p className="local-dashboard-caption">Modelled against {isMissing(row.baseline_model) ? 'an unresolved baseline' : String(row.baseline_model)}; the totals above are these rows summed by the runtime.</p>
    </section>
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

// OMN-21166 live review 2026-10-25: Avg saving / call was deleted from Overview (Lakshman, "delete them").

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

/**
 * A run's status is its served quality-gate verdict; a run with no served decision has none recorded. OMN-19919 AC5:
 * a run whose terminal was served not ok failed even when no verdict was served (it ended before the gate ran).
 */
function statusOf(decision: Row | undefined): RunStatus {
  if (servedBoolean(decision?.terminal_ok) === false) return 'failed';
  const passed = servedBoolean(decision?.quality_gate_passed);
  if (passed === null) return 'Not recorded';
  return passed ? 'passed' : 'failed';
}

/**
 * A failed run's cause, as the Overview's "Why runs failed" groups it and its link filters it (OMN-19919 AC5, AC7):
 * the served typed terminal_failure_cause, else the label the quality_gate_detail leads with, else Not recorded.
 */
function causeOf(decision: Row | undefined): string {
  const status = statusOf(decision);
  if (status === 'passed') return 'none';
  if (status === 'Not recorded' || decision === undefined) return 'Not recorded';
  return causeLabelOf(decision);
}

function displayCauseOf(decision: Row | undefined): string {
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
function failureDetailOf(decision: Row | undefined): string | null {
  return statusOf(decision) === 'failed' && !isMissing(decision?.quality_gate_detail) ? String(decision?.quality_gate_detail) : null;
}

/**
 * One run's cause on its own card: the served typed cause, else the whole served detail as before OMN-19919, so a
 * card preserves readable detail while opaque diagnostic codes use a plain unavailable state.
 */
function causeTextOf(decision: Row | undefined): string {
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
function Readable({ value, kind }: { value: unknown; kind: 'percent' | 'decimal' | 'count' }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (kind === 'count') return <span className="local-readable" title={String(value)}>{formatDashboardCount(value)}</span>;
  if (!Number.isFinite(number)) return <>{String(value)}</>;
  const text = kind === 'percent'
    ? number.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : number.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return <span className="local-readable" title={String(value)}>{text}</span>;
}

function recordedCount(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatDashboardCount(value);
}
function recordedTokens(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatFullCount(value);
}

function recorded(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : String(value);
}

/**
 * A run's cost in dollars, from its delegation.savings.v1 session when one is served, else from the decision row's
 * own measured cost_usd (OMN-20753). The approved display policy truncates to two decimals,
 * preserving tiny nonzero amounts as $0.01. A cost never measured is served null and reads Not recorded, never $0.00.
 */
function costOf(session: Row | undefined, decision: Row): string {
  const value = isMissing(session?.local_cost_usd) ? decision.cost_usd : session?.local_cost_usd;
  if (isMissing(value)) return 'Not recorded';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not recorded';
  return formatUsd(value);
}

/** A plain decimal as the store serves it: optional minus, digits, optional fraction. No exponent, no grouping. */
const SERVED_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * OMN-21015 AC3: one run's modelled saving as served on delegation.decisions.v1, named against the baseline it was priced
 * against. The page formats the served figure and computes nothing. A run that was not measured says why, never 0; a
 * measured zero is a zero. Decimal text is formatted under the approved two-decimal display policy
 * without changing the source value; anything that is not a plain decimal is not shown as a figure.
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
  return `${formatUsd(figure)} vs ${recorded(run.savings_baseline_model)}`;
}

/** The route tier as served, with its cost regime beside it when the row carries one (OMN-13649, OMN-20225). */
function tierOf(decision: Row): string {
  if (isMissing(decision.cost_tier_name)) return 'Not recorded';
  const name = tierLabel(decision.cost_tier_name);
  return isMissing(decision.cost_tier_type) ? name : `${name} (${tierLabel(decision.cost_tier_type).toLowerCase()})`;
}

/** OMN-21166 AC55: "12.2 s", one formatter for every page; the exact served milliseconds go in the title. */
function duration(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : formatDuration(value);
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

export { readableTime };

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
    ...(status === 'failed' ? [['Cause', causeTextOf(last)] as [string, ReactNode]] : []),
    ['Model', modelOrUnknown(last.model_name)],
    ['Age', age(last.written_at, now)],
    ['Quality score', recorded(last.actual_score)],
    ['Run', <RunRef id={last.correlation_id} key="run" />],
    // OMN-20162's columns: the backend and host of the attempt that accepted the run.
    ['Backend', recorded(last.backend_id)],
    ['Host', recorded(last.host)],
    ['Duration', duration(last.latency_ms)],
    ['Tokens in', recordedTokens(last.tokens_input)],
    ['Tokens out', recordedTokens(last.tokens_output)],
    ['Cost', costOf(session, last)],
    ['Basis', recorded(session?.usage_source)],
    ['Task type', isMissing(last.task_type) ? recorded(last.task_type) : taskLabel(last.task_type)],
    ['Route tier', tierOf(last)],
  ];
  return (
    <section aria-label="Last run" className="local-last-run" data-status={status}>
      <dl className="local-dashboard-fields local-latest-primary">
        {fields.filter(([label]) => ['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
          .map(([label, value]) => <div key={label} data-field={label} data-field-tone={fieldTone(label, label === 'Status' ? status : value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined}><dt><FieldIcon label={label} value={label === 'Status' ? status : value} />{label}</dt><dd data-failure-cause={label === 'Cause' ? causeOf(last) : undefined}>{compact && label === 'Cause' && typeof value === 'string' && value.length > 120
            ? <details className="local-run-cause"><summary><ChevronRight size={12} aria-hidden="true" /><span>{value.slice(0, 120)}…</span></summary><p>{value}</p></details>
            : value}</dd></div>)}
      </dl>
      <details className="local-run-more">
        <summary>Execution details</summary>
        <dl className="local-dashboard-fields">
          {fields.filter(([label]) => !['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
            .map(([label, value]) => <div key={label} data-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined}><dt><FieldIcon label={label} value={value} />{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </details>
      {compact && typeof last.correlation_id === 'string' && last.correlation_id !== '' && <p className="local-dashboard-caption local-recent-footer"><Link href={workflowHref(last.correlation_id)}>Open run details <ArrowUpRight size={12} aria-hidden="true" /></Link></p>}
    </section>
  );
}

/**
 * Live review 2026-10-25 ("slim strip"): Overview's newest run in one line (requirement Q2: status, model and age on
 * the first screen), with its served cost and never a per-run saving (OMN-19980 AC2b); it opens the run.
 */
export function NewestRunLine({ decisions, now = Date.now() }: { decisions: readonly unknown[]; now?: number }) {
  const run = newestFirst(asRecords(decisions))[0];
  if (!run) return <NoRunsYet />;
  return (
    <p className="local-newest-run">
      <OutcomePill value={statusOf(run)} />
      <span data-field-tone="model" data-field-unavailable={isUnavailableField(modelOrUnknown(run.model_name))}>{modelOrUnknown(run.model_name)}</span>
      <span className="local-dashboard-caption">{age(run.written_at, now)}</span>
      <span data-field-tone="cost" data-field-unavailable={costOf(undefined, run) === 'Not recorded'}>{costOf(undefined, run) === 'Not recorded' ? 'Cost not recorded' : costOf(undefined, run)}</span>
      {typeof run.correlation_id === 'string' && run.correlation_id !== ''
        && <Link href={workflowHref(run.correlation_id)} aria-label={`Open run ${run.correlation_id}`}>Open run <ArrowUpRight size={12} aria-hidden="true" /></Link>}
    </p>
  );
}

/** A bounded preview; full records, filters and charts belong on Runs. */
function OverviewRunPreview({ decisions, sessions, now = Date.now() }: RunViewProps) {
  const recent = newestFirst(decisions).slice(0, 5);
  return <>
    <ul className="local-run-preview" aria-label="Recent runs preview">{recent.map((run, index) => <li key={String(run.correlation_id ?? index)}>
      {/* OMN-21166 Maple grid: one dense row per run (id, model, outcome, duration, age); the whole id is the link's name. */}
      <div><RunRef id={run.correlation_id} short /><span data-field-tone="model" data-field-unavailable={isUnavailableField(modelOrUnknown(run.model_name))}>{modelOrUnknown(run.model_name)}</span></div>
      <div><OutcomePill value={statusOf(run)} /><span data-field-tone="duration" data-field-unavailable={isMissing(run.latency_ms)}>{duration(run.latency_ms)}</span><span className="local-dashboard-caption">{age(run.written_at, now)}</span></div>
    </li>)}</ul>
    <p className="local-dashboard-caption local-recent-footer"><Link href={PAGE_PATHS['local-runs']}>View all runs <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
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
    && (filter.cause === null || (statusOf(run) === 'failed' && causeLabelOf(run) === filter.cause)));
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
              {result === 'all' ? 'All' : result === 'passed' ? 'Passed' : 'Failed'} <span>{formatDashboardCount(count(result))}</span>
            </button>
          ))}
        </div>
        {filter.cause !== null && (
          <button type="button" className="local-run-filter-cause" data-failure-cause={filter.cause} aria-label={`Clear cause ${failureCauseLabel(filter.cause)}`} onClick={() => setFilter({ cause: null, result: 'all' })}>
            Cause: {failureCauseLabel(filter.cause)} <span aria-hidden="true">✕</span>
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
              <td data-label="Cause">{causeOf(decision) === 'none' ? <NoFailure /> : <span className="local-recent-value" data-failure-cause={causeOf(decision)} title={failureDetailOf(decision) ? failureDetailText(failureDetailOf(decision)!) : undefined}>{displayCauseOf(decision)}</span>}</td>
              <td data-label="Task type"><span className="local-recent-value">{isMissing(decision.task_type) ? recorded(decision.task_type) : taskLabel(decision.task_type)}</span></td>
              <td className="local-dashboard-cell-token" data-label="Backend"><span className="local-recent-value">{recorded(decision.backend_id)}</span></td>
              <td className="local-dashboard-cell-token" data-label="Host"><span className="local-recent-value">{recorded(decision.host)}</span></td>
              <td data-label="Tokens in"><span className="local-recent-value">{recordedTokens(decision.tokens_input)}</span></td>
              <td data-label="Tokens out"><span className="local-recent-value">{recordedTokens(decision.tokens_output)}</span></td>
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
 * A Runs row's cause (OMN-19919 AC5): the cause the filter and the Overview list use, and the served failure detail it
 * came from, readable on the row (its title, and "Read failure details") whenever it says more than the cause.
 */
/**
 * OMN-21166 part 10 AC58: a passed run has no failure cause; its cell reads a dash with an accessible "No failure",
 * never the word "None". The cause filter keeps its "None" option, which names the served value.
 */
function NoFailure() {
  return <span className="local-runs-cause" data-failure-cause="none" aria-label="No failure" title="No failure">—</span>;
}

function RunCause({ run }: { run: Row }) {
  const rawCause = causeOf(run);
  if (rawCause === 'none') return <NoFailure />;
  const cause = displayCauseOf(run);
  const detail = failureDetailText(failureDetailOf(run) ?? cause);
  if (detail === cause && cause.length <= 120) return <span className="local-runs-cause" data-failure-cause={rawCause} title={cause}>{cause}</span>;
  return <>
    {detail !== cause && <span className="local-runs-cause" data-failure-cause={rawCause} title={detail}>{cause}</span>}
    <details className="local-run-failure"><summary>Read failure details</summary><p className="local-runs-cause" title={detail === cause ? detail : undefined}>{detail}</p></details>
  </>;
}

/**
 * RU-1: every served run with its status, cause and cost, filtered by status, cause, model, backend and window,
 * paged. The backend is the served backend_id; a run served without one is filtered as Not recorded. No
 * per-run saving or baseline price: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RunsTable({ decisions, sessions, now = Date.now(), pageSize = 25, syncUrl = false, truncated = false }: RunsTableProps) {
  const chartsSlot = useContext(RunChartsSlot);
  const id = useId();
  // OMN-21166 AC27: the table opens on its primary fields; every one of the 18 stays in the page, one switch away.
  const [showAllFields, setShowAllFields] = useState(false);
  const search = useSearch();
  const [, navigate] = useLocation();
  const [localView, setLocalView] = useState<RunsViewState>(DEFAULT_RUNS_VIEW);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const view = syncUrl ? readRunsSearch(search) : localView;
  const { status, cause, model, backend, tier = 'all', span, day = '', task = 'all', query = '' } = view;
  const pageIndex = view.page - 1;
  const bySession = indexBy(sessions, 'session_id');
  const runs = newestFirst(decisions);
  const models = [...new Set(runs.map((run) => modelOrUnknown(run.model_name)))].sort();
  const causes = [...new Set(runs.filter((run) => statusOf(run) === 'failed').map((run) => causeOf(run)))].sort();
  const backends = [...new Set(runs.map((run) => recorded(run.backend_id)))].sort();
  // OMN-21166 part 23 AC145 (onex delegate run 33026e86): a run's tier is its served cost_tier_name; a run with none
  // never matches a named tier.
  // (Named servedTierOf so it never shadows tierOf, the module's display name for a run's tier.)
  const servedTierOf = (run: Row): string | null => (typeof run.cost_tier_name === 'string' && run.cost_tier_name !== '' ? run.cost_tier_name : null);
  const tiers = [...new Set(runs.map(servedTierOf).filter((name): name is string => name !== null))].sort();
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const todayDate = new Date(`${utcDay(now)}T00:00:00Z`);
    todayDate.setUTCDate(todayDate.getUTCDate() - (6 - index));
    return todayDate.toISOString().slice(0, 10);
  });
  const week = weekDays.map(weekDay => {
    const dayRuns = runs.filter(run => utcDay(timeOf(run.created_at)) === weekDay);
    return { day: weekDay, runs: dayRuns.length, passed: dayRuns.filter(run => statusOf(run) === 'passed').length,
      failed: dayRuns.filter(run => statusOf(run) === 'failed').length, unrecorded: dayRuns.filter(run => statusOf(run) === 'Not recorded').length };
  });
  const today = utcDay(now);
  const needle = query.trim().toLocaleLowerCase();
  const taskFacetRuns = runs.filter((run) => (status === 'all' || statusOf(run) === status)
    && (cause === 'all' || causeOf(run) === cause)
    && (model === 'all' || modelOrUnknown(run.model_name) === model)
    && (backend === 'all' || recorded(run.backend_id) === backend)
    && (tier === 'all' || servedTierOf(run) === tier)
    && (span === 'all' || utcDay(timeOf(run.created_at)) === today)
    && (day === '' || utcDay(timeOf(run.created_at)) === day)
    && (needle === '' || [run.correlation_id, run.model_name, run.backend_id, run.task_type, run.host, statusOf(run), causeOf(run), failureDetailOf(run)]
      .some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle))));
  const tasks = [...new Set(taskFacetRuns.map(run => recorded(run.task_type)))].sort();
  const matching = taskFacetRuns.filter(run => task === 'all' || recorded(run.task_type) === task);
  // OMN-21166 AC75: a column sort, with not-recorded values last both ways; no sort keeps the served newest-first order.
  const shown = view.sort ? sortRuns(matching, view.sort, view.dir ?? 'desc', runId => bySession.get(runId)) : matching;
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(pageIndex, pages - 1);
  const page = shown.slice(current * pageSize, (current + 1) * pageSize);
  const canonicalSearch = writeRunsSearch(search, { ...view, page: current + 1 });
  useEffect(() => {
    if (syncUrl && canonicalSearch !== search.replace(/^\?/, '')) {
      navigate(`/runs${canonicalSearch ? `?${canonicalSearch}` : ''}`, { replace: true });
    }
  }, [canonicalSearch, navigate, search, syncUrl]);
  useEffect(() => {
    if (selectedRunId !== null && !page.some(run => run.correlation_id === selectedRunId)) {
      setSelectedRunId(page[0] ? String(page[0].correlation_id ?? '') : null);
    }
  }, [page, selectedRunId]);
  const updateView = (change: Partial<RunsViewState>, replace = false) => {
    const next = { ...view, ...change };
    if (syncUrl) {
      const query = writeRunsSearch(search, next);
      navigate(`/runs${query ? `?${query}` : ''}`, { replace });
    } else setLocalView(next);
  };
  const filter = (key: 'status' | 'cause' | 'model' | 'backend' | 'tier' | 'span') => (event: { target: { value: string } }) =>
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
  const filtered = status !== 'all' || cause !== 'all' || model !== 'all' || backend !== 'all' || tier !== 'all' || span !== 'all' || day !== '' || task !== 'all' || query !== '';
  const selectedRun = selectedRunId === null ? undefined : runs.find(run => run.correlation_id === selectedRunId);
  const selectedSession = selectedRun ? bySession.get(String(selectedRun.correlation_id)) : undefined;
  const selectedScore = selectedRun && !isMissing(selectedRun.actual_score) ? Number(selectedRun.actual_score) : Number.NaN;
  const selectedRequiredBar = selectedRun && !isMissing(selectedRun.required_bar) ? Number(selectedRun.required_bar) : Number.NaN;
  const selectedDay = week.find(item => item.day === day);
  const weekLabel = (value: string) => value === today ? `Today ${value}` : `${new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${value}`;
  // OMN-21166 AC75: a sortable header names its order for assistive tech; the first click puts the largest or newest
  // first, the next reverses it.
  const sortHeader = (key: RunSortKey, label: string) => {
    const active = view.sort === key;
    const direction = active ? view.dir ?? 'desc' : null;
    return <th aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
      <button type="button" className="local-sort-header" data-sort-active={active ? '' : undefined}
        onClick={() => updateView({ sort: key, dir: active && direction === 'desc' ? 'asc' : 'desc', page: 1 })}>
        {label}<span aria-hidden="true">{direction === 'asc' ? ' ↑' : direction === 'desc' ? ' ↓' : ''}</span>
      </button>
    </th>;
  };
  // OMN-21166 AC76: every row the search and filters match, across all pages and in the shown order, as served.
  const exportRuns = (format: 'csv' | 'json') => {
    const body = format === 'csv' ? runsToCsv(shown) : runsToJson(shown);
    const blob = new Blob([body], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `runs-${new Date(now).toISOString().slice(0, 16).replace(/[-:]/g, '')}Z.${format}`;
    link.click();
    URL.revokeObjectURL(href);
  };
  // OMN-21166 part 13: no day chips; the Window filter covers them, and a day in the address still filters.
  const weekChart = (
    <figure className="local-chart local-runs-week" aria-label="This week">
        <h3 className="local-dashboard-caption local-section-heading">This week</h3>
      <div className="local-runs-week-days" role="group" aria-label="This week">
        <p role={day ? 'status' : undefined}>{day ? selectedDay ? `${formatDashboardCount(selectedDay.runs)} runs · ${formatDashboardCount(selectedDay.passed)} passed · ${formatDashboardCount(selectedDay.failed)} failed${selectedDay.unrecorded ? ` · ${formatDashboardCount(selectedDay.unrecorded)} not recorded` : ''} for ${day}` : `No runs for ${day}`
          : `${formatDashboardCount(week.reduce((sum, item) => sum + item.runs, 0))} runs in the latest returned rows · by created day (UTC)`}</p>
        {week.map(item => <div key={item.day} role="group" data-selected={day === item.day ? 'true' : undefined}
          aria-label={`${weekLabel(item.day)} · ${formatDashboardCount(item.runs)} runs · ${formatDashboardCount(item.passed)} passed · ${formatDashboardCount(item.failed)} failed${item.unrecorded ? ` · ${formatDashboardCount(item.unrecorded)} not recorded` : ''}`}>
          <span>{weekLabel(item.day)}</span><span className="local-runs-week-bar" aria-hidden="true"><i data-outcome="passed" style={{ flex: item.passed }} /><i data-outcome="failed" style={{ flex: item.failed }} /><i data-outcome="unknown" style={{ flex: item.unrecorded }} /></span>
          {item.runs === 0 ? <strong>No runs</strong> : <strong>{formatDashboardCount(item.runs)}</strong>}<small>{item.passed} passed · {item.failed} failed</small>
        </div>)}
      </div>
    </figure>
  );
  return (
    <>
      {/* OMN-21166 Maple grid: one toolbar row (search, then the filters as compact selects); the scope is one line under it. */}
      <div className="local-runs-toolbar">
      <div className="local-runs-search">
        <label htmlFor={`${id}-search`} className="local-visually-hidden">Search runs</label>
        <input id={`${id}-search`} type="search" value={query} placeholder="Search runs…" title="Search by run ID, model, task, backend or failure"
          autoComplete="off" spellCheck={false} onChange={event => updateView({ query: event.target.value, page: 1 }, true)}
          aria-describedby={`${id}-scope`} />
      </div>
      <div className="local-dashboard-filters">
        <div className="local-filter-field">
        <label htmlFor={`${id}-task`} className="local-visually-hidden">Task</label>
        <select id={`${id}-task`} value={task} onChange={event => updateView({ task: event.target.value, page: 1 })}>
          <option value="all">All tasks</option>
          {tasks.map(name => <option key={name} value={name}>{`${taskLabel(name)} (${formatDashboardCount(taskFacetRuns.filter(run => recorded(run.task_type) === name).length)})`}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-status`} className="local-visually-hidden">Status</label>
        <select id={`${id}-status`} value={status} onChange={filter('status')}>
          <option value="all">All statuses</option>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="Not recorded">Not recorded</option>
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-cause`} className="local-visually-hidden">Cause</label>
        <select id={`${id}-cause`} value={cause} onChange={filter('cause')}>
          <option value="all">All causes</option>
          {cause !== 'all' && !causes.includes(cause) && <option value={cause}>{failureCauseLabel(cause)} (not in current data)</option>}
          {causes.map((name) => <option key={name} value={name}>{failureCauseLabel(name)}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-model`} className="local-visually-hidden">Model</label>
        <select id={`${id}-model`} value={model} onChange={filter('model')}>
          <option value="all">All models</option>
          {model !== 'all' && !models.includes(model) && <option value={model}>{model} (not in current data)</option>}
          {models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-tier`} className="local-visually-hidden">Tier</label>
        <select id={`${id}-tier`} value={tier} onChange={filter('tier')}>
          <option value="all">All tiers</option>
          {tier !== 'all' && !tiers.includes(tier) && <option value={tier}>{tierLabel(tier)} (not in current data)</option>}
          {tiers.map((name) => <option key={name} value={name}>{tierLabel(name)}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-backend`} className="local-visually-hidden">Backend</label>
        <select id={`${id}-backend`} value={backend} onChange={filter('backend')}>
          <option value="all">All backends</option>
          {backend !== 'all' && !backends.includes(backend) && <option value={backend}>{backend} (not in current data)</option>}
          {backends.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        </div>
        <div className="local-filter-field">
        <label htmlFor={`${id}-window`} className="local-visually-hidden">Window</label>
        <select id={`${id}-window`} value={span} onChange={filter('span')}>
          <option value="all">All time</option>
          <option value="today">Today (UTC)</option>
        </select>
        </div>
        {filtered && (
          <button type="button" className="local-filter-clear" onClick={() => { setSelectedRunId(null); updateView({ ...DEFAULT_RUNS_VIEW, query: '', day: '', task: 'all', tier: 'all' }); }}>Clear filters</button>
        )}
      </div>
      </div>
      <p id={`${id}-scope`} className="local-dashboard-caption local-runs-scope">{truncated
        ? `${formatDashboardCount(runs.length)} recent runs returned; earlier history is not included. Search, filters and charts use these records.`
        : `${formatDashboardCount(runs.length)} returned runs. Search, filters and charts use these records.`}</p>
      {shown.length === 0 ? <p className="local-dashboard-empty" role="status">No runs match these filters</p> : (
        <>
          <div className={`local-runs-list-detail${selectedRun ? ' local-runs-list-detail--selected' : ''}`}>
            <div className="local-runs-table-column">
          <h3 className="local-visually-hidden" data-page-heading tabIndex={-1}>Run list</h3>
          <p className="local-dashboard-caption local-recent-toolbar"><label>
            <input type="checkbox" checked={showAllFields} onChange={event => setShowAllFields(event.target.checked)} aria-controls={`${id}-table`} />
            Show all run fields
          </label>
          <span className="local-runs-export" role="group" aria-label="Export the matching runs">
            <button type="button" onClick={() => exportRuns('csv')}>Export CSV</button>
            <button type="button" onClick={() => exportRuns('json')}>Export JSON</button>
          </span></p>
          <div className={`local-dashboard-table-wrap local-dashboard-table-wrap--fit local-runs-wrap${showAllFields ? ' local-runs-wrap--all' : ''}`}>
            <table id={`${id}-table`}>
              <thead>
                <tr>
                  <th>Run</th>{sortHeader('created', 'Created')}<th>Status</th><th>Cause</th><th>Model</th><th>Backend</th><th>Host</th>
                  <th>Tokens in</th><th>Tokens out</th>{sortHeader('cost', 'Local cost')}<th>Modelled saving</th><th>Baseline model</th>
                  <th>Basis</th><th>Task type</th>{sortHeader('duration', 'Duration')}<th>Tokens to compliance</th><th>Route tier</th><th>Quality score</th>
                </tr>
              </thead>
              <tbody>{page.map((run, index) => {
                const session = bySession.get(String(run.correlation_id));
                return <tr key={String(run.correlation_id ?? index)} tabIndex={0} aria-selected={selectedRunId !== null && selectedRunId === run.correlation_id}
                  onClick={event => { if ((event.target as HTMLElement).closest('a, button, input, select')) return; setSelectedRunId(String(run.correlation_id ?? '')); }}
                  onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !(event.target as HTMLElement).closest('a, button, input, select, summary')) { event.preventDefault(); setSelectedRunId(String(run.correlation_id ?? '')); } }}>
                  <td className="local-dashboard-cell-token">
                    {/* WF-3: a run opens its own path on Workflow; a run with no recorded id has nothing to open. */}
                    <RunRef id={run.correlation_id} short />
                    {isFixture(run) && <span className="local-dashboard-badge">fixture</span>}
                  </td>
                  <td className="local-dashboard-cell-token local-dashboard-cell-time"><CellTime value={run.created_at} /></td>
                  <td><OutcomePill value={statusOf(run)} /></td>
                  <td><RunCause run={run} /></td>
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
                  <td>{recordedTokens(run.tokens_input)}</td>
                  <td>{recordedTokens(run.tokens_output)}</td>
                  <td>{costOf(session, run)}</td>
                  <td>{runModelledCell(run)}</td>
                  <td>{recorded(isMissing(run.savings_baseline_model) ? session?.baseline_model : run.savings_baseline_model)}</td>
                  <td>{recorded(session?.usage_source)}</td>
                  <td>{isMissing(run.task_type) ? recorded(run.task_type) : <span className="local-task-cell"><TaskIcon task={String(run.task_type)} />{taskLabel(run.task_type)}</span>}</td>
                  <td title={exactMs(run.latency_ms)}>{duration(run.latency_ms)}</td>
                  <td>{recorded(run.tokens_to_compliance)}</td>
                  <td>{tierOf(run)}</td>
                  <td>{recorded(run.actual_score)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
            </div>
          {selectedRun && <aside className="local-run-selected" role="complementary" aria-label="Selected run">
            <div className="local-dashboard-filters"><h3 className="local-dashboard-caption">Selected run</h3><button type="button" aria-label="Close selected run" onClick={() => setSelectedRunId(null)}>Close</button></div>
            <p className="local-run-title"><code>{recorded(selectedRun.correlation_id)}</code></p>
            <p className="local-dashboard-caption local-run-selected-facts">
              <OutcomePill value={statusOf(selectedRun)} />
              <CellTime value={selectedRun.created_at} />
              {!isMissing(selectedRun.task_type)
                ? <span className="local-task-cell"><TaskIcon task={String(selectedRun.task_type)} />{taskLabel(selectedRun.task_type)}</span>
                : <span>{recorded(selectedRun.task_type)}</span>}
            </p>
            <dl className="local-dashboard-fields">
              <div><dt>Task</dt><dd>{isMissing(selectedRun.task_type) ? recorded(selectedRun.task_type) : taskLabel(selectedRun.task_type)}</dd></div>
              <div><dt>Cause</dt><dd><span className="local-runs-cause" data-failure-cause={causeOf(selectedRun)} title={causeTextOf(selectedRun)}>{causeTextOf(selectedRun)}</span></dd></div>
              <div><dt>Model</dt><dd>{modelOrUnknown(selectedRun.model_name)}</dd></div>
              <div><dt>Route tier</dt><dd>{tierOf(selectedRun)}</dd></div>
              <div><dt>Duration</dt><dd>{duration(selectedRun.latency_ms)}</dd></div>
              <div><dt>Cost</dt><dd>{costOf(selectedSession, selectedRun)}</dd></div>
              <div><dt>Tokens in</dt><dd>{recordedTokens(selectedRun.tokens_input)}</dd></div>
              <div><dt>Tokens out</dt><dd>{recordedTokens(selectedRun.tokens_output)}</dd></div>
              <div><dt>Modelled saving</dt><dd>{runModelledCell(selectedRun)}</dd></div>
              <div><dt>Quality score</dt><dd>{recorded(selectedRun.actual_score)}
                {Number.isFinite(selectedScore) && selectedScore >= 0 && selectedScore <= 1 && <div className="local-selected-quality-meter" role="meter" aria-label="Quality score versus required bar" aria-valuemin={0} aria-valuemax={1} aria-valuenow={selectedScore}
                  aria-valuetext={`Quality score ${recorded(selectedRun.actual_score)}; required bar ${recorded(selectedRun.required_bar)}`}>
                  <span style={{ width: `${selectedScore * 100}%` }} />
                  {Number.isFinite(selectedRequiredBar) && selectedRequiredBar >= 0 && selectedRequiredBar <= 1 && <i style={{ left: `${selectedRequiredBar * 100}%` }} />}
                </div>}
              </dd></div>
              <div><dt>Required bar</dt><dd>{isMissing(selectedRun.required_bar) ? 'bar not recorded' : recorded(selectedRun.required_bar)}</dd></div>
            </dl>
            <p className="local-dashboard-caption"><Link href={workflowHref(String(selectedRun.correlation_id))}>Open full run</Link></p>
          </aside>}
          </div>
          <div className="local-dashboard-pager">
            <span>{`Runs ${current * pageSize + 1}–${current * pageSize + page.length} of ${formatDashboardCount(shown.length)}`}</span>
            <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => updateView({ page: current })}>Previous</button>
            <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => updateView({ page: current + 2 })}>Next</button>
          </div>
          {/* OMN-21166 part 18 AC118: the run charts sit in the page's one "More analysis" (RunChartsSlot). */}
          {/* Outside the Runs page (no slot provided) the list draws its charts after itself. */}
          {chartsSlot !== null && ((panel: ReactNode) => (chartsSlot === undefined ? panel : createPortal(panel, chartsSlot)))(
            <article className="local-dashboard-panel local-run-charts-panel" aria-label="Run charts">
              <h2 className="local-dashboard-panel-title" data-page-heading tabIndex={-1}><ConceptIcon concept="duration" label="Run charts" size={16} />Run charts</h2>
              <div className="local-run-charts">
                <RunDurationChart runs={listed} onOpen={openRun} />
                <RunTokensChart runs={listed} onOpen={openRun} />
                <RunMetricChart runs={listed} onOpen={openRun} metric="cost" />
                <RunMetricChart runs={listed} onOpen={openRun} metric="score" />
              </div>
              {weekChart}
            </article>)}
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
      <PassRateSparkline part="headline" />
      {/* OMN-21166 part 13: the daily line and the check counts are one click away, not in view on load. */}
      <details className="local-more">
        <summary>More quality detail</summary>
        <PassRateSparkline part="trend" />
        <dl className="local-dashboard-fields">
          {QUALITY_FIELDS.map(([label, field]) => <div key={field} data-quality-field={field} data-field-tone={fieldTone(label)} data-field-unavailable={isUnavailableField(row[field])}><dt><FieldIcon label={label} />{label}</dt><dd><Readable value={row[field]} kind={field === 'overall_pass_rate' ? 'percent' : field.startsWith('avg_') ? 'decimal' : 'count'} /></dd></div>)}
        </dl>
      </details>
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
  const runs = (n: number) => `${formatDashboardCount(n)} run${n === 1 ? '' : 's'}`;
  if (isMissing(model.cost_usd)) {
    return unmeasured !== null && unmeasured > 0 ? `Not measured (${runs(unmeasured)})` : 'Not measured';
  }
  const dollars = formatUsd(model.cost_usd);
  if (unmeasured === null) return `${dollars} (unpriced runs unknown)`;
  return unmeasured > 0 ? `${dollars} (+${runs(unmeasured)} not measured)` : dollars;
}

/**
 * OMN-21166 (Lakshman, live review 2026-10-25: "before Tier mix we need to add Model usage"): each model's runs, all
 * time, from delegation.model-routing.v1's served by_model (total_count and pct_of_total, over every run). Nothing is
 * counted or divided here; a model served without a count says Not recorded.
 */
export function ModelUsagePanel({ row }: { row: Row | null }) {
  const models = row && Array.isArray(row.by_model) ? asRecords(row.by_model) : [];
  if (models.length === 0) return <p className="local-dashboard-empty" role="status">No model usage served yet</p>;
  const share = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? null : Number(value));
  return (
    // OMN-21166 part 22 AC144 (Lakshman 2026-10-26, "All models, panel grows"): every model by its full name; more than six
    // models are one row each (the panel may grow), six or fewer stay upright bars.
    <section aria-label="Model usage" className={`local-model-usage local-model-usage--${models.length > 6 ? 'rows' : 'upright'}`}>
      <RankedBars label="Runs by model" unit="Runs" order="desc" layout={models.length > 6 ? 'auto' : 'vertical'}
        items={models.map((model, index) => {
          const name = isMissing(model.model_name) ? 'Not recorded' : String(model.model_name);
          const runs = share(model.total_count);
          const pct = share(model.pct_of_total);
          // Part 19 AC135: a named model opens Runs filtered to it; a model the rows do not name opens nothing.
          const href = isMissing(model.model_name) ? undefined : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, model: name })}`;
          return { key: `${name}-${index}`, name, value: runs, basis: 'measured' as const, color: modelColor(name), href, opensLabel: `Opens Runs filtered to ${name}`,
            display: runs === null ? 'Not recorded'
              : `${recordedCount(model.total_count)}${pct === null ? '' : ` · ${pct > 0 && pct * 100 < 0.1 ? '<0.1' : (pct * 100).toFixed(1)}%`}` };
        })} />
      <p className="local-dashboard-caption">{`${recordedCount(row?.total_delegations)} runs · ${models.length} ${models.length === 1 ? 'model' : 'models'}`}</p>
    </section>
  );
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
  if (compact) {
    // OMN-21166 Maple grid: on Overview the tiers are a ranked list beside Tokens per day; the full breakdown is on Runs.
    const share = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? null : Number(value));
    return (
      <section aria-label="Tier mix">
        <RankedBars label="Runs by tier" unit="Share of tier-routed runs" order="desc" layout="vertical"
          items={tiers.filter(tier => tier.cost_tier_name !== 'not_tier_routed').map((tier, index) => {
            const name = String(tier.cost_tier_name);
            const pct = share(tier.pct_of_tier_routed);
            // Part 19 AC135 with part 23 AC145: a served tier opens Runs filtered to it (?tier=<served name>).
            const href = isMissing(tier.cost_tier_name) ? undefined : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, tier: name })}`;
            return { key: `${name}-${index}`, name: tierLabel(name), value: pct === null ? null : pct * 100, basis: 'measured' as const, color: tierColor(name), href, opensLabel: `Opens Runs filtered to ${tierLabel(name)}`,
              // A served share above zero but under 0.1% reads "<0.1%", never a rounded 0.0% that hides a real tier.
              display: pct === null ? 'Not recorded' : `${recordedCount(tier.count)} · ${pct > 0 && pct * 100 < 0.1 ? '<0.1' : (pct * 100).toFixed(1)}%` };
          })} />
        <p className="local-dashboard-caption">{`${recordedCount(byTier.tier_routed_total)} tier-routed · ${recordedCount(byTier.not_tier_routed_count)} not tier-routed · ${recordedCount(byTier.total_tasks)} runs`}</p>
      </section>
    );
  }
  return (
    <section aria-label="Tier mix">
      {/* Part 18 AC120: the table, shown directly; the meter bars repeated its shares (Overview's Tier mix draws them). */}
      <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit">
        <table>
          <thead><tr><th><span><FieldIcon label="Tier" size={13} />Tier</span></th><th><span><ConceptIcon concept="delegations" label="Runs" size={13} />Runs</span></th><th><span><ConceptIcon concept="routing" label="Share of tier-routed" size={13} />Share of tier-routed</span></th><th><span><FieldIcon label="Cost" size={13} />Cost</span></th></tr></thead>
          <tbody>{tiers.flatMap((tier, index) => {
            const name = String(tier.cost_tier_name);
            const concept = tierConcept(name) ?? 'tier-other';
            const tone = TIER_TONES[name] ?? 'other';
            // Part 18 AC120: a share is of the tier-routed runs, so runs outside the tier routing have none.
            const routed = name !== 'not_tier_routed' && (tier.tier_routed === true || tier.tier_routed === 1);
            return [
            <tr className="local-routing-tier-row" data-tone={tone} style={{ '--tier-color': tierColor(name) } as CSSProperties} key={`${name}-${index}`}>
              {/* A served share is a long decimal and a name has no break opportunity: each may break inside itself, as
                  the repo's other token cells do, so the Cost column stays inside the panel at 1440x900 with no
                  sideways scroll. Costs wrap at their spaces. */}
              <td className="local-dashboard-cell-token local-dashboard-cell-name"><span className="local-routing-name"><ConceptIcon concept={concept} label={tierLabel(name)} value={name} size={16} />{isMissing(tier.cost_tier_name) ? recorded(tier.cost_tier_name) : tierLabel(name)}</span></td>
              <td data-column="runs">{recordedCount(tier.count)}</td>
              <td data-column="share" className="local-dashboard-cell-token">{routed ? <Readable value={tier.pct_of_tier_routed} kind="percent" /> : <><span aria-hidden="true">—</span><span className="local-visually-hidden">No share: not tier-routed</span></>}</td>
              <td />
            </tr>,
            ...(Array.isArray(tier.models) ? asRecords(tier.models) : []).map((model, modelIndex) => (
              <tr data-tone={tone} style={{ '--tier-color': tierColor(name) } as CSSProperties} key={`${name}-${index}-${String(model.model_name)}-${modelIndex}`} className="local-dashboard-row--nested local-routing-model-row">
                <td className="local-dashboard-cell-token local-dashboard-cell-name"><span className="local-routing-name local-model-identity" style={modelIdentityStyle(model.model_name)}><FieldIcon tone="model" value={model.model_name} size={14} />{recorded(model.model_name)}</span></td>
                <td data-column="runs">{recordedCount(model.count)}</td>
                <td data-column="share" className="local-dashboard-cell-token">{routed ? <Readable value={model.pct_of_tier_routed} kind="percent" /> : <><span aria-hidden="true">—</span><span className="local-visually-hidden">No share: not tier-routed</span></>}</td>
                <td data-column="cost" data-unavailable={isMissing(model.cost_usd)}>{tierModelCost(model)}</td>
              </tr>
            )),
          ];})}</tbody>
        </table>
      </div>
      <dl className="local-dashboard-fields">
        <div data-field-tone="routing" data-field-unavailable={isMissing(byTier.tier_routed_total)}><dt><FieldIcon label="Tier-routed" />Tier-routed</dt><dd>{recordedCount(byTier.tier_routed_total)}</dd></div>
        <div data-field-tone="unrouted" data-field-unavailable={isMissing(byTier.not_tier_routed_count)}><dt><FieldIcon label="Not tier-routed" />Not tier-routed</dt><dd>{recordedCount(byTier.not_tier_routed_count)}</dd></div>
        <div data-field-tone="delegations" data-field-unavailable={isMissing(byTier.total_tasks)}><dt><FieldIcon label="All runs" />All runs</dt><dd>{recordedCount(byTier.total_tasks)}</dd></div>
      </dl>
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
        <p>No provider credentials recorded</p>
        <p>Set one with <code>onex secret set</code> <CopyButton text="onex secret set" label="Copy the command that sets a key" /></p>
      </div>
    );
  }
  // OMN-21166 part 13: the keys in use are in view; revoked history is one click away. Rows stay as served.
  const current = keys.filter(key => isMissing(key.revoked_at));
  const revoked = keys.filter(key => !isMissing(key.revoked_at));
  const table = (list: Row[], label: string) => (
    <div className="local-dashboard-table-wrap local-credentials-records">
      <table aria-label={label}>
        <thead><tr><th>Provider</th><th>Key ref</th><th>Fingerprint</th><th>Set</th><th>Revoked</th><th>Expires</th><th>Bound host</th></tr></thead>
        <tbody>{list.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            <td data-label="Provider">{recorded(key.provider)}</td>
            <td data-label="Key ref">{recorded(key.name)}</td>
            {/* OMN-19985: the served fingerprint prefix (8 hex of sha256) and the time the key was set; a row its
                producer sent without them says so. created_at is when the projection first saw the row, not this. */}
            <td data-label="Fingerprint">{recorded(key.fingerprint)}</td>
            {/* OMN-21166 AC60/AC66: times read as "Oct 14, 08:24:11 UTC" with the served value in the title; the served
                expiry and bound host are shown, and say so when the producer recorded none. Never a secret. */}
            <td data-label="Set"><CellTime value={key.set_at} /></td>
            <td data-label="Revoked">{isMissing(key.revoked_at) ? 'Not revoked' : <CellTime value={key.revoked_at} />}</td>
            <td data-label="Expires">{isMissing(key.expires_at) ? 'No expiry recorded' : <CellTime value={key.expires_at} />}</td>
            <td data-label="Bound host">{recorded(key.bound_host)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  // Part 18 AC128: the keys in use are on their providers' rows of the one Model providers table above (ModelKeys); this
  // part keeps what that table does not: no key in use, and the key history.
  return (
    <>
      {current.length === 0 && <p className="local-dashboard-empty" role="status">No key is in use; every recorded key is revoked</p>}
      {revoked.length > 0 && (
        <details className="local-more">
          <summary>{`Show key history (${formatDashboardCount(revoked.length)} revoked)`}</summary>
          {table(revoked, 'Revoked key references')}
        </details>
      )}
    </>
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
    ...(status === 'failed' ? [['Cause', causeTextOf(decision)] as [string, string]] : []),
    ['Quality score', recorded(decision.actual_score)],
    ['Task type', isMissing(decision.task_type) ? recorded(decision.task_type) : taskLabel(decision.task_type)],
    ['Model', modelOrUnknown(decision.model_name)],
    ['Backend', recorded(decision.backend_id)],
    ['Host', recorded(decision.host)],
    ['Route tier', tierOf(decision)],
    // OMN-21015: more of what the run's own row serves, each as served. A served zero is a figure and is shown; a
    // fact the row does not carry says Not recorded.
    ['Required bar', recorded(decision.required_bar)],
    ['Tokens in', recordedTokens(decision.tokens_input)],
    ['Tokens out', recordedTokens(decision.tokens_output)],
    ['Finish reason', recorded(decision.finish_reason)],
    ['Truncated', yesOrNo(decision.truncated)],
    ['Escalations', recordedCount(decision.escalation_count)],
    // The model the caller asked for, beside the model that answered; and the two timings the row serves beside its
    // duration. Each new one is the served column (omnimarket v0.4.309, OMN-19448): missing is Not recorded, never zero.
    ['Requested model', recorded(decision.requested_model)],
    // The three timings stand together and last, in the order their bars are drawn in under the tiles.
    ['Queue wait', duration(decision.queue_wait_ms)],
    ['Execution', duration(decision.execution_ms)],
    ['Duration', duration(decision.latency_ms)],
  ];
  const timings = [
    { key: 'queue_wait_ms', label: 'Queue wait', value: decision.queue_wait_ms },
    { key: 'execution_ms', label: 'Execution', value: decision.execution_ms },
    { key: 'latency_ms', label: 'Duration', value: decision.latency_ms },
  ];
  // OMN-21166 part 13: a chart whose one drawable bar is the total duration repeats the Duration tile, so it is left
  // out; the chart's own rule decides what is drawable, and the tiles still say Not recorded for the rest.
  const drawable = runTimingBars(timings).bars;
  const onlyTotal = drawable.length === 1 && drawable[0]!.label === 'Duration';
  const timingChart = onlyTotal ? null : <RunTimingChart timings={timings} compact={showAnalysis} accentToken={showAnalysis ? '--workflow-timing-accent' : undefined} />;
  return (
    <section aria-label="Run summary" className="local-dashboard-run-summary">
      <div className="local-run-summary-groups">
        {[
          { name: 'Run outcome', concept: 'run-outcome', labels: ['Cause', 'Quality score', 'Required bar', 'Task type'] },
          { name: 'Routing and model', concept: 'routing-model', labels: ['Model', 'Requested model', 'Backend', 'Host', 'Route tier'] },
          { name: 'Tokens and completion', concept: 'tokens-completion', labels: ['Tokens in', 'Tokens out', 'Finish reason', 'Truncated', 'Escalations'] },
          { name: 'Timing', concept: 'timing', labels: ['Queue wait', 'Execution', 'Duration'] },
        ].map(({ name, concept, labels }, index) => <section key={name} className="local-run-summary-group" aria-labelledby={`${sectionId}-${index}`}>
          <h3 className="local-dashboard-caption" id={`${sectionId}-${index}`}><ConceptIcon concept={concept} label={name} size={16} />{name}</h3>
          <dl className="local-dashboard-fields">
            {index === 0 && <div data-field-tone={fieldTone('Status', status)}><dt><FieldIcon label="Status" value={status} />Status</dt><dd><OutcomePill value={status} /></dd></div>}
            {fields.filter(([label]) => labels.includes(label)).map(([label, value]) => <div key={label} data-summary-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined}><dt><FieldIcon label={label} value={value} />{label}</dt><dd>{label === 'Cause' && value.length > 120
              ? <details className="local-run-failure-details"><summary title={value}>Show failure reason</summary><p>{value}</p></details>
              : value}</dd></div>)}
          </dl>
        </section>)}
      </div>
      {/* The same three timings as bars, under the labels their tiles carry. */}
      {showAnalysis ? (timingChart && <WorkflowDecisionCharts decision={decision} show="timing">{timingChart}</WorkflowDecisionCharts>) : timingChart}
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
export function RunTimeline({ steps, run }: {
  steps: readonly unknown[];
  /** The run's backend and model, shown in the run summary above; a step repeats them only where it differs (part 18 AC126). */
  run?: { backend_id?: unknown; model_name?: unknown };
}) {
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
        // OMN-21304 AC3: a routing decision's reason, candidates and confidence are what the step is for, so when the
        // row records none of them they read not recorded rather than vanish; a measured confidence of 0 stays a value.
        // Other steps keep leaving an absent detail out.
        const routing = kind === 'routing_decision';
        const unrecordedRouting: Array<[string, string]> = routing ? [
          ...(isMissing(row.reason) ? [['reason', 'not recorded'] as [string, string]] : []),
          ...(candidates.length === 0 ? [['candidates', 'not recorded'] as [string, string]] : []),
          ...(isMissing(row.confidence) ? [['confidence', 'not recorded'] as [string, string]] : []),
        ] : [];
        // Each served detail under its own name; a detail the row does not carry is left out, never shown empty.
        const details: Array<[string, string]> = [
          ...unrecordedRouting,
          ...(routing && !isMissing(row.confidence) ? [['confidence', String(row.confidence)] as [string, string]] : []),
          ...(isMissing(row.failure_cause) ? [] : [['cause', failureCauseLabel(row.failure_cause)] as [string, string]]),
          ...(isMissing(row.backend_id) || (run && String(row.backend_id) === String(run.backend_id)) ? [] : [['backend', String(row.backend_id)] as [string, string]]),
          ...(isMissing(row.model_id) || (run && String(row.model_id) === String(run.model_name)) ? [] : [['model', String(row.model_id)] as [string, string]]),
          ...(isMissing(row.attempt_number) ? [] : [['attempt', String(row.attempt_number)] as [string, string]]),
          // OMN-21166 AC54: candidate tiers read as words; the served keys stay in the data.
          ...(candidates.length === 0 ? [] : [['candidates', candidates.map(tierLabel).join(', ')] as [string, string]]),
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
 * WF-1 to WF-3 (OMN-19987, OMN-21015 AC9, OMN-19920): one run, the one asked for or the newest, with its decision row,
 * its answer from correlation-trace.v1 and its steps from run-trace.v1. The loader read the steps for exactly the run named on their snapshot (runId), so this
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
    ? <p className="local-dashboard-empty" role="status">{plainFailureMessage(decisionsRead.failure, { topic: decisionsRead.topic })}</p>
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
      ) : null}
      {/* OMN-19920: the run's answer, read for this run only; the page binds it only where its contract declares it.
          Part 18 AC125: the row of step boxes is gone (the timeline below shows the same steps, with time and detail). */}
      {(component.data_bindings ?? []).some((binding) => binding.projection_topic === CORRELATION_TRACE_TOPIC) && (
        <RunAnswer read={snapshots.find((snapshot) => snapshot.topic === CORRELATION_TRACE_TOPIC)} runId={runId} />
      )}
      {stepsUnread || foreign ? null : (
        <>
          <RunTimeline steps={rows} run={decisions.find((row) => row.correlation_id === runId)} />
          {stepsRead?.truncated && (
            <p className="local-dashboard-empty" role="status">
              {`Not the whole run: run-trace.v1 answered a truncated page of ${formatDashboardCount(rows.length)} steps`}
            </p>
          )}
        </>
      )}
      {/* OMN-21166 part 13: the recorded fields and the stage chart (a repeat of the step durations) are one click away. */}
      <details className="local-more">
        <summary>More run details</summary>
        {(() => {
          const decision = decisions.find((row) => row.correlation_id === runId);
          return decision ? <WorkflowDecisionCharts decision={decision} show="comparisons">{null}</WorkflowDecisionCharts> : null;
        })()}
        <WorkflowRecordDetails decision={decisions.find((row) => row.correlation_id === runId)} steps={stepsUnread || foreign ? [] : rows} />
      </details>
    </div>
  );
}

/** AK-1: the tenant id from a served row. Part 18 AC130: no exposure serves when the identity was minted, so that row is
 * not drawn (it could only ever read Not recorded). */
export function LocalIdentity({ row }: { row: Record<string, unknown> | null }) {
  return (
    <dl className="local-dashboard-fields">
      <div data-field-tone={fieldTone('Tenant')} data-field-unavailable={isUnavailableField(row?.tenant_id)}><dt><FieldIcon label="Tenant" />Tenant</dt><dd className="local-identity-value"><span>{recorded(row?.tenant_id)}</span>{typeof row?.tenant_id === 'string' && row.tenant_id.trim() !== '' && <CopyButton text={row.tenant_id} label="Copy the tenant identity" />}</dd></div>
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
  if (column.key === 'tokens_in' || column.key === 'tokens_out') return formatFullCount(value);
  if (column.key.startsWith('runs_') || column.key.endsWith('_count')) return formatDashboardCount(value);
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
/**
 * OMN-21166 Maple grid: one bound component drawn as several panels, each a slice of the same served rows (the
 * Overview activity charts and failure causes; Usage's savings and spend by model beside their day charts).
 */
export interface PanelSlice { key: string; title: string; concept: string }

function TableComponent({ component, snapshots, pageSize, syncUrl, columns, activityWindow, meteringView = 'all', slice }: {
  slice?: PanelSlice;
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  pageSize: number;
  syncUrl: boolean;
  columns: readonly DeclaredColumn[];
  activityWindow: ActivityWindow;
  meteringView?: 'all' | 'kpis' | 'daily';
}) {
  const [, navigate] = useLocation();
  const rows = rowsForLocalComponent(component, snapshots);
  const lookup = rowsForLocalBinding(component, snapshots, 1);
  if (component.component_id === 'overview-last-run') return <LastRunCard decisions={rows} sessions={lookup} compact />;
  if (component.component_id === 'overview-recent-runs') {
    if (slice?.key === 'newest') return rows.length === 0 ? <NoRunsYet /> : <NewestRunLine decisions={rows} />;
    return rows.length === 0 ? <NoRunsYet /> : <OverviewRunPreview decisions={rows} sessions={lookup} />;
  }
  // OMN-21166 AC26: trends and breakdowns, counted from the served decision rows (rule change R-B, 2026-10-18).
  if (component.component_id === 'overview-insights') {
    // AC42: the metering KPIs for the selected window sit in this open panel, and their charts in its analysis,
    // so the panel's text stays inside a panel (OMN-21015 K1) and nothing is drawn twice.
    const metering = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
    const meteringRows = metering?.rows ?? [];
    const meteringUnavailable = metering?.failure ? 'Daily metering data is not available yet.' : null;
    // OMN-21166 part 13: Overview keeps the activity summary; the window's spend line sits in "More activity" with the
    // run counts, and the detailed analysis lives on Runs (its "Explore run analysis" link stays).
    if (slice) return rows.length === 0 ? <NoRunsYet /> : <InsightsSection decisions={rows} now={Date.now()} view={slice.key as 'runs' | 'tokens' | 'failures'} onInspectFailure={cause => navigate(causeHref(cause))}
 />;
    return rows.length === 0 ? <NoRunsYet /> : <>
    <InsightsSection decisions={rows} now={Date.now()} view="summary" more={meteringRows.length > 0
      ? <MeteringActivityInsights rows={meteringRows} now={Date.now()} window={activityWindow} unavailable={meteringUnavailable} display="kpis" />
      : null} />
  </>;
  }
  if (component.component_id === 'runs-insights') return <>{rows.length === 0 ? <NoRunsYet /> : <InsightsSection decisions={rows} now={Date.now()} view="analysis" onInspectFailure={cause => {
    navigate(causeHref(cause));
    document.querySelector('[data-component="recent-runs"]')?.scrollIntoView?.({ block: 'start' });
  }} />}</>;
  if (component.component_id === 'overview-model-usage') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    return <ModelUsagePanel row={first && typeof first === 'object' && !Array.isArray(first) ? (first as Row) : null} />;
  }
  if (component.component_id === 'overview-quality' || component.component_id === 'overview-tier-mix' || component.component_id === 'runs-tier-mix') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    const row = first && typeof first === 'object' && !Array.isArray(first) ? (first as Row) : null;
    // Live review 2026-10-25: on Overview, quality is the fifth headline card, "Delegation Quality": its pass rate, and
    // in its hover how many runs passed the deterministic gate.
    if (component.component_id === 'overview-quality' && slice?.key === 'card') {
      const decisions = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)?.rows ?? [];
      return <QualityCard row={row} change={qualityChangeLine(decisions, activityWindow)} />;
    }
    return component.component_id === 'overview-quality'
      ? <QualityPanel row={row} />
      : <TierMixPanel row={row} compact={component.component_id === 'overview-tier-mix'} />;
  }
  if (component.component_id === 'credentials-keys') return <CredentialsTable rows={rows} />;
  // Usage analysis and the raw row table are separate declared components so the analysis does not duplicate rows.
  if (component.component_id === 'usage-insights') return <UsageInsights usageRows={rows}
    part={slice && ['spend', 'cost-per-run', 'tokens-by-model', 'cost-by-route'].includes(slice.key) ? slice.key as 'spend' | 'cost-per-run' | 'tokens-by-model' | 'cost-by-route' : 'all'}
    decisionRows={rawRowsFor(component, snapshots, 1)} routingRows={rawRowsFor(component, snapshots, 2)} />;
  // US-1, US-2, US-4: served rows as served. The exposure is tenant-scoped, so the server filters, not the browser.
  if (component.component_id === 'usage-by-model-day') return <UsageByModelDayTable rows={rows} interactive />;
  // US-1 (OMN-21015 AC4): the same served rows as a stacked series, tokens in and out apart, split by model.
  // OMN-21166 Maple grid: the page shows the stacked chart; the per-day list is the detail under "More usage".
  if (component.component_id === 'usage-tokens-by-day') return <UsageTokensChart rows={rows} />;
  // US-3: metering-summary.v1's day rows, as served; the series renders no all row and sums nothing.
  if (component.component_id === 'usage-savings-series') {
    const groups = meteringDaysByBaseline(rows);
    // OMN-21166 AC66: savings by model, from the same all-time metering row as Overview's Savings card.
    const allTime = pickMeteringRow(rawRowsFor(component, snapshots, 0), 'all');
    const byModel = 'row' in allTime ? <SavingsByModel row={allTime.row} /> : null;
    // OMN-21166 Maple grid: savings by model is its own panel beside the day chart.
    if (slice?.key === 'by-model') return byModel ?? <p className="local-dashboard-empty" role="status">No savings by model served yet</p>;
    if (groups.length === 0) return <MeteringDaySeries rows={rows} />;
    return (
      <>{groups.map(([baseline, days]) => <div className="local-usage-savings" key={baseline}>
        {/* OMN-21015 U2: the same served day rows as bars; the chart plots the money columns this panel declares.
            Its one series takes the savings identity colour, the colour of Overview's Savings card. */}
        <SpendByDayChart title={component.title} rows={days} columns={columns} colourPlaces={[5]} />
        {/* OMN-21166 part 13: the day table repeats the chart, so it is one click away. */}
        <details className="local-more"><summary>Savings by day as a table</summary><MeteringDaySeries rows={days} /></details>
      </div>)}</>
    );
  }
  // OV: baseline against actual spend per UTC day, the declared columns of the served rows (OMN-21015 AC1).
  if (component.component_id === 'overview-spend-by-day') {
    const dayRows = rawRowsFor(component, snapshots, 0);
    const unavailable = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC)?.failure
      ? 'Daily metering data is not available yet.' : null;
    const hasDayRows = dayRows.some(row => typeof row === 'object' && row !== null && (row as Record<string, unknown>).window_kind === 'day');
    if (meteringView === 'kpis') return hasDayRows
      ? <MeteringActivityInsights rows={dayRows} now={Date.now()} window={activityWindow} unavailable={unavailable} display="kpis" />
      : null;
    const daily = <>
      {/* The chart and the table show the same served day rows; neither derives a total from missing values. */}
      <SpendByDayChart title={component.title} rows={dayRows} columns={columns} />
      <MeteringDayTable title={component.title} rows={dayRows} columns={columns} />
    </>;
    return meteringView === 'daily' ? daily : <>{hasDayRows && <MeteringActivityInsights rows={dayRows} now={Date.now()} window={activityWindow}
      unavailable={unavailable} display="kpis" />}{daily}</>;
  }
  if (component.component_id === 'api-keys-local-identity') {
    // OMN-21166 part 11: the tenant comes from the native runtime row of local-environment.v1, the same row the access
    // card reads, so the identity never depends on whether any savings were recorded.
    const environment = asRecords(rawRowsFor(component, snapshots, 0));
    return <LocalIdentity row={dashboardAccessRow(environment)} />;
  }
  // OMN-21015 AC10 (AK-2): the access card reads the native local-runtime row `onex dashboard` writes to
  // local-environment.v1 at each start (OMN-19988); another service's row or a compose row is never the dashboard's.
  if (component.component_id === 'api-keys-access') return <DashboardAccess rows={asRecords(rawRowsFor(component, snapshots, 0))} />;
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
      <ConceptIcon concept={slow ? 'load-slow' : 'load-error'} size={16} />
      <strong>{label}{slow ? ' is taking longer than expected.' : snapshot.lastGoodAt || savedMessage ? ' couldn’t refresh.' : ' is unavailable.'}</strong>
      <button type="button" disabled={retrying} aria-busy={retrying} onClick={() => { setRetrying(true); onRetry(); }}>{retrying ? 'Retrying…' : 'Try again'}</button>
    </div>
    <p>{savedMessage ?? (snapshot.lastGoodAt ? `Showing saved data from ${age(snapshot.lastGoodAt, now)}.` : 'You can retry now or wait for the next refresh.')}</p>
    <details><summary>Technical details</summary><p className="local-read-technical">{plainFailureMessage(snapshot.failure!, { topic: snapshot.topic })}{snapshot.lastGoodAt ? `; last good ${age(snapshot.lastGoodAt, now)}` : ''}</p></details>
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
        <p className="local-dashboard-empty" role="status" key={snapshot.topic}>{plainFailureMessage(snapshot.failure!, { topic: snapshot.topic })}</p>
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
  return snapshot?.failure ? plainFailureMessage(snapshot.failure, { topic: snapshot.topic }) : null;
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
export const PANEL_CONCEPTS: Readonly<Record<string, string>> = {
  'overview-environment': 'host', 'api-keys-environment': 'host',
  'overview-spend': 'cost', 'overview-savings': 'savings', 'overview-measured': 'calls',
  'overview-tokens': 'tokens', 'overview-last-run': 'last', 'overview-recent-runs': 'recent',
  'overview-insights': 'analysis', 'usage-insights': 'usage-analysis', 'runs-insights': 'analysis',
  'runs-tier-mix': 'tier-mix', 'overview-run-locally': 'local-run',
  'overview-avg-saving-per-call': 'saving-average', 'overview-baseline-spend': 'baseline',
  'overview-quality': 'quality', 'overview-model-usage': 'runs-model', 'overview-tier-mix': 'tier-mix', 'overview-compression': 'compression',
  'overview-cache-hit-rate': 'cache', 'overview-spend-by-day': 'spend-daily', 'recent-runs': 'recent',
  'workflow-run-path': 'path', 'usage-by-model-day': 'usage-day', 'usage-tokens-by-day': 'tokens-daily',
  'usage-savings-series': 'savings-daily', 'credentials-keys': 'credentials',
  'api-keys-local-identity': 'local-identity', 'api-keys-access': 'local-access', 'api-keys-cloud': 'cloud-keys',
};
/** Compatibility inventory, derived from the shared canonical identity rather than a second icon map. */
export const PANEL_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(PANEL_CONCEPTS).map(([panel, concept]) => [panel, FIELD_ICONS[concept]!]),
);

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
  // OMN-21166 AC77: Overview and Usage tell the top bar when their rows were last read from the runtime.
  const servedRead = pageName === 'overview' || pageName === 'usage' ? latestServedRead(snapshots) : null;
  useEffect(() => {
    if (pageName !== 'overview' && pageName !== 'usage') return undefined;
    publishLocalPageRead(pageName, servedRead);
    return () => publishLocalPageRead(null, null);
  }, [pageName, servedRead]);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // OV-3: which fixed window the Overview's metering cards read. Kept by the page so every card moves together.
  // OMN-21166 part 19 AC136: Overview's window starts from its address and is written back to it (replace, so the back
  // button and a shared link keep it without one history entry per click); a malformed value is all time, corrected.
  const windowSearch = useSearch();
  const [, navigateWindow] = useLocation();
  const initialWindow = pageName === 'overview' ? readOverviewWindow(windowSearch) : null;
  const [overviewWindow, setOverviewWindow] = useState<OverviewWindow>(initialWindow?.overview ?? 'all');
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>(initialWindow?.activity ?? { kind: 'all' });
  useEffect(() => {
    if (pageName !== 'overview') return;
    const next = writeOverviewWindow(windowSearch, activityWindow);
    if (next !== new URLSearchParams(windowSearch).toString()) navigateWindow(`/overview${next ? `?${next}` : ''}`, { replace: true });
  }, [pageName, activityWindow, windowSearch, navigateWindow]);
  const [runChartsSlot, setRunChartsSlot] = useState<HTMLElement | null>(null);
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
      if (isPerRunTopic(topic) && requestedRunId === null) return [];
      const key = `${topic}\0${isPerRunTopic(topic) ? requestedRunId ?? '' : ''}`;
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
          latest.current = latest.current.filter(candidate => !isPerRunTopic(candidate.topic) || candidate.runId === runId);
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
          const selected = loadLocalPageConfig(pageName, overviewHeadlineSource(census));
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
                ...(isPerRunTopic(topic) ? { runId: requestedRunId } : {}) });
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

  const renderComponent = (component: LocalPageDocument['components'][number], meteringView: 'all' | 'kpis' | 'daily' = 'all', slice?: PanelSlice) => {
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
    const metering = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
    const tokenSources = snapshots.filter(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC
      || snapshot.topic === component.data_bindings?.[0]?.projection_topic);
    const tokenFallback = component.component_id === 'usage-tokens-by-day' && rows.length === 0
      && metering && metering.rows.length > 0
      && !tokenSources.some(snapshot => snapshot.failure?.kind === 'tenant-not-configured')
      ? dailyMeteringTokens(metering.rows) : null;
    const panelConcept = PANEL_CONCEPTS[component.component_id];
    // OV-3: only the panels that read metering-summary.v1 have a row per window. Every other Overview panel
    // reads an exposure with no day rows, so with today chosen it still shows all time and has to say so:
    // seen on a store of two real days, "Agent calls 4" beside "6 of 6 runs local".
    const outsideWindow = pageName === 'overview' && overviewWindow !== 'all'
      && component.data_bindings?.[0]?.projection_topic !== METERING_SUMMARY_TOPIC
      && component.data_bindings?.[0]?.projection_topic !== LEGACY_OVERVIEW_TOPIC
      // OMN-21166: the trends follow the window themselves.
      && !['overview-insights', 'overview-environment', 'api-keys-environment'].includes(component.component_id);
    // GET /models has its own loading/error state; credential projection availability
    // must only gate the key-reference region, including its aria-busy state.
    const credentialProviders = component.component_id === 'credentials-keys';
    const environment = component.component_id === 'overview-environment' || component.component_id === 'api-keys-environment';
    const readContent = <>
        {pending ? <p className="local-dashboard-caption" role="status">Loading data…</p>
          : unbound && component.component_kind !== 'metric_card' ? <PendingState componentId={component.component_id} />
          : component.component_id === 'workflow-run-path' ? (
            <WorkflowRun component={component} snapshots={snapshots} requested={requestedRunId} onOpen={openRun} />
          ) : tokenFallback ? <DailyMeteringTokens data={tokenFallback} />
          : environment ? (notServed || bindingFailedEmpty(component, snapshots)
            ? <p className="local-dashboard-empty" role="status">Service health is not available yet.</p>
            : <EnvironmentPanel rows={rows as Record<string, unknown>[]}
                complete={!bindings.some(binding => snapshots.some(snapshot => snapshot.topic === binding.projection_topic && snapshot.failure))} />)
          : notServed ? <p className="local-dashboard-empty" role="status">{notServed}</p>
          : bindingFailedEmpty(component, snapshots) ? null
          : emptyState === 'NO_RUNS_YET' ? <NoRunsYet />
          : emptyState ? <p className="local-dashboard-empty" role="status">Baseline unresolved</p>
          : component.component_kind === 'table' ? (
            <TableComponent
              component={component}
              snapshots={snapshots}
              pageSize={pageSize}
              syncUrl={syncUrl}
              activityWindow={activityWindow}
              meteringView={meteringView}
              slice={slice}
              columns={((widget?.config as { columns?: DeclaredColumn[] } | undefined)?.columns) ?? []}
            />
          ) : component.component_id === 'overview-run-locally' ? (
            <RunLocallyCard row={asRecord(rows[0])} />
          ) : pageName === 'overview' && component.data_bindings?.[0]?.projection_topic === LEGACY_OVERVIEW_TOPIC ? (() => {
            const config = metricConfigFor(page, component.component_id);
            return config ? <OverviewAggregateCard component={component} config={config} rows={rows} window={overviewWindow} />
              : <p className="local-dashboard-empty">Not measured</p>;
          })() : component.data_bindings?.[0]?.projection_topic === METERING_SUMMARY_TOPIC ? (() => {
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
    </>;
    const cardLink = pageName === 'overview' && (component.component_id !== 'overview-quality' || slice?.key === 'card')
      ? CARD_LINKS[component.component_id] : undefined;
    return (
      <article
        className="local-dashboard-panel"
        data-width={String(MAPLE_WIDTHS[`${pageName}:${component.component_id}${slice ? `:${slice.key}` : ''}`] ?? (pageName === 'overview' && component.component_id === 'overview-spend-by-day' ? 12
          : pageName === 'overview' && ['overview-quality', 'overview-last-run'].includes(component.component_id) ? 6
          : pageName === 'overview' && ['overview-recent-runs', 'overview-tier-mix'].includes(component.component_id) ? 6 : widget?.width ?? 12))}
        data-component={component.component_id}
        data-slice={slice?.key}
        data-kind={component.component_kind}
        data-field-tone={component.component_kind === 'metric_card' ? fieldTone(component.title) : undefined}
        aria-busy={credentialProviders ? 'false' : pending}
        key={slice ? `${component.component_id}-${slice.key}` : component.component_id}
      >
        <h2 data-page-heading={pageName !== 'overview' || ['overview-quality', 'overview-insights', 'overview-spend-by-day', 'overview-last-run', 'overview-recent-runs', 'overview-model-usage', 'overview-tier-mix'].includes(component.component_id) ? '' : undefined} tabIndex={-1}>{slice ? <><ConceptIcon concept={slice.concept} label={slice.title} size={14} />{slice.title}</>
          : <>{panelConcept && <ConceptIcon concept={panelConcept} label={pageName === 'overview' && component.component_id === 'overview-insights' ? 'Activity trends' : component.title} size={14} />}{pageName === 'overview' && component.component_id === 'overview-insights' ? 'Activity trends' : component.title}</>}</h2>
        {/* Part 19 AC134: the whole card opens the page that explains it; the info button sits above the link. */}
        {cardLink && <Link href={cardLink.href} className="local-card-link" aria-label={`${slice?.title ?? component.title}: open ${cardLink.page}`} />}
        {/* A headline card keeps only its figure; its all-time note is in its hover (QualityCard). */}
        {outsideWindow && slice?.key !== 'card' && <p className="local-dashboard-caption">{OUTSIDE_WINDOW_NOTE}</p>}
        {/* Part 18 AC128: one table; the keys in use (as served, unrevoked) sit on their provider's row. */}
        {credentialProviders && <ModelKeys keys={asRecords(rows).filter(key => isMissing(key.revoked_at))} />}
        {credentialProviders ? <div aria-busy={pending}>{readContent}</div> : readContent}
      </article>
    );
  };
  const overviewGroups = {
    summary: ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'],
  };
  const renderGroup = (ids: string[], meteringView: 'all' | 'kpis' | 'daily' = 'all') => ids.map(id => {
    const component = page?.components.find(candidate => candidate.component_id === id);
    return component ? renderComponent(component, meteringView) : null;
  });
  return (
    <RunFilterProvider>
    <main data-destination={`local-${pageName}`} aria-label={`${page?.dashboard.name ?? 'Local dashboard'} page`} className={`local-dashboard-page local-dashboard-page--${pageName}`}>
      <header className="local-dashboard-header">
        <div className="local-dashboard-title">
          <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page={`local-${pageName}`} size={20} /></span>
          <div>
            <h1>{page?.dashboard.name ?? PAGE_TITLES[pageName]}</h1>
          </div>
        </div>
        {/* One toolbar row: the page's own control when it has one, and the runtime mode at the right. */}
        {pageName === 'overview' && !loading && !error && page && (
          // OMN-21166 mockup build: the window is a two-button switch (radio semantics), not a dropdown.
          // Live review 2026-10-25: one compact control; the name stays "Figures for" and each option keeps its full name
          // ("Today (UTC)") for screen readers, while the visible label is short with UTC as a muted suffix.
          <div className="local-dashboard-filters local-window-switch">
            {/* Live review 2026-10-25 ("unified"): one window for the cards and the charts. All, Today, the last 7, 15 or
                30 UTC days (the cards sum the served day rows, as AC42 does), or one day picked in the calendar. */}
            <span id={windowId} className="local-visually-hidden">Figures for</span>
            <div className="local-window-options" title="Figures and charts for: all time, today, the last 7/15/30 UTC days, or a picked day">
              <OverviewDayPicker value={overviewWindow} now={now}
                onChange={value => { setOverviewWindow(value); if (value.startsWith('day:')) setActivityWindow({ kind: 'custom', start: value.slice(4), end: value.slice(4) }); }}
                days={servedMeteringDays(snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC)?.rows ?? [])} />
              <div role="radiogroup" aria-labelledby={windowId} className="local-window-radios">
              {([['all', 'All', 'All time', 0], ['today', 'Today', 'Today (UTC)', 1], ['last-7', '7 days', 'Last 7 days (UTC)', 7],
                ['last-15', '15 days', 'Last 15 days (UTC)', 15], ['last-30', '30 days', 'Last 30 days (UTC)', 30]] as const).map(([value, label, name, days]) => {
                const target: OverviewWindow = days === 0 ? 'all' : days === 1 ? 'today' : meteringRangeFor(days, now);
                const checked = days === 0 ? overviewWindow === 'all' : days === 1 ? overviewWindow === 'today'
                  : overviewWindow.startsWith('range:') && activityWindow.kind === 'days' && activityWindow.days === days;
                return (
                  <button key={value} type="button" role="radio" data-window={value} aria-checked={checked} aria-label={name}
                    onClick={() => { setOverviewWindow(target); setActivityWindow(days === 0 ? { kind: 'all' } : { kind: 'days', days }); }}>
                    {label}
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        )}
        {/* OMN-21166: new runs and failures since this browser's last Overview visit, from the served runs. */}
        {pageName === 'overview' && !loading && !error && page && (() => {
          const recent = page.components.find(candidate => candidate.component_id === 'overview-recent-runs');
          const decisions = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
            return recent && decisions && !decisions.failure ? <SinceLastVisit decisions={rowsForLocalComponent(recent, snapshots)} now={now} onOpenFailures={() => navigate('/runs?status=failed')} /> : null;
        })()}
        {/* Live review 2026-10-25: no "Explore runs" button; the sidebar's Runs and Recent runs' "View all runs" lead there. */}
        {/* OMN-21166 AC63: the owning page's summary strip, part of its header, from the same served rows its panels
            read; a read that failed draws no strip (its panels say why). */}
        {!loading && !error && page && pageName === 'runs' && (() => {
          const read = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
          return read && !read.failure ? <RunsKpis rows={read.rows} now={now} /> : null;
        })()}
        {!loading && !error && page && pageName === 'usage' && (() => {
          const read = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
          return read && !read.failure ? <UsageKpis rows={read.rows} /> : null;
        })()}
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
            <InsightsWindowContext.Provider value={{ window: activityWindow, setWindow: setActivityWindow }}>
            {/* OMN-21166 Maple grid: the KPI strip, then rows of a chart (8 of 12 columns) beside its ranking (4), then
                the recent runs beside quality. The last run is the first recent run, so it sits under "Additional". */}
            <div className="local-overview-surface">
              <section className="local-overview-summary" aria-label="Runtime summary" style={{ '--kpi-count': 5 } as CSSProperties}>
                {renderGroup(overviewGroups.summary)}
                {(() => {
                  const quality = page.components.find(candidate => candidate.component_id === 'overview-quality');
                  return quality ? renderComponent(quality, 'all', { key: 'card', title: 'Delegation Quality', concept: 'quality' }) : null;
                })()}
              </section>
            </div>
            <div className="maple-grid">
              {/* Live review 2026-10-25: no newest-run line and no environment on Overview (requirement Q2 waived by
                  Lakshman; Environment moved to API Keys); Delegation Quality is the fifth card above. */}
              {(() => {
                const insights = page.components.find(candidate => candidate.component_id === 'overview-insights');
                if (!insights) return null;
                const slice = (key: string, title: string, concept: string) => renderComponent(insights, 'all', { key, title, concept });
                // Live review 2026-10-25: "Why runs failed" left Overview (its causes stay on Runs under More analysis);
                // Runs per day sits beside Tier mix and Tokens per day takes the row.
                return <>
                  {/* Live review 2026-10-25: every bar chart takes the full row. */}
                  {/* Live review 2026-10-25: Model usage, then Tier mix last. */}
                  {/* OMN-21166 part 21 AC139: the four charts in two columns (one under 1100px). */}
                  <div className="maple-cell maple-cell--half">{slice('runs', 'Runs per day', 'runs-daily')}</div>
                  <div className="maple-cell maple-cell--half">{slice('tokens', 'Tokens per day', 'tokens-daily')}</div>
                  <div className="maple-cell maple-cell--half">{renderGroup(['overview-model-usage'])}</div>
                  <div className="maple-cell maple-cell--half">{renderGroup(['overview-tier-mix'])}</div>
                </>;
              })()}
            </div>
            {/* Live review 2026-10-25 ("not needed in overview"): the Environment panel and "Additional runtime metrics"
                (last run, run locally, saving per call, baseline spend, compression, cache hit rate, spend per day) are
                not drawn on Overview; spend per day and baseline cost are on Usage, the last run is Recent runs' first row. */}
            </InsightsWindowContext.Provider>
            </OverviewRunsContext.Provider>
          </> : pageName === 'usage' ? (() => {
            // OMN-21166 Maple grid: each day chart beside its ranking by model; the rest under one "More usage".
            const find = (id: string) => page.components.find(candidate => candidate.component_id === id);
            const savings = find('usage-savings-series');
            const tokens = find('usage-tokens-by-day');
            const insights = find('usage-insights');
            const byDay = find('usage-by-model-day');
            return <>
              <div className="maple-grid">
                {/* Live review 2026-10-25: the model charts sit side by side as vertical dotted bars between the day charts. */}
                {savings && <div className="maple-cell maple-cell--full">{renderComponent(savings)}</div>}
                {savings && <div className="maple-cell maple-cell--full">{renderComponent(savings, 'all', { key: 'by-model', title: 'Savings by model', concept: 'savings' })}</div>}
                {insights && <div className="maple-cell maple-cell--full">{renderComponent(insights, 'all', { key: 'spend', title: 'Spend by model', concept: 'spend-model' })}</div>}
                {tokens && <div className="maple-cell maple-cell--full">{renderComponent(tokens)}</div>}
              </div>
              <details className="local-overview-secondary local-more local-more--page">
                <summary>More usage</summary>
                <div className="maple-grid">
                  {/* Part 17: each chart its own panel; the day-by-day token list is gone (the table below holds its rows). */}
                  {insights && <div className="maple-cell maple-cell--full">{renderComponent(insights, 'all', { key: 'cost-per-run', title: 'Cost per run', concept: 'cost-per-run' })}</div>}
                  {insights && <div className="maple-cell maple-cell--full">{renderComponent(insights, 'all', { key: 'tokens-by-model', title: 'Tokens by model', concept: 'tokens-model' })}</div>}
                  {insights && <div className="maple-cell maple-cell--full">{renderComponent(insights, 'all', { key: 'cost-by-route', title: 'Cost by route', concept: 'cost-route' })}</div>}
                  {byDay && <div className="maple-cell maple-cell--full">{renderComponent(byDay)}</div>}
                </div>
              </details>
            </>;
          })() : pageName === 'runs' ? (
            <InsightsWindowContext.Provider value={{ window: activityWindow, setWindow: setActivityWindow }}>
            <RunChartsSlot.Provider value={runChartsSlot}>
              {/* OMN-21166 part 13: the run list in view; run charts, routing and analysis in one "More analysis" (part 18
                  AC118); Run locally is Overview's, so Runs does not repeat it. */}
              {page.components.filter(component => !RUNS_SECONDARY.has(component.component_id) && component.component_id !== 'overview-run-locally')
                .map(component => renderComponent(component))}
              <details className="local-overview-secondary local-more local-more--page">
                <summary>More analysis</summary>
                <div className="local-run-charts-slot" ref={setRunChartsSlot} />
                {page.components.filter(component => RUNS_SECONDARY.has(component.component_id)).map(component => renderComponent(component))}
              </details>
            </RunChartsSlot.Provider>
            </InsightsWindowContext.Provider>
          ) : page.components.map(component => renderComponent(component))}
        </section>
      )}
    </main>
    </RunFilterProvider>
  );
}
