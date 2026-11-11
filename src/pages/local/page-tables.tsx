// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. Declared tables and read states shared by every local page.
import { formatDashboardCount } from '@/theme/format';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { type LucideIcon } from '@/theme/design-system/icons';
import { UsageByModelDayTable, UsageTokensChart } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { formatDashboardUsd as formatUsd } from '@/theme/format';
import { MeteringDaySeries, meteringDaysByBaseline } from '@/components/dashboard/usage/SavingsSeriesWidget';
import { TenantNotConfiguredState } from '@/components/dashboard/TenantNotConfiguredState';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';
import { SpendByDayChart, UNRESOLVED_BASELINE } from '@/theme/design-system/charts';
import { InsightsSection, MeteringActivityInsights, type ActivityWindow } from '@/pages/local/insight-charts';
import { UsageInsights } from '@/pages/local/usage-insights';
import { DataTable, EmptyState } from '@/theme/design-system/components';
import { plainFailureMessage } from '@/pages/local/plain-text';
import { causeHref } from '@/pages/local/run-filter';
import { meteringFilledDays, servedDailyDays } from '@/pages/local/insights';
import { DashboardAccess, dashboardAccessRow } from '@/pages/local/access';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { CONCEPT_ICONS } from '@/theme/design-system/icons';
import { rowsForLocalBinding, rowsForLocalComponent, DELEGATION_DECISIONS_TOPIC, DELEGATION_DAILY_TOPIC, METERING_SUMMARY_TOPIC, type BoundProjectionSnapshot, type LocalPageDocument, type LocalPageName } from '@/layout/local-page-loader';
import { type Row, age, asRecords, isMissing, timeOf, tokensTitle } from '@/pages/local/page-shared';
import { LastRunCard, NewestRunLine, NoRunsYet, OverviewRunPreview, QualityPanel, RunsTable } from '@/pages/local/page-runs';
import { type OverviewWindow, QualityCard, SavingsByModel, meteringRangeFor, pickMeteringRow, qualityChangeLine } from '@/pages/local/page-headline';
import { ModelUsagePanel, OverviewTrendPanel, TierMixPanel } from '@/pages/local/page-overview';
import { AlertsTable, CredentialsTable } from '@/pages/local/page-settings';
import { LocalIdentity } from '@/pages/local/page-workflow';

/** The raw served rows of a component's binding, before any envelope unpacking. */
/** OMN-21970 AC3: the decisions read is complete when it walked every page (no truncated mark). */
function decisionsCompleteRead(snapshots: readonly BoundProjectionSnapshot[]): boolean {
  const walk = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
  return walk !== undefined && !walk.failure && walk.truncated !== true;
}

export function rawRowsFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
  index: number,
): unknown[] {
  const topic = component.data_bindings?.[index]?.projection_topic;
  return snapshots.find((snapshot) => snapshot.topic === topic)?.rows ?? [];
}

/** A table column as the page declares it: the served field it shows, its header, and how the value is written. */
export interface DeclaredColumn {
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
/** OMN-22168: a token cell reads short, so its exact count is its hover title. */
function declaredTitle(row: Row, column: DeclaredColumn): string | undefined {
  if (column.key === 'tokens_in') return tokensTitle(row[column.key], 'in');
  return column.key === 'tokens_out' ? tokensTitle(row[column.key], 'out') : undefined;
}

function declaredCell(row: Row, column: DeclaredColumn): string {
  const value = row[column.key];
  if (isMissing(value)) {
    return row.baseline_state === 'unresolved' && !RUN_MEASURED_FIELDS.has(column.key) ? 'Baseline unresolved' : 'Not measured';
  }
  if (column.key === 'tokens_in' || column.key === 'tokens_out') return formatDashboardCount(value);
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
          <DataTable fit key={baseline} aria-label={`${title} vs ${baseline}`}>
              <thead><tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr></thead>
              <tbody>
                {days.map((row, index) => (
                  <tr key={`${String(row.window_start)}-${index}`}>
                    {columns.map((column) => <td key={column.key} title={declaredTitle(row, column)}>{declaredCell(row, column)}</td>)}
                  </tr>
                ))}
                {allTime && (
                  <tr>
                    {columns.map((column) => (
                      <td key={column.key} title={column.key === 'window_start' ? undefined : declaredTitle(allTime, column)}>{column.key === 'window_start' ? 'All time' : declaredCell(allTime, column)}</td>
                    ))}
                  </tr>
                )}
              </tbody>
          </DataTable>
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

export function TableComponent({ component, snapshots, pageSize, syncUrl, columns, activityWindow, meteringView = 'all', slice }: {
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
  // OMN-21970 AC3: the decisions read is complete when it walked every page (no truncated mark), so the charts and
  // captions may treat its rows as every served run; AC2: the daily charts draw delegation.daily.v1 when it is served.
  const decisionsWalk = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
  const decisionsComplete = decisionsWalk !== undefined && !decisionsWalk.failure && decisionsWalk.truncated !== true;
  const dailyRead = snapshots.find(snapshot => snapshot.topic === DELEGATION_DAILY_TOPIC);
  const servedDays = dailyRead && !dailyRead.failure ? servedDailyDays(dailyRead.rows) : null;
  // OMN-22168 (Lakshman 2026-11-04): without delegation.daily.v1, a decisions read that stopped short of every run draws
  // Tokens per day from metering-summary.v1's served day totals, so it covers the same days as the Daily trend. Runs per
  // day keeps the runs it read: "don't show anything if we don't have" (no verdict, no bar).
  const meteringDays = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
  const tokenDays = servedDays ?? (!decisionsCompleteRead(snapshots) && meteringDays && !meteringDays.failure
    ? meteringFilledDays(meteringDays.rows, snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)?.rows ?? []) : null);
  // OMN-21970 AC2 (Jonah 2026-11-07, "same time scale as the graph above"): Runs per day keeps each day's served run
  // total, so its axis spans every served day, as the Daily trend and Tokens per day do. It still draws only the
  // passed and failed runs read (Lakshman 2026-11-05, "in bar graph passed and failed only"): a day with no verdict
  // read has no bar and reads "Verdicts not read", never a zero.
  const runDays = servedDays ?? tokenDays;
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
      servedDays={slice.key === 'tokens' ? tokenDays : runDays} complete={decisionsComplete} />;
    return rows.length === 0 ? <NoRunsYet /> : <>
    <InsightsSection decisions={rows} now={Date.now()} view="summary" servedDays={servedDays} complete={decisionsComplete} more={meteringRows.length > 0
      ? <MeteringActivityInsights rows={meteringRows} now={Date.now()} window={activityWindow} unavailable={meteringUnavailable} display="kpis" />
      : null} />
  </>;
  }
  if (component.component_id === 'runs-insights') return <>{rows.length === 0 ? <NoRunsYet /> : <InsightsSection decisions={rows} now={Date.now()} view="analysis" complete={decisionsComplete} onInspectFailure={cause => {
    navigate(causeHref(cause));
    document.querySelector('[data-component="recent-runs"]')?.scrollIntoView?.({ block: 'start' });
  }} />}</>;
  if (component.component_id === 'overview-trend') {
    // The Overview window, as the activity charts receive it.
    const now = Date.now();
    const window: OverviewWindow = !activityWindow || activityWindow.kind === 'all' ? 'all'
      : activityWindow.kind === 'days' ? meteringRangeFor(activityWindow.days, now) : `range:${activityWindow.start}..${activityWindow.end}`;
    return <OverviewTrendPanel rows={rawRowsFor(component, snapshots, 0)} window={window} now={now}
      columns={columns} />;
  }
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
    part={slice && ['spend', 'cost-per-run', 'tokens-by-model', 'cost-by-route', 'analysis'].includes(slice.key) ? slice.key as 'spend' | 'cost-per-run' | 'tokens-by-model' | 'cost-by-route' | 'analysis' : 'all'}
    decisionRows={rawRowsFor(component, snapshots, 1)} routingRows={rawRowsFor(component, snapshots, 2)} complete={decisionsComplete} />;
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
    if (slice?.key === 'by-model') return byModel ?? <EmptyState>No savings by model served yet</EmptyState>;
    if (groups.length === 0) return <MeteringDaySeries rows={rows} />;
    return (
      <>{groups.map(([baseline, days]) => <div className="local-usage-savings" key={baseline}>
        {/* OMN-21015 U2: the same served day rows as bars; the chart plots the money columns this panel declares.
            Its one series takes the savings identity colour, the colour of Overview's Savings card. */}
        <SpendByDayChart title={component.title} rows={days} columns={columns} colourPlaces={[5]} />
        {/* OMN-21166 part 13: the day table repeats the chart, so it is one click away. */}
        <div className="local-more local-more--open" data-section="Savings by day as a table"><MeteringDaySeries rows={days} /></div>
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
  if (component.component_id === 'api-keys-access') {
    const topic = component.data_bindings?.[0]?.projection_topic;
    return <DashboardAccess rows={asRecords(rawRowsFor(component, snapshots, 0))}
      complete={!snapshots.some(snapshot => snapshot.topic === topic && snapshot.failure)} />;
  }
  // OMN-19991: System status' alerts table. Without this branch a table component falls through to RunsTable,
  // which draws the Runs columns and the run filters over whatever rows it was handed: an alert row rendered as
  // one run of "Not recorded". A table that reads another exposure needs its own renderer named here.
  if (component.component_id === 'status-alerts') return <AlertsTable rows={rows} columns={columns} />;
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
export function ReadFailureNotice({ snapshot, title, now, savedMessage, onRetry = requestLocalPageRefresh }: {
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

/**
 * Lookups a panel draws without, keyed to what it draws instead (operator 2026-11-11: "what is this Not available yet:
 * daily run totals. - if not needed remove it"): without delegation.daily.v1 the activity panel draws the same days from
 * metering-summary.v1's day totals (OMN-22168, above), so while those are served its not-served line names nothing the
 * reader lacks. With the fallback not served either the panel draws only the runs it read, and the line stays
 * (OMN-21970). A lookup with no fallback is always named.
 */
const LOOKUP_FALLBACKS: Readonly<Record<string, string>> = { [DELEGATION_DAILY_TOPIC]: METERING_SUMMARY_TOPIC };
function drawnWithout(topic: string, snapshots: readonly BoundProjectionSnapshot[]): boolean {
  const fallback = LOOKUP_FALLBACKS[topic];
  return fallback !== undefined && snapshots.some(snapshot => snapshot.topic === fallback && !snapshot.failure);
}

export function WidgetReadState({ component, snapshots, now, interval }: {
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
    && !snapshot.lastGoodAt && !gating.includes(snapshot) && !drawnWithout(snapshot.topic, snapshots));
  const readAt = primary.failure ? primary.lastGoodAt ?? null : primary.readAt;
  const stale = readAt !== null && now - timeOf(readAt) > 2 * interval * 1000;
  return (
    <>
      {tenantNotConfigured && <TenantNotConfiguredState />}
      {failures.map((snapshot) => (
        <ReadFailureNotice key={snapshot.topic} snapshot={snapshot} title={component.title} now={now} />
      ))}
      {unservedLookups.map((snapshot) => (
        <EmptyState key={snapshot.topic}>{plainFailureMessage(snapshot.failure!, { topic: snapshot.topic })}</EmptyState>
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
export function notServedTopic(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): string | null {
  const snapshot = rowGatingSnapshots(component, snapshots)
    .find((candidate) => candidate.failure?.kind === 'not-served' && !candidate.lastGoodAt);
  return snapshot?.failure ? plainFailureMessage(snapshot.failure, { topic: snapshot.topic }) : null;
}

/** A component whose row-gating binding failed with no last good rows renders only its read state. */
export function bindingFailedEmpty(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): boolean {
  return rowGatingSnapshots(component, snapshots)
    .some((snapshot) => Boolean(snapshot.failure) && !snapshot.lastGoodAt);
}

/** The icon beside a panel's title, by component. A component not listed here gets none; nothing depends on it. */
export const PANEL_CONCEPTS: Readonly<Record<string, string>> = {
  'status-environment': 'host',
  'overview-spend': 'cost', 'overview-savings': 'savings', 'overview-measured': 'calls',
  'overview-tokens': 'tokens', 'overview-last-run': 'last', 'overview-recent-runs': 'recent',
  'overview-insights': 'analysis', 'usage-insights': 'usage-analysis', 'runs-insights': 'analysis',
  'runs-tier-mix': 'tier-mix', 'overview-run-locally': 'local-run',
  'overview-avg-saving-per-call': 'saving-average', 'overview-baseline-spend': 'baseline',
  'overview-quality': 'quality', 'overview-model-usage': 'runs-model', 'overview-tier-mix': 'tier-mix',
  'overview-trend': 'activity', 'overview-compression': 'compression',
  'overview-cache-hit-rate': 'cache', 'overview-spend-by-day': 'spend-daily', 'recent-runs': 'recent',
  'workflow-run-path': 'path', 'usage-by-model-day': 'usage-day', 'usage-tokens-by-day': 'tokens-daily',
  'usage-savings-series': 'savings-daily', 'credentials-keys': 'credentials',
  'api-keys-local-identity': 'local-identity', 'api-keys-access': 'local-access', 'api-keys-cloud': 'cloud-keys',
  // OMN-21970 AC10: Settings' Pricing and routing panel, the one panel title on the six pages that had no icon.
  'pricing-baseline': 'baseline',
  // OMN-23330 (Playwright omn21015-cards, red on dev too): Settings' Open alerts title had no icon; it takes the alert glyph.
  'status-alerts': 'failures',
};
/** Compatibility inventory, derived from the shared canonical identity rather than a second icon map. */
export const PANEL_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(PANEL_CONCEPTS).map(([panel, concept]) => [panel, CONCEPT_ICONS[concept]!]),
);

export const PAGE_TITLES: Record<LocalPageName, string> = {
  overview: 'Overview',
  runs: 'Runs',
  workflow: 'Workflow',
  usage: 'Usage',
  credentials: 'Credentials',
  'api-keys': 'API Keys',
  status: 'System status',
  pricing: 'Pricing and routing',
};
