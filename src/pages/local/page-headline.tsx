// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. Headline cards: the metric card, the Overview window and range, metering totals and the KPI rows.
import { formatDashboardCount, formatFullCount, wholeCount } from '@/theme/format';
import { exactMs, formatDuration } from '@/theme/format';
import { TokenDirections } from '@/components/dashboard/usage/TokenDirections';
import { exactTokens } from '@/components/dashboard/usage/TokenCount';
import { createContext, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, ChevronRight } from '@/theme/design-system/icons';
import { formatDashboardUsd as formatUsd } from '@/theme/format';
import { DEFAULT_RUNS_VIEW, writeRunsSearch } from '@/navigation/runs-url-state';
import { type ActivityWindow } from '@/pages/local/insight-charts';
import { EmptyState, Fact, FactList, Figure, Tooltip } from '@/theme/design-system/components';
import { notAvailableYet } from '@/pages/local/plain-text';
import { dailySeries, summary as runSummary, toInsightRuns } from '@/pages/local/insights';
import { Meter, RankedBars } from '@/theme/design-system/charts';
import { NO_RUNS_USD, sumDashboardUsd } from '@/lib/dashboard-money-total';
import { KpiStrip, type KpiItem } from '@/components/dashboard/KpiStrip';
import { CardBasis } from '@/components/dashboard/CardBasis';
import { CaptionLine } from '@/components/dashboard/CaptionLine';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { CountUpText } from '@/components/dashboard/CountUpText';
import { type BoundProjectionSnapshot, type LocalPageDocument } from '@/layout/local-page-loader';
import { TierLegend, useModelColor, useModelIdentityStyle } from '@/components/dashboard/model-tiers';
import { fixed as fmtFixed, localeDate as fmtLocaleDate, localeString as fmtLocaleString } from '@/theme/format';
import { type Row, asRecord, asRecords, countOf, isMissing, recordedCount, servedBoolean, timeOf, utcDay } from '@/pages/local/page-shared';
import { NoRunsYet } from '@/pages/local/page-runs';
// OMN-23330 AC25: this file's fixed inline styles are classes in page-headline.static.css.
import './page-headline.static.css';

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
  const grouped = fmtLocaleString(Number(value), 'en-US', {
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
  if (componentId === 'api-keys-cloud') return <EmptyState>{CLOUD_NOT_LINKED}</EmptyState>;
  return (
    <EmptyState>
      {notAvailableYet(PENDING_SOURCES[componentId]?.waitsOn)}
    </EmptyState>
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
      ? 'Pricing manifest not recorded' : `pricing manifest ${pricingLabel(fields.pricing_manifest_version)}`);
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
export function MetricCard({ component, config, row, caption, figureLine, figureLineFields = [], basisExtra, figureDetail = [] }: MetricCardProps & { figureDetail?: readonly string[] }) {
  if ((component.data_bindings ?? []).length === 0) {
    return <EmptyState>{notAvailableYet(PENDING_SOURCES[component.component_id]?.waitsOn)}</EmptyState>;
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
      {/* OMN-23330 AC34: a measured headline figure shows its exact value (and the previous window's) on hover and focus. */}
      <FigureDetail lines={figure ? figureDetail : []}>
      <Figure measured={figure} title={figure && config.format === 'number' ? String(row[config.metric_key]) : undefined}
        style={{ '--figure-chars': String(text).length } as CSSProperties}>{figure && typeof text === 'string' ? <CountUpText text={text} /> : text}</Figure>
      </FigureDetail>
      {/* OMN-21166 part 12 AC73, as superseded by part 29 AC191: an Overview headline card shows its figure with its basis
          as a caption under it (first line drawn, every line kept in the page). Every other card keeps its lines in view. */}
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
export const MAPLE_WIDTHS: Readonly<Record<string, number>> = {
  'overview:overview-insights:runs': 12, 'overview:overview-model-usage': 12, 'overview:overview-tier-mix': 12,
  'overview:overview-insights:tokens': 12,
  'overview:overview-quality:card': 3, 'overview:overview-recent-runs': 8, 'overview:overview-last-run': 12,
  'usage:usage-savings-series': 12, 'usage:usage-savings-series:by-model': 12,
  'usage:usage-insights:spend': 12, 'usage:usage-tokens-by-day': 12,
  'usage:usage-insights:analysis': 12, 'usage:usage-insights:cost-per-run': 12, 'usage:usage-insights:tokens-by-model': 12, 'usage:usage-insights:cost-by-route': 12,
  'usage:usage-by-model-day': 12,
};

/**
 * OMN-21166 part 18 AC118: Runs has one "More analysis". The per-run charts belong to the run list (its runs and its
 * click-to-open), so the list draws them into this slot inside the page's "More analysis" instead of a second disclosure.
 */
export const RunChartsSlot = createContext<HTMLElement | null | undefined>(undefined);
/** Part 30 AC206: the Routing tab of Runs' "More analysis"; the run list draws its routing groups into it. */
export const RunRoutingSlot = createContext<HTMLElement | null | undefined>(undefined);

/** Runs' secondary panels, shown under its "More analysis" (part 13 AC74). */
export const RUNS_SECONDARY: ReadonlySet<string> = new Set(['runs-tier-mix', 'runs-insights']);

/** The four Overview headline cards whose basis lines sit in a tooltip (part 12 AC73). */
const OVERVIEW_HEADLINE_CARDS: ReadonlySet<string> = new Set(['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens']);


/** Overview's "Delegation Quality" card: the served overall pass rate; its hover names the served passed and checked runs. */
/**
 * OMN-21166 part 19 AC133: Delegation Quality's change, from the returned decision rows: the pass rate over runs with a
 * verdict in the last N UTC days against the N days before, in percentage points. Rows that do not reach back over the
 * whole previous window, or a previous window with no verdict, read "No earlier data" (written by claude-920f62a6 after
 * onex delegate run a450aca8 failed).
 */
export function qualityChangeLine(decisions: readonly unknown[], window: ActivityWindow, now: number = Date.now()): string | null {
  if (window.kind !== 'days' || ![7, 15, 30, 90].includes(window.days)) return null;
  const DAY = 86_400_000;
  const today = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const currentStart = utcDay(today - (window.days - 1) * DAY);
  const previousStart = utcDay(today - (2 * window.days - 1) * DAY);
  const dated = asRecords(decisions).map(row => ({ row, day: utcDay(timeOf(row.created_at ?? row.written_at)) }))
    .filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.day));
  if (!dated.some(entry => entry.day <= previousStart)) return 'No earlier data';
  const rate = (from: string, to: string) => {
    // Found 2026-11-02: the local store serves the verdict as 1 or 0, the Postgres path as true or false; both count,
    // and a run with no verdict (null) is left out.
    const verdicts = dated.filter(entry => entry.day >= from && entry.day <= to && servedBoolean(entry.row.quality_gate_passed) !== null);
    return verdicts.length === 0 ? null : verdicts.filter(entry => servedBoolean(entry.row.quality_gate_passed) === true).length / verdicts.length;
  };
  const current = rate(currentStart, utcDay(now));
  if (current === null) return null;
  const previous = rate(previousStart, utcDay(Date.parse(`${currentStart}T00:00:00Z`) - DAY));
  if (previous === null) return 'No earlier data';
  const points = (current - previous) * 100;
  const span = `vs previous ${window.days} days`;
  if (fmtFixed(Math.abs(points), 1) === '0.0') return `Last ${window.days} days: no change ${span}`;
  return `Last ${window.days} days: ${points > 0 ? '+' : '\u2212'}${fmtFixed(Math.abs(points), 1)} pts ${span}`;
}

export function QualityCard({ row, change = null }: { row: Row | null; change?: string | null }) {
  if (!row || isMissing(row.overall_pass_rate) || !Number.isFinite(Number(row.overall_pass_rate))) {
    return <Figure measured={false}>Not measured</Figure>;
  }
  const count = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? 'Not recorded' : formatFullCount(String(value)));
  return <>
    {/* OMN-23330 AC34: the figure is all time (no previous window), so its detail is the exact rate only. */}
    <FigureDetail lines={[`Exact: ${fmtFixed(Number(row.overall_pass_rate) * 100, 2)}%`]}>
      <Figure measured><CountUpText text={`${fmtFixed((Number(row.overall_pass_rate) * 100), 1)}%`} /></Figure>
    </FigureDetail>
    {change && <ChangeLine text={change} meaning={changeMeaning('overview-quality')} />}
    <HeadlineHover label="Delegation Quality" lines={[`${count(row.total_passed)} of ${count(row.total_checks)} runs passed the quality gate`,
      `${count(row.total_failed)} failed · deterministic checks`, 'All time: the window above does not change this figure']} />
  </>;
}

/**
 * OMN-21166 part 29 AC192: AC133's change line in neutral secondary text, with an up or down arrow when the figure rose
 * or fell. The arrow is decoration (the words already say +/−); 'New this period', 'No change' and 'No earlier data'
 * carry none.
 */
/** A model name in a drawn caption, kept on one line: its hyphens become non-breaking (the full lines keep plain text). */
export function unbroken(name: string): string {
  return name.replace(/-/g, '\u2011');
}

/**
 * OMN-23330 AC33 (operator, chat 2026-11-11, from a benchmark of 20 open-source dashboards): what a card's change means.
 * Savings and Delegation Quality: up is good. Actual spend: up is a warning. Agent calls and Tokens processed are volume,
 * neither good nor bad, so their change stays neutral.
 */
export type ChangeMeaning = 'up-good' | 'up-bad' | 'neutral';
// Keyed by the card (the page's own component ids), so no field is read by name here (OMN-19980 R4).
export function changeMeaning(componentId: string): ChangeMeaning {
  if (componentId === SPEND_CARD) return 'up-bad';
  if (componentId === 'overview-savings' || componentId === 'overview-quality') return 'up-good';
  return 'neutral';
}

export function ChangeLine({ text, meaning = 'neutral' }: { text: string; meaning?: ChangeMeaning }) {
  const sign = /(?:^|\s)([+\u2212])\d/.exec(text)?.[1];
  // AC33: only a signed figure has a direction to colour; "No change", "No earlier data" and "New this period" stay neutral.
  const tone = sign && meaning !== 'neutral' ? ((sign === '+') === (meaning === 'up-good') ? 'good' : 'warn') : undefined;
  return <p className="local-card-change" data-tone={tone}>
    {sign && <span className="local-card-change-arrow" aria-hidden="true">{sign === '+' ? '\u2191' : '\u2193'}</span>}
    <span className="local-card-change-text">{text}</span>
  </p>;
}

/** An Overview headline card's basis lines, drawn as its caption under the figure (part 29 AC191; was a hover). */
function HeadlineHover({ label, lines }: { label: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  // OMN-23330 AC27: each figure and name in the caption wears its concept's colour.
  return <CardBasis label={label}>{lines.map((line, index) => <CaptionLine key={index} line={line} />)}</CardBasis>;
}

// OMN-20009: waits on local_call_share in delegation.model-routing.v1.
const ROUTING_SHARE_PENDING = notAvailableYet('share of runs kept local');

/**
 * OMN-20009: the share of ALL runs whose tier is local, as the model-routing view serves it (local_call_share, over
 * every run, not-tier-routed ones included). The browser formats the served fraction as a percent and divides
 * nothing; the served counts are shown beside it so the not-tier-routed gap stays visible.
 */
export function RunLocallyCard({ row }: { row: Record<string, unknown> | null }) {
  if (row === null) return <NoRunsYet />;
  const byTier = asRecord(row.by_tier);
  if (byTier === null || !('local_call_share' in byTier)) {
    return <EmptyState>{ROUTING_SHARE_PENDING}</EmptyState>;
  }
  const share = byTier.local_call_share;
  if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) return <Figure measured={false}>Not measured</Figure>;
  const text = fmtLocaleString(share, 'en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div className="local-routing-summary">
      <div className="local-routing-share">
        <Figure>{text}</Figure>
        <p className="local-dashboard-caption">of all runs executed locally</p>
        <Meter kind="routing-share" label="Local share of all runs" min={0} max={100} now={share * 100} valueText={text} share={share} />
      </div>
      <FactList look="routing-counts">
        <Fact term={<><ConceptIcon concept="local-run" size={15} />Local runs</>} data-routing-count="local">{recordedCount(byTier.local_call_count)}</Fact>
        <Fact term={<><FieldIcon label="All runs" size={15} />All runs</>} data-routing-count="total">{recordedCount(byTier.total_call_count)}</Fact>
        <Fact term={<><FieldIcon label="Without a tier" size={15} />Without a tier</>} data-routing-count="untiered" data-field-tone="unrouted">{recordedCount(byTier.not_tier_routed_count)}</Fact>
      </FactList>
      <p className="local-routing-note">Runs without a routing tier are included in the total. They are not classified as local or cloud here.</p>
    </div>
  );
}

/** The Tokens card's widget key: two served columns shown side by side, never summed (SV-3: no combined total). */
export const TOKENS_IN_AND_OUT = 'tokens_in_and_out';
/**
 * The Overview's spend and savings cards, by component, under both headline sources (OMN-21304 AC4). Named by card,
 * not by field, so no savings field is read by name here (OMN-19980 R4).
 */
const SPEND_CARD = 'overview-spend';
const SPEND_AND_SAVINGS_CARDS: ReadonlySet<string> = new Set([SPEND_CARD, 'overview-savings']);

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
export const CARD_LINKS: Readonly<Record<string, { href: string; page: string }>> = {
  'overview-spend': { href: '/usage', page: 'Usage' },
  'overview-savings': { href: '/usage', page: 'Usage' },
  'overview-tokens': { href: '/usage', page: 'Usage' },
  'overview-measured': { href: '/runs', page: 'Runs' },
  'overview-quality': { href: '/delegation-evidence', page: 'Delegation Evidence' },
};

// OMN-21970 (Lakshman 2026-11-02, "add 90 days also"): 90 joins the windows.
const WINDOW_DAYS: Readonly<Record<string, number>> = { today: 1, '7d': 7, '15d': 15, '30d': 30, '90d': 90 };

/** OMN-21166 part 19 AC136 (onex delegate run abfb8d86, UTC-safe): the Overview window from its address. `?window=today`,
 * `7d`, `15d`, `30d` or `90d`, or `?day=YYYY-MM-DD`; anything else is all time and marked malformed so the address is corrected. */
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
/** A window whose summed days carry more than one pricing manifest version (AC200): its basis is mixed, never one version. */
export const MIXED_PRICING = 'mixed basis';
/** A served pricing manifest version as words: 'v1.0.0', or 'mixed basis (several versions)' for a mixed window. */
export function pricingLabel(version: unknown): string {
  return version === MIXED_PRICING ? 'mixed basis (several versions)' : `v${String(version)}`;
}

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
  // Part 29 AC200 (Codex MSGs a9bd908d, b53ca31a): the window's price basis is the versions of the days actually summed.
  // One version on every day is named; several, or a version beside an unversioned day, read as a mixed basis; summed
  // days that record no version at all are not recorded (Codex MSG 7b7cfb30: the all-time row cannot vouch for them); a
  // window with no day rows keeps the all-time row's basis.
  const versions = new Set(days.map(d => d.pricing_manifest_version).filter(v => !isMissing(v)).map(String));
  const unversioned = days.some(d => isMissing(d.pricing_manifest_version));
  const pricing = days.length === 0 ? allRow.pricing_manifest_version
    : versions.size > 1 || (versions.size === 1 && unversioned) ? MIXED_PRICING
      : versions.size === 1 ? [...versions][0] : null;
  const row: Record<string, unknown> = {
    window_kind: start === end ? 'day' : 'range', window_start: start, window_end: end, as_of: allRow.as_of,
    baseline_model: allRow.baseline_model, pricing_manifest_version: pricing, baseline_state: allRow.baseline_state,
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
/**
 * OMN-23330 AC34: the values a headline card's change compares: the card's own value, the previous window's (null when the
 * served day rows do not reach back over it) and the window's length in days (null for All time and Today, which have no
 * previous window of the same length).
 */
export function periodValues(rows: readonly unknown[], window: string, metricKey: string, current: Record<string, unknown>):
  { now: number | null; before: number | null; days: number | null } {
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
  const match = /^range:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(window);
  if (!match) return { now, before: null, days: null };
  const DAY = 86_400_000;
  const start = Date.parse(`${match[1]!}T00:00:00Z`);
  const end = Date.parse(`${match[2]!}T00:00:00Z`);
  const days = Math.round((end - start) / DAY) + 1;
  if (!Number.isFinite(days) || days < 1) return { now, before: null, days: null };
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const previousStart = iso(start - days * DAY);
  const previousEnd = iso(start - DAY);
  const reachesBack = asRecords(rows).some(row => row.window_kind === 'day' && typeof row.window_start === 'string'
    && row.window_start.slice(0, 10) <= previousStart);
  if (!reachesBack) return { now, before: null, days };
  const previousRow = meteringRangeRow(rows, previousStart, previousEnd);
  return { now, before: 'row' in previousRow ? valueOf(previousRow.row) : null, days };
}

export function periodChangeLine(rows: readonly unknown[], window: string, metricKey: string, current: Record<string, unknown>): string | null {
  const { now, before, days } = periodValues(rows, window, metricKey, current);
  if (days === null || now === null) return null;
  if (before === null) return 'No earlier data';
  const span = `vs previous ${days} days`;
  if (before === 0) return now > 0 ? 'New this period' : `No change ${span}`;
  const pct = ((now - before) / Math.abs(before)) * 100;
  const size = Math.abs(pct) < 10 ? fmtFixed(Math.abs(pct), 1) : String(Math.round(Math.abs(pct)));
  if (Number(size) === 0) return `No change ${span}`;
  return `${pct > 0 ? '+' : '\u2212'}${size}% ${span}`;
}

/** OMN-23330 AC34: a headline figure's exact value and, when a previous window exists, its value and the signed change. */
export function figureDetailLines(kind: 'money' | 'count', now: number, before: number | null, days: number | null): string[] {
  const money = kind === 'money';
  const exact = (value: number) => {
    const sign = value < 0 ? '−' : '';
    return money ? `${sign}$${fmtFixed(Math.abs(value), 4)}` : `${sign}${formatFullCount(String(Math.round(Math.abs(value))))}`;
  };
  const lines = [`Exact: ${exact(now)}`];
  if (before === null || days === null) return lines;
  const change = now - before;
  const signed = change === 0 ? exact(0) : `${change > 0 ? '+' : '−'}${exact(Math.abs(change))}`;
  return [...lines, `Previous ${days} days: ${exact(before)}`, `Change: ${signed}`];
}

/** OMN-23330 AC34: a figure that shows its detail lines in the kit tooltip on hover and on keyboard focus. */
export function FigureDetail({ lines, children }: { lines: readonly string[]; children: ReactNode }) {
  if (lines.length === 0) return <>{children}</>;
  return <Tooltip text={<>{lines.map(line => <span key={line} className="local-figure-detail-line">{line}</span>)}</>}>
    <span className="local-figure-detail" tabIndex={0}>{children}</span>
  </Tooltip>;
}

/** Said on an Overview panel whose exposure serves no row per window, while today is the chosen window. */
export const OUTSIDE_WINDOW_NOTE = 'All time: this panel does not follow the window above.';

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

const shortDay = (date: string) => fmtLocaleDate(new Date(`${date}T00:00:00Z`), 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

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
  const title = fmtLocaleDate(first, 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
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
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)}><ChevronRight className="page-headline-sb3bf48" size={16} aria-hidden="true" /></button>
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
  const basis = `Baseline ${isMissing(row.baseline_model) ? 'Not recorded' : String(row.baseline_model)} · pricing ${isMissing(row.pricing_manifest_version) ? 'Not recorded' : pricingLabel(row.pricing_manifest_version)}`;
  const noRuns = Number(row.days_without_runs);
  if (Number.isFinite(noRuns) && noRuns > 0 && row.window_kind === 'day') {
    const named = window === 'today' ? 'No runs today (UTC)' : `No runs on ${window.slice(4)} (UTC)`;
    return componentId === 'overview-spend' || componentId === 'overview-savings'
      ? [named, `Baseline ${isMissing(row.baseline_model) ? 'Not recorded' : String(row.baseline_model)} · pricing ${isMissing(row.pricing_manifest_version) ? 'Not recorded' : pricingLabel(row.pricing_manifest_version)}`]
      : [named];
  }
  const when = window === 'all' ? 'all time' : window === 'today' ? 'today (UTC)'
    : window.startsWith('range:') ? `${window.slice(6).replaceAll('..', ' to ')} (UTC)` : `on ${window.slice(4)} (UTC)`;
  const lines: Array<string | null> = componentId === 'overview-spend' ? [window === 'all' ? 'What you paid, all time' : `What you paid ${when}`, excluded, basis]
    // Part 29 AC191: the first line is the short drawn caption; the full sentence stays in the page for screen readers.
    : componentId === 'overview-savings' ? [`Modelled vs ${isMissing(row.baseline_model) ? 'the cloud baseline' : unbroken(String(row.baseline_model))}`, `Modelled at ${isMissing(row.baseline_model) ? 'the cloud baseline' : String(row.baseline_model)} prices. The baseline never ran.`, pctLine, excluded, basis]
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
  if ('message' in picked) return <Figure measured={false}>{picked.message}</Figure>;
  const row = picked.row;
  if (config.metric_key === TOKENS_IN_AND_OUT) {
    // A day (or window) with no runs at all processed no tokens: that is a measured 0 (Lakshman 2026-10-25), unlike a
    // served row whose every run lacks token counts, which meteringTokens reads as not measured.
    const noRunsAtAll = Number(row.runs_total) === 0 && Number(row.days_without_runs) > 0;
    // The window's summed counts are the zeros of its run-less days; they are read, not typed.
    const total = noRunsAtAll ? Number(row.tokens_in) + Number(row.tokens_out) : meteringTokens(row).total;
    // Live review 2026-10-25: the card shows its figure; its hover says tokens in and out in one line.
    const tokenChange = OVERVIEW_HEADLINE_CARDS.has(component.component_id) ? periodChangeLine(rows, window, TOKENS_IN_AND_OUT, row) : null;
    // Sized to its card by its length, as every headline figure is (it was the one left at 32px, clipped in a narrow card).
    // OMN-23330 AC34: the exact total, and the previous window's, on hover and focus.
    const tokenValues = periodValues(rows, window, TOKENS_IN_AND_OUT, row);
    const tokenDetail = total === null || !Number.isFinite(Number(total)) ? []
      : figureDetailLines('count', Number(total), tokenValues.before, tokenValues.days);
    return <><FigureDetail lines={tokenDetail}><Figure measured={total !== null} style={{ '--figure-chars': formatDashboardCount(total).length } as CSSProperties}>
      {total !== null ? <CountUpText text={formatDashboardCount(total)} /> : formatDashboardCount(total)}</Figure></FigureDetail>
      {tokenChange && <ChangeLine text={tokenChange} />}
      {/* Lakshman 2026-11-07 ("token in and out should be different color and uniform in whole websites"): on every
          source the card's directions are the arrow rows in their two colours, not a plain "<in> in · <out> out"
          line; any further line (days with no runs) stays a caption. */}
      <CardBasis label={component.title}>
        <TokenDirections input={row.tokens_in} output={row.tokens_out} />
        {headlineHoverLines(component.component_id, row, null, window).slice(1).map((line, index) => <CaptionLine key={index} line={line} />)}
      </CardBasis></>;
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
      <MetricCard component={figureComponent} config={config} row={row} caption={null} figureDetail={(() => {
        const values = periodValues(rows, window, config.metric_key, row);
        return values.now === null ? [] : figureDetailLines(config.format === 'currency' ? 'money' : 'count', values.now, values.before, values.days);
      })()} />
      {/* Part 19 AC133: the change against the previous window of the same length, only on a 7, 15 or 30 day window. */}
      {(() => { const change = periodChangeLine(rows, window, config.metric_key, row); return change && <ChangeLine text={change} meaning={changeMeaning(component.component_id)} />; })()}
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
export function RunsKpis({ rows, now, complete = false }: { rows: readonly unknown[]; now: number; complete?: boolean }) {
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
    { label: 'Runs', value: formatDashboardCount(totals.runs), accent: 'var(--ds-field-calls)', concept: 'calls',
      // OMN-21970 AC3: a read that walked every page holds every served run, so the caption does not call them the latest.
      lines: [complete ? `All ${formatDashboardCount(totals.runs)} served runs` : `Latest ${formatDashboardCount(totals.runs)} returned runs`],
      trend: { days: dayKeys, values: days.map(day => (day.runs > 0 ? day.runs : null)), format: value => formatDashboardCount(value) } },
    { label: 'Pass rate', value: totals.passRate === null ? 'Not recorded' : `${fmtFixed(totals.passRate, 1)}%`, unavailable: totals.passRate === null,
      accent: 'var(--ds-field-pass)', concept: 'pass',
      lines: [`${formatDashboardCount(totals.passed + totals.failed)} of ${formatDashboardCount(totals.runs)} runs have a verdict`],
      trend: { days: dayKeys, values: days.map(day => day.passRate), format: value => `${fmtFixed(value, 1)}%` } },
    { label: 'Median duration', value: totals.medianLatency === null ? 'Not recorded' : formatDuration(totals.medianLatency), unavailable: totals.medianLatency === null,
      title: totals.medianLatency === null ? undefined : exactMs(totals.medianLatency), accent: 'var(--ds-field-duration)', concept: 'duration',
      lines: [totals.medianLatency === null ? null : `Exactly ${exactMs(totals.medianLatency)}`, `${formatDashboardCount(runs.length - latencies.length)} without a duration`] },
    { label: 'p95 duration', value: p95 === null ? 'Not recorded' : formatDuration(p95), unavailable: p95 === null, title: p95 === null ? undefined : exactMs(p95),
      accent: 'var(--ds-field-duration-p95)', concept: 'duration-p95', lines: [p95 === null ? null : `Exactly ${exactMs(p95)}`, `Over ${formatDashboardCount(latencies.length)} recorded durations`] },
    { label: 'Failed', value: formatDashboardCount(totals.failed), accent: 'var(--ds-field-fail)', concept: 'fail',
      lines: [totals.unrecorded > 0 ? `${formatDashboardCount(totals.unrecorded)} without a verdict` : 'Of the returned runs'] },
    { label: 'Escalated', value: escalationServed.length === 0 ? 'Not recorded' : formatDashboardCount(escalated), unavailable: escalationServed.length === 0,
      accent: 'var(--ds-field-escalated)', concept: 'escalated',
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
  const count = (value: number) => formatDashboardCount(String(value));
  const tokenTrend = (field: string) => ({ days: dayKeys, values: series(field), format: count, scope });
  const directionItems = (input: bigint | null, output: bigint | null): KpiItem[] => [
    { label: 'Tokens in', value: input === null ? 'Not measured' : formatDashboardCount(input.toString()), unavailable: input === null,
      title: input === null ? undefined : exactTokens(input.toString(), 'in'),
      accent: 'var(--ds-field-tokens-in)', concept: 'tokens-in', trend: tokenTrend('tokens_in') },
    { label: 'Tokens out', value: output === null ? 'Not measured' : formatDashboardCount(output.toString()), unavailable: output === null,
      title: output === null ? undefined : exactTokens(output.toString(), 'out'),
      accent: 'var(--ds-field-tokens-out)', concept: 'tokens-out', trend: tokenTrend('tokens_out') },
  ];
  const items: KpiItem[] = [
    { label: 'You paid', value: money(row.spend_usd), unavailable: isMissing(row.spend_usd), accent: 'var(--ds-field-cost)', concept: 'cost',
      lines: ['Measured spend, all time'], trend: { days: dayKeys, values: series('spend_usd'), format: usd, scope } },
    { label: 'Baseline cost', value: unresolved ? 'Baseline unresolved' : money(row.counterfactual_usd), unavailable: unresolved || isMissing(row.counterfactual_usd),
      accent: 'var(--ds-field-baseline)', concept: 'baseline', lines: [`At ${unbroken(baseline)} list price, modelled`, `Same tokens at ${baseline} list price (modelled)`],
      trend: unresolved ? null : { days: dayKeys, values: series('counterfactual_usd'), format: usd, scope } },
    { label: 'Saved', value: unresolved ? 'Baseline unresolved' : money(row.savings_usd), unavailable: unresolved || isMissing(row.savings_usd),
      accent: 'var(--ds-field-savings)', concept: 'savings', lines: ['Modelled · vs cloud baseline'],
      trend: unresolved ? null : { days: dayKeys, values: series('savings_usd'), format: usd, scope } },
    ...directionItems(tokens.input, tokens.output),
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
  const modelColor = useModelColor();
  const modelIdentityStyle = useModelIdentityStyle();
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
          // Part 29 AC193: a named model opens Runs filtered to it, as Overview's model bars do (AC135).
          const href = isMissing(model.model) ? undefined : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, model: name })}`;
          return { key: `${name}-${index}`, name, model: isMissing(model.model) ? undefined : name, value: n, basis: 'estimated' as const, color: modelColor(name), href,
            opensLabel: href ? `Opens Runs filtered to ${name}` : undefined,
            display: n === null ? 'Not measured' : formatUsd(model.savings_usd), title: `${recordedCount(model.runs_measured)} of ${recordedCount(model.runs)} runs measured` };
        })} />
      <TierLegend label="Savings by model tier colours" models={models.map(model => (isMissing(model.model) ? '' : String(model.model)))} />
      <div className="local-more local-more--open" data-section="Savings by model as a table">
      <ul>
        {models.map((model, index) => {
          const n = saving(model);
          const name = isMissing(model.model) ? 'Unknown model' : String(model.model);
          const runs = recordedCount(model.runs);
          return (
            <li key={`${name}-${index}`} data-semantic-concept={`model:${name}`} style={{ '--model-color': modelColor(name) } as CSSProperties}>
              <span className="local-model-identity" data-semantic-concept={`model:${name}`} style={modelIdentityStyle(name)}>{name}</span>
              <span className="local-savings-bar" aria-hidden="true">{n !== null && max > 0 && <i style={{ width: `${Math.max(1, (n / max) * 100)}%` }} />}</span>
              <strong data-field-tone="savings" data-field-unavailable={n === null}>{n === null ? 'Not measured' : formatUsd(model.savings_usd)}</strong>
              <span>{`${recordedCount(model.runs_measured)} of ${runs} runs measured`}</span>
              <span>{isMissing(model.spend_usd) ? 'Spend not measured' : `Spend ${formatUsd(model.spend_usd)}`}</span>
            </li>
          );
        })}
      </ul>
      </div>
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
  const pct = fmtLocaleString(value, 'en-US', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'never' });
  return `${pct} ${value < 0 ? 'above' : 'below'} the ${String(baselineModel)} baseline (modelled)`;
}

// OMN-21166 live review 2026-10-25: Avg saving / call was deleted from Overview (Lakshman, "delete them").

/** The raw served row (not the Runs session flattening) of a component's second binding. */
export function captionRowFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): Record<string, unknown> | null {
  const topic = component.data_bindings?.[1]?.projection_topic;
  if (topic === undefined) return null;
  const first = snapshots.find((snapshot) => snapshot.topic === topic)?.rows?.[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
}
