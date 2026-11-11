// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. Overview panels: model usage, the status strip, the Daily trend and the tier mix.
import { formatDashboardCount, formatFullCount } from '@/theme/format';
import { useId, useState, type CSSProperties } from 'react';
import { tierColor, tierConcept } from '@/lib/dashboard-colors';
import { Link } from 'wouter';
import { formatDashboardUsd as formatUsd } from '@/theme/format';
import { DEFAULT_RUNS_VIEW, writeRunsSearch } from '@/navigation/runs-url-state';
import { TIER_TONES } from '@/theme/design-system/charts';
import { ColumnTip, DataTable, EmptyState, Fact, FactList } from '@/theme/design-system/components';
import { Clock3, Rows3, Timer } from '@/theme/design-system/icons';
import { tierLabel } from '@/pages/local/plain-text';
import { toInsightRuns } from '@/pages/local/insights';
import { ChartReadout, DayAxis, MultiLinePlot, RankedBars, SeriesToggles, useSeriesToggles } from '@/theme/design-system/charts';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { TierLegend, useModelColor, useModelIdentityStyle } from '@/components/dashboard/model-tiers';
import { fixed as fmtFixed, localeDate as fmtLocaleDate } from '@/theme/format';
import { formatShare } from '@/theme/format';
import { type Row, asRecords, isMissing, recorded, recordedCount, utcDay } from '@/pages/local/page-shared';
import { type OverviewWindow, pickMeteringRow } from '@/pages/local/page-headline';
import { type DeclaredColumn } from '@/pages/local/page-tables';
import { ShareMeter, TierModelCostCell } from '@/pages/local/page-runs';

export function ModelUsagePanel({ row }: { row: Row | null }) {
  const modelColor = useModelColor();
  const models = row && Array.isArray(row.by_model) ? asRecords(row.by_model) : [];
  if (models.length === 0) return <EmptyState>No model usage served yet</EmptyState>;
  const share = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? null : Number(value));
  return (
    // AC144: all served models keep upright bars; long names wrap and the plot scrolls inside its panel when narrow.
    <section aria-label="Model usage" className="local-model-usage local-model-usage--upright">
      {/* Lakshman 2026-11-04 ("remove"): no "Runs" unit line above the bars. */}
      {/* OMN-23330 AC6: each model's runs and share are printed, not left to hover. */}
      <RankedBars label="Runs by model" unit="" order="desc" layout="vertical" many="scroll" values="always"
        items={models.map((model, index) => {
          const name = isMissing(model.model_name) ? 'Not recorded' : String(model.model_name);
          const runs = share(model.total_count);
          const pct = share(model.pct_of_total);
          // Part 19 AC135: a named model opens Runs filtered to it; a model the rows do not name opens nothing.
          const href = isMissing(model.model_name) ? undefined : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, model: name })}`;
          return { key: `${name}-${index}`, name, model: isMissing(model.model_name) ? undefined : name, value: runs, basis: 'measured' as const, color: modelColor(name), href, opensLabel: `Opens Runs filtered to ${name}`,
            display: runs === null ? 'Not recorded'
              : `${recordedCount(model.total_count)}${pct === null ? '' : ` · ${formatShare(pct)}`}` };
        })} />
      <TierLegend label="Model usage tier colours" models={models.map(model => (isMissing(model.model_name) ? '' : String(model.model_name)))} />
      <p className="local-dashboard-caption">{`${recordedCount(row?.total_delegations)} runs · ${models.length} ${models.length === 1 ? 'model' : 'models'}`}</p>
    </section>
  );
}

/**
 * OMN-22168 (Lakshman 2026-11-04, "all 4"): the line under Overview's title. The runtime's state is local-environment.v1's
 * observed_state, never assumed: no row reads not recorded, and any state other than running shows itself and its served
 * reason. The last run is the newest served decision's time, the run total delegation.model-routing.v1's served
 * total_delegations, and the median run time the served decisions' durations, as the Runs page reads them.
 */
export function OverviewStatusStrip({ env, decisions, routing, now, window = 'all', metering = null, complete = false }: {
  env: Row | null; decisions: readonly unknown[]; routing: Row | null; now: number; complete?: boolean;
  /** Lakshman 2026-11-04 ("based on time selected ... make everything dynamic"): the Overview window, and the served
   * metering rows its run count is read from (the row the cards read for that window). */
  window?: OverviewWindow; metering?: readonly unknown[] | null;
}) {
  const observed = env && !isMissing(env.observed_state) ? String(env.observed_state) : null;
  const state = observed === null ? 'unknown' : observed === 'running' ? 'running' : 'attention';
  const runs = toInsightRuns(decisions);
  let newest: number | null = null;
  for (const run of runs) if (Number.isFinite(run.at) && (newest === null || run.at > newest)) newest = run.at;
  const ago = newest !== null && newest <= now ? now - newest : null;
  const lastRun = ago === null ? 'Last run not recorded'
    : ago < 60_000 ? 'Last run under a minute ago'
      : ago < 3_600_000 ? `Last run ${Math.floor(ago / 60_000)} min ago`
        : ago < 172_800_000 ? `Last run ${Math.floor(ago / 3_600_000)} h ago` : `Last run ${Math.floor(ago / 86_400_000)} days ago`;
  // The run count follows the window: the window's metering row (as the cards read it); all time falls back to the
  // routing view's served total when no metering row is read.
  const picked = metering ? pickMeteringRow(metering, window, now) : null;
  const windowRuns = picked && 'row' in picked && !isMissing(picked.row.runs_total) ? Number(picked.row.runs_total) : NaN;
  const served = Number.isFinite(windowRuns) ? windowRuns
    : window === 'all' && routing && !isMissing(routing.total_delegations) ? Number(routing.total_delegations) : NaN;
  const total = Number.isFinite(served) ? `${formatFullCount(String(served))} runs` : 'Runs not recorded';
  // The median run time is the window's runs only, and it is shown only when the runs read cover the whole window (the
  // read's oldest run is on or before the window's first day, or the read holds every run): otherwise it would be the
  // median of the latest runs, not of the window (Lakshman 2026-11-04, "make sure all information written is correct").
  const today = utcDay(now);
  const [from, to] = window === 'all' ? ['', '9999-12-31'] : window === 'today' ? [today, today]
    : window.startsWith('day:') ? [window.slice(4), window.slice(4)] : (window.slice(6).split('..') as [string, string]);
  const oldestRead = runs.reduce<string | null>((oldest, run) => (oldest === null || run.day < oldest ? run.day : oldest), null);
  const covered = complete || (oldestRead !== null && from !== '' && oldestRead < from);
  const inWindow = covered ? runs.filter(run => run.day >= from && run.day <= to) : [];
  const latencies = inWindow.map(run => run.latencyMs).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const median = latencies.length === 0 ? null : latencies[Math.floor((latencies.length - 1) / 2)]!;
  // Lakshman 2026-11-04 ("colourful and remove 500 latest runs text"): the median reads plainly, without the read's size.
  const speed = median === null ? null : `Median run ${fmtFixed((median / 1000), 1)} s`;
  const reason = state === 'attention' && env && !isMissing(env.reason) ? String(env.reason) : null;
  return (
    <div className="local-overview-status" role="status" aria-label="Runtime status" data-state={state}>
      <span className="local-overview-status-dot" aria-hidden="true" />
      {/* OMN-22168 ("do all", item 3): the state opens Settings' System status, where the runtime's details are. */}
      <strong><Link href="/settings#system" className="local-overview-status-link">{observed === null ? 'Runtime status not recorded' : `Runtime ${observed}`}</Link></strong>
      {reason && <span className="local-overview-status-reason">{reason}</span>}
      {/* Lakshman 2026-11-04 ("colourful"): each fact is a chip with its own glyph and tone. */}
      <span className="local-status-chip" data-tone="blue"><Clock3 size={14} aria-hidden="true" data-semantic-concept="status:last-run" />{lastRun}</span>
      <span className="local-status-chip" data-tone="purple"><Rows3 size={14} aria-hidden="true" data-semantic-concept="status:runs-read" />{total}</span>
      {speed && <span className="local-status-chip" data-tone="amber"><Timer size={14} aria-hidden="true" data-semantic-concept="status:median-run" />{speed}</span>}
    </div>
  );
}

/** OMN-22168 (Lakshman 2026-11-04, "each should have visually different colour, distinct"): five hues far apart on the
 * wheel, so no two trend lines can be mistaken for each other on one chart, in either theme. */
const TREND_TONES: Readonly<Record<string, string>> = {
  // Lakshman 2026-11-05 ("each unique thing has a unique colour and vice versa"): each line is its concept's own token,
  // the same one its summary card wears (runs as calls, tokens in and out, spend as cost, savings).
  Runs: 'var(--ds-field-calls)', 'Tokens in': 'var(--ds-field-tokens-in)', 'Tokens out': 'var(--ds-field-tokens-out)',
  Spend: 'var(--ds-field-cost)', Savings: 'var(--ds-field-savings)',
};
/** The concept each trend line is, so its value in the readout wears the line's colour (data-field-tone). */
const TREND_FIELDS: Readonly<Record<string, string>> = {
  Runs: 'calls', 'Tokens in': 'tokens-in', 'Tokens out': 'tokens-out', Spend: 'cost', Savings: 'savings',
};

/** The UTC days a window covers, first to last; all time runs from the first served day to today. */
function trendDays(window: OverviewWindow, served: readonly string[], now: number): string[] {
  const today = utcDay(now);
  const [start, end] = window === 'all' ? [served[0] ?? today, today]
    : window === 'today' ? [today, today]
      : window.startsWith('day:') ? [window.slice(4), window.slice(4)]
        : window.slice(6).split('..') as [string, string];
  const days: string[] = [];
  for (let at = Date.parse(`${start}T00:00:00Z`); Number.isFinite(at) && at <= Date.parse(`${end}T00:00:00Z`) && days.length < 400; at += 86_400_000) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * OMN-22168 (Lakshman 2026-11-04: "one linear chart to show runs, models, tokens etc.", then "legend and one line chart
 * for all ... with hover numbers"): metering-summary.v1's served day rows over the Overview window, every metric the page
 * declares as a column drawn as its own line on one chart, each against its own busiest day (the units differ), with a
 * legend that shows or hides each line and a readout of every served value for the day in focus. A day with no served
 * row, or served by two rows, is a gap in every line, never 0 or one of the two; the all-time row is never a day.
 */
export function OverviewTrendPanel({ rows, columns, window, now }: {
  rows: readonly unknown[]; columns: readonly DeclaredColumn[]; window: OverviewWindow; now: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const slug = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const { shown, toggle } = useSeriesToggles(columns.map(column => slug(column.header)));
  const byDay = new Map<string, Row[]>();
  for (const row of asRecords(rows)) {
    if (row.window_kind !== 'day' || isMissing(row.window_start)) continue;
    const day = String(row.window_start).slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  if (byDay.size === 0 || columns.length === 0) return <EmptyState>No day rows served yet</EmptyState>;
  const days = trendDays(window, [...byDay.keys()].sort(), now);
  const label = (day: string) => fmtLocaleDate(new Date(`${day}T00:00:00Z`), 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const twice = (day: string) => (byDay.get(day) ?? []).length > 1;
  const valueOf = (day: string, column: DeclaredColumn) => {
    const served = byDay.get(day) ?? [];
    if (served.length !== 1) return null;
    const raw = served[0]![column.key];
    return isMissing(raw) || !Number.isFinite(Number(raw)) ? null : Number(raw);
  };
  // A count of exactly one names its unit in the singular ("1 run"); money keeps its noun ("$0.01 spend").
  const unit = (value: number, column: DeclaredColumn) => {
    const noun = column.header.toLowerCase();
    return column.format !== 'currency' && value === 1 && noun.endsWith('s') ? noun.slice(0, -1) : noun;
  };
  const say = (value: number | null, column: DeclaredColumn, compact: boolean) => (value === null ? 'not recorded'
    : `${column.format === 'currency' ? formatUsd(value) : compact ? formatDashboardCount(value) : formatFullCount(String(value))} ${unit(value, column)}`);
  const visible = columns.filter(column => shown[slug(column.header)]);
  const lines = visible.map(column => {
    const values = days.map(day => valueOf(day, column));
    return { key: slug(column.header), color: TREND_TONES[column.header] ?? 'var(--ds-ink-2)', values };
  });
  const dayText = (day: string, compact: boolean) => (byDay.has(day) ? twice(day) ? 'not recorded (two rows for this day)'
    : visible.map(column => say(valueOf(day, column), column, compact)).join(', ') : 'not recorded');
  // OMN-23330 AC8: with nothing pointed at, the readout shows the newest served day, so no blank row sits above the chart.
  const active = hover === null ? [...days].reverse().find(day => byDay.has(day)) : days[hover];
  // Lakshman 2026-11-05 ("this look congested and bad"): one line is in front (the legend chip under the pointer, else
  // the first line shown), bold with a soft fill; the rest are thinner behind it. Every line and value is still drawn.
  const front = lines.some(line => line.key === preview) ? preview : lines[0]?.key ?? null;
  return (
    <figure className="local-chart local-trend" aria-label="Daily trend">
      <p className="local-dashboard-caption">{visible.length === 1
        ? `${visible[0]!.header} per UTC day, on its real scale. Hover a day for its numbers.`
        : 'Each line is scaled to its own busiest UTC day. Point at a chip to bring it forward; show one line alone for its real scale.'}</p>
      <SeriesToggles label="Trend lines" onToggle={key => toggle(key)} onPreview={setPreview} focus={front}
        series={columns.map(column => ({ key: slug(column.header), label: column.header, color: TREND_TONES[column.header] ?? 'var(--ds-ink-2)',
          tone: TREND_FIELDS[column.header], shown: shown[slug(column.header)] ?? true }))} />
      <ChartReadout active={hover !== null} day={active}
        // Lakshman 2026-11-05 ("this also should be colorful"): each value in the readout wears its own line's colour.
        text={active !== undefined ? <>{label(active)}{byDay.has(active) && !twice(active)
          ? visible.map(column => <span key={column.key}><span className="ins-readout-sep">{' · '}</span><span data-field-tone={TREND_FIELDS[column.header]}>{say(valueOf(active, column), column, true)}</span></span>)
          : <><span className="ins-readout-sep">{' · '}</span>{dayText(active, true)}</>}</> : ''} />
      {/* OMN-22168 ("do all", item 5): one line shown is drawn on its real scale, with its top value and 0 marked. */}
      {(() => {
        const single = visible.length === 1 ? visible[0]! : null;
        const known = single ? lines[0]!.values.filter((value): value is number => value !== null) : [];
        const top = known.length === 0 ? null : Math.max(...known);
        // Lakshman 2026-11-04 ("polish"): a scale at the left (the real values for one line; the share of each line's own
        // busiest day for several), gridlines behind the lines, and a date every few days below.
        const real = single && top !== null;
        const scale = real ? [top, top / 2, 0].map(value => (single!.format === 'currency' ? formatUsd(value) : formatDashboardCount(Math.round(value)))) : [];
        const step = Math.max(1, Math.ceil(days.length / 6));
        const ticks = days.map((day, index) => ({ day, index })).filter(({ index }) => index % step === 0 || index === days.length - 1)
          .filter(({ index }, position, all) => index === days.length - 1 || all[position + 1] === undefined || all[position + 1]!.index - index >= step / 2);
        // Several lines have no shared scale, so only one line shown gets its values at the left.
        return <div className={`local-trend-scaled${real ? ' local-trend-scaled--axis' : ''}`}>
          {real && <div className="local-trend-yaxis" aria-hidden="true">
            {scale.map((text, index) => <span key={index}>{text}</span>)}</div>}
          <div className="local-trend-plot">
            <MultiLinePlot label="Daily trend" lines={lines} keys={days} hover={hover} onHover={setHover} focus={front}
              labels={days.map(day => `${label(day)}: ${dayText(day, false)}`)} />
            {/* OMN-23330 AC31: the kit's one DayAxis, on the lines' points (first day at the left edge, last at the right). */}
            <DayAxis days={days} ticks={new Set(ticks.map(({ index }) => index))} place="point" format={label} />
          </div>
        </div>;
      })()}
    </figure>
  );
}

/**
 * OMN-20225 AC3: the tier mix, from delegation.model-routing.v1's served by_tier (view migration 0045). Each tier's
 * count and share are the view's; runs with no tier are the served not_tier_routed_count, never folded into a tier.
 * OMN-21015 AC2: under each tier, the models the view lists for it (migration 0060), with their served runs, share of
 * the tier-routed runs and cost. Nothing is added up here; a tier served without models shows none.
 */
export function TierMixPanel({ row, compact = false }: { row: Row | null; compact?: boolean }) {
  const modelIdentityStyle = useModelIdentityStyle();
  const totalsId = useId();
  const byTier = row && typeof row.by_tier === 'object' && row.by_tier !== null && !Array.isArray(row.by_tier)
    ? (row.by_tier as Row) : null;
  const tiers = byTier && Array.isArray(byTier.tiers) ? asRecords(byTier.tiers) : [];
  if (!byTier || tiers.length === 0) {
    return <EmptyState>No tier mix served yet</EmptyState>;
  }
  if (compact) {
    // OMN-21166 Maple grid: on Overview the tiers are a ranked list beside Tokens per day; the full breakdown is on Runs.
    const share = (value: unknown) => (isMissing(value) || !Number.isFinite(Number(value)) ? null : Number(value));
    return (
      <section aria-label="Tier mix">
        {/* OMN-23330 AC6: each tier's runs and share are printed, not left to hover. */}
        <RankedBars label="Runs by tier" unit="" order="desc" layout="vertical" values="always"
          items={tiers.filter(tier => tier.cost_tier_name !== 'not_tier_routed').map((tier, index) => {
            const name = String(tier.cost_tier_name);
            const pct = share(tier.pct_of_tier_routed);
            // Part 19 AC135 with part 23 AC145: a served tier opens Runs filtered to it (?tier=<served name>).
            const href = isMissing(tier.cost_tier_name) ? undefined : `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, tier: name })}`;
            return { key: `${name}-${index}`, name: tierLabel(name), value: pct === null ? null : pct * 100, basis: 'measured' as const, color: tierColor(name), href, opensLabel: `Opens Runs filtered to ${tierLabel(name)}`,
              // A served share above zero but under 0.1% reads "<0.1%", never a rounded 0.0% that hides a real tier.
              display: pct === null ? 'Not recorded' : `${recordedCount(tier.count)} · ${formatShare(pct)}` };
          })} />
        <p className="local-dashboard-caption">{`${recordedCount(byTier.tier_routed_total)} tier-routed · ${recordedCount(byTier.not_tier_routed_count)} not tier-routed · ${recordedCount(byTier.total_tasks)} runs`}</p>
      </section>
    );
  }
  return (
    <section aria-label="Tier mix">
      {/* Part 18 AC120: the table, shown directly; the meter bars repeated its shares (Overview's Tier mix draws them). */}
      <DataTable fit>
          {/* Lakshman 2026-11-05 ("in run page check all and make it standardized"): headers as the run table writes them,
              each in its column's colour with its glyph 6px from the label. */}
          {/* Each header explains its column on hover and keyboard focus, as the run table's (Lakshman 2026-11-05). */}
          <thead><tr><th><ColumnTip tone="tier" tip="The cost tier, with the models that ran under it."><span className="local-table-head" data-field-tone="tier" tabIndex={0}><FieldIcon label="Tier" size={13} />Tier</span></ColumnTip></th><th><ColumnTip tone="delegations" tip="Runs routed to the tier, and each model's runs in it."><span className="local-table-head" data-field-tone="delegations" tabIndex={0}><ConceptIcon concept="delegations" label="Runs" size={13} />Runs</span></ColumnTip></th><th><ColumnTip tone="routing" tip="The tier's share of the runs that were routed by tier."><span className="local-table-head" data-field-tone="routing" tabIndex={0}><ConceptIcon concept="routing" label="Share of tier-routed" size={13} />Share of tier-routed</span></ColumnTip></th><th><ColumnTip tone="cost" tip="What each model's runs in the tier cost. A grey $0 is free."><span className="local-table-head" data-field-tone="cost" tabIndex={0}><FieldIcon label="Cost" size={13} />Cost</span></ColumnTip></th></tr></thead>
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
              <td data-column="share" className="local-dashboard-cell-token">{routed ? <ShareMeter value={tier.pct_of_tier_routed} /> : <><span aria-hidden="true">—</span><span className="local-visually-hidden">No share: not tier-routed</span></>}</td>
              {/* Cost is served per model, so a tier's row names none (its models' rows below do). */}
              <td data-column="cost"><span className="local-run-quiet" aria-hidden="true">—</span><span className="local-visually-hidden">Cost is shown per model</span></td>
            </tr>,
            ...(Array.isArray(tier.models) ? asRecords(tier.models) : []).map((model, modelIndex) => (
              <tr data-tone={tone} style={{ '--tier-color': tierColor(name) } as CSSProperties} key={`${name}-${index}-${String(model.model_name)}-${modelIndex}`} className="local-dashboard-row--nested local-routing-model-row">
                <td className="local-dashboard-cell-token local-dashboard-cell-name"><span className="local-routing-name local-model-identity" data-semantic-concept={`model:${String(model.model_name)}`} style={modelIdentityStyle(model.model_name)}><FieldIcon tone="model" value={model.model_name} size={14} />{recorded(model.model_name)}</span></td>
                <td data-column="runs">{recordedCount(model.count)}</td>
                <td data-column="share" className="local-dashboard-cell-token">{routed ? <ShareMeter value={model.pct_of_tier_routed} /> : <><span aria-hidden="true">—</span><span className="local-visually-hidden">No share: not tier-routed</span></>}</td>
                <td data-column="cost" data-unavailable={isMissing(model.cost_usd)}><TierModelCostCell model={model} /></td>
              </tr>
            )),
          ];})}</tbody>
      </DataTable>
      {/* Lakshman 2026-11-05 ("one card so that we know it's total"): the three totals are one card under the table. */}
      <div className="local-tier-totals" role="group" aria-labelledby={`${totalsId}-title`}>
      <p className="local-dashboard-caption local-tier-totals-title" id={`${totalsId}-title`}>Totals</p>
      <FactList>
        <Fact term={<><FieldIcon label="Tier-routed" />Tier-routed</>} data-field-tone="routing" data-field-unavailable={isMissing(byTier.tier_routed_total)}>{recordedCount(byTier.tier_routed_total)}</Fact>
        <Fact term={<><FieldIcon label="Not tier-routed" />Not tier-routed</>} data-field-tone="unrouted" data-field-unavailable={isMissing(byTier.not_tier_routed_count)}>{recordedCount(byTier.not_tier_routed_count)}</Fact>
        <Fact term={<><FieldIcon label="All runs" />All runs</>} data-field-tone="delegations" data-field-unavailable={isMissing(byTier.total_tasks)}>{recordedCount(byTier.total_tasks)}</Fact>
      </FactList>
      </div>
    </section>
  );
}
