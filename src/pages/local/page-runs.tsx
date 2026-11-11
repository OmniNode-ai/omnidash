// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. The Runs page: the run list, its table, filters and column widths.
import { formatDashboardCount } from '@/theme/format';
import { readableTime } from '@/theme/format';
import { exactMs } from '@/theme/format';
import { useContext, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tierColor } from '@/lib/dashboard-colors';
import { Link, useLocation, useSearch } from 'wouter';
import { CalendarDays, ArrowUpRight, ChevronRight } from '@/theme/design-system/icons';
import { formatDashboardUsd as formatUsd } from '@/theme/format';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import { runsToCsv, runsToJson, sortRuns, type RunSortKey } from '@/pages/local/runs-sort-export';
import { PAGE_PATHS } from '@/navigation/page-routes';
import { workflowHref } from '@/navigation/workflow-url-state';
import { RunDurationChart, RunMetricChart, RunTokensChart, type ListedRun } from '@/theme/design-system/charts';
import { PassRateMeter } from '@/pages/local/shares';
import { breakableName } from '@/theme/design-system/charts';
import { PassRateSparkline, TaskIcon } from '@/pages/local/insight-charts';
import { RoutingAnalysis } from '@/pages/local/usage-analysis';
import { Badge, ConfirmDialog, DashboardTabs, DataTable, Dropdown, EmptyState, Fact, FactList, InfoTip, Panel, PanelTitle, Tooltip } from '@/theme/design-system/components';
import { Bot, ChartArea, CircleCheck, CircleDollarSign, FileJson, FileSpreadsheet, Gauge, Layers, ListChecks, Server, Timer, TriangleAlert } from '@/theme/design-system/icons';
import { failureCauseLabel, failureDetailText, taskLabel, tierLabel } from '@/pages/local/plain-text';
import { causeLabelOf, useRunFilter } from '@/pages/local/run-filter';
import { Meter } from '@/theme/design-system/charts';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import { useModelColor, useModelIdentityStyle } from '@/components/dashboard/model-tiers';
import { fixed as fmtFixed, localeDate as fmtLocaleDate } from '@/theme/format';
import { CellTime, CopyButton, CostCell, FIRST_RUN_COMMAND, Readable, type Row, RunRef, type RunViewProps, age, asRecords, byRunTime, causeOf, causeTextOf, costOf, displayCauseOf, duration, failureDetailOf, indexBy, isMissing, modelOrUnknown, newestFirst, recorded, recordedTokens, runModelledCell, statusOf, tierOf, timeOf, tokensTitle, utcDay } from '@/pages/local/page-shared';
import { OutcomePill } from '@/pages/local/page-workflow';
import { RunChartsSlot, RunRoutingSlot } from '@/pages/local/page-headline';

/** OV-4: the newest run, its typed cause when it failed, and every figure typed when it is not served. */
export function LastRunCard({ decisions, sessions, now = Date.now(), compact = false }: RunViewProps & { compact?: boolean }) {
  const modelIdentityStyle = useModelIdentityStyle();
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
      <FactList className="local-latest-primary">
        {fields.filter(([label]) => ['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
          .map(([label, value]) => <Fact key={label} term={<><FieldIcon label={label} value={label === 'Status' ? status : value} />{label}</>} data-field={label} data-field-tone={fieldTone(label, label === 'Status' ? status : value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined} valueProps={{ 'data-failure-cause': label === 'Cause' ? causeOf(last) : undefined }}>{compact && label === 'Cause' && typeof value === 'string' && value.length > 120
            ? <details className="local-run-cause"><summary><ChevronRight size={12} aria-hidden="true" /><span>{value.slice(0, 120)}…</span></summary><p>{value}</p></details>
            : value}</Fact>)}
      </FactList>
      <details className="local-run-more">
        <summary>Execution details</summary>
        <FactList>
          {fields.filter(([label]) => !['Status', 'Cause', 'Model', 'Age', 'Run', 'Duration', 'Cost'].includes(label))
            .map(([label, value]) => <Fact term={<><FieldIcon label={label} value={value} />{label}</>} key={label} data-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined} valueTitle={label === 'Tokens in' ? tokensTitle(last.tokens_input, 'in') : label === 'Tokens out' ? tokensTitle(last.tokens_output, 'out') : undefined}>{value}</Fact>)}
        </FactList>
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
export function OverviewRunPreview({ decisions, sessions, now = Date.now() }: RunViewProps) {
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
      {recent.length === 0 && <EmptyState>No runs match this filter</EmptyState>}
      <DataTable fit className={`local-recent-runs-wrap${showAllFields ? ' local-recent-runs-wrap--all' : ''}`} region="Recent run fields" id={tableId}>
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
              <td data-label="Tokens in" data-field-tone="tokens-in" data-field-unavailable={isMissing(decision.tokens_input)} title={tokensTitle(decision.tokens_input, 'in')}><span className="local-recent-value">{recordedTokens(decision.tokens_input)}</span></td>
              <td data-label="Tokens out" data-field-tone="tokens-out" data-field-unavailable={isMissing(decision.tokens_output)} title={tokensTitle(decision.tokens_output, 'out')}><span className="local-recent-value">{recordedTokens(decision.tokens_output)}</span></td>
              <td data-label="Basis"><span className="local-recent-value">{recorded(session?.usage_source)}</span></td>
              <td data-label="Route tier"><span className="local-recent-value">{tierOf(decision)}</span></td>
              <td data-label="Quality score"><span className="local-recent-value">{recorded(decision.actual_score)}</span></td>
            </tr>;
          })}</tbody>
      </DataTable>
      <p className="local-dashboard-caption local-recent-footer"><span>Ten most recent runs</span><Link href={PAGE_PATHS['local-runs']}>View all runs <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    </>
  );
}

/** RU-4: the typed empty state names the one command that makes the first run. */
export function NoRunsYet() {
  return (
    <EmptyState as="div">
      <p>No runs yet</p>
      <p>Make the first run with <code>{FIRST_RUN_COMMAND}</code> <CopyButton text={FIRST_RUN_COMMAND} label="Copy the first-run command" /></p>
    </EmptyState>
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

/**
 * A host such as generativelanguage.googleapis.com wraps after a dot inside its standard-width column (OMN-20759's fit
 * check found it 276px wide in a 150px column); the text is unchanged, only line-break opportunities are added. Model
 * names use breakableName, which does not break at dots ("Qwen3.8-27B").
 */
function breakableHost(host: string): ReactNode[] {
  return host.split(/(?<=\.)/).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

/** A row whose served data_source names anything but real data is fixture data (FR-2). */
function isFixture(decision: Row): boolean {
  return typeof decision.data_source === 'string' && decision.data_source !== '' && decision.data_source !== 'real';
}

/**
 * OMN-21166 part 10 AC58: a passed run has no failure cause; its cell reads a dash with an accessible "No failure",
 * never the word "None". The cause filter keeps its "None" option, which names the served value.
 */
function NoFailure() {
  return <span className="local-runs-cause" data-failure-cause="none" aria-label="No failure" title="No failure">—</span>;
}

/**
 * A row's time as its day and the served clock (HH:MM). Every row carries its day (Jonah 2026-11-06: "Only the first time
 * column has a date"); a rule above a day's first run still groups the days. The exact served time stays in the title and
 * datetime. Any other form is shown as served.
 */
function RunTimeCell({ value }: { value: unknown }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const text = String(value);
  const readable = readableTime(text);
  const clock = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(text)?.[1];
  if (readable === null || clock === undefined) return <>{readable ?? text}</>;
  const [day, rest] = readable.split(', ') as [string, string];
  const zone = rest.split(' ').slice(1).join(' ');
  // OMN-21166 R-A: the exact served text is the element's datetime and title.
  return <time className="local-cell-time local-run-time" dateTime={text} title={text}>
    <span className="local-run-day">{day}</span>
    <span className="local-run-clock">{zone === 'UTC' ? clock : `${clock} ${zone}`}</span>
  </time>;
}

/** The UTC (or served-offset) calendar day of a served timestamp, for grouping rows by day; null when it has none. */
function runDayKey(value: unknown): string | null {
  return isMissing(value) ? null : /^(\d{4}-\d{2}-\d{2})T/.exec(String(value))?.[1] ?? null;
}

/**
 * Run table items 5 and 9 (Lakshman 2026-11-05): a routing value shown only when it is the exception. The usual value
 * (finish reason stop, no escalation) is a quiet dash that names it in its title; a value not served still says so.
 */
function QuietUnlessUnusual({ value, usual, usualText }: { value: unknown; usual: (text: string) => boolean; usualText: string }) {
  if (isMissing(value)) return <>{recorded(value)}</>;
  const text = String(value);
  return usual(text) ? <span className="local-run-quiet" title={usualText}>—</span> : <span className="local-run-unusual">{text}</span>;
}


/**
 * Lakshman 2026-11-05 ("instead of extra text when user hover to failed he can see the reason"): a failed run's status
 * pill shows its cause and the whole failure detail in a tooltip, on hover and on keyboard focus. The cause stays on the
 * row for assistive tech and the cause filter (visually hidden, with the whole detail as its title), so nothing served
 * is dropped (OMN-19919 AC5, OMN-21166 AC27 P3).
 */
function FailedStatus({ run }: { run: Row }) {
  const rawCause = causeOf(run);
  const cause = displayCauseOf(run);
  const detail = failureDetailText(failureDetailOf(run) ?? cause);
  const tip = <span className="local-run-failure-tip"><strong>{cause}</strong>{detail !== cause && <span>{detail}</span>}</span>;
  return <>
    <span className="local-runs-tip" data-field-tone="failures">
      <Tooltip side="bottom" text={tip}>
        <span className="local-run-status-trigger" tabIndex={0}><OutcomePill value={statusOf(run)} /></span>
      </Tooltip>
    </span>
    <span className="local-visually-hidden"><span className="local-runs-cause" data-failure-cause={rawCause} title={detail}>{cause}</span></span>
  </>;
}

/**
 * RU-1: every served run with its status, cause and cost, filtered by status, cause, model, backend and window,
 * paged. The backend is the served backend_id; a run served without one is filtered as Not recorded. No
 * per-run saving or baseline price: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RunsTable({ decisions, sessions, now = Date.now(), pageSize = 25, syncUrl = false, truncated = false }: RunsTableProps) {
  const chartsSlot = useContext(RunChartsSlot);
  const routingSlot = useContext(RunRoutingSlot);
  const id = useId();
  // OMN-21166 AC27: the table opens on its primary fields; every one of the 18 stays in the page, one switch away.
  const [showAllFields, setShowAllFields] = useState(false);
  // Part 30 AC206: the routing fields as columns beside model, backend and tier.
  const [showRouting, setShowRouting] = useState(false);
  const modelColorOf = useModelColor();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [localView, setLocalView] = useState<RunsViewState>(DEFAULT_RUNS_VIEW);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const view = syncUrl ? readRunsSearch(search) : localView;
  const { status, cause, model, backend, tier = 'all', span, day = '', task = 'all', query = '' } = view;
  const pageIndex = view.page - 1;
  const bySession = indexBy(sessions, 'session_id');
  // Lakshman 2026-11-07 (live lab: a Nov 5 15:32 run listed among Nov 7 05:47 runs): the table orders runs by the time
  // its Time column shows, the run's created_at, newest first. The served page is still the newest by written_at; a run
  // re-written later keeps its own place in the day it ran.
  const runs = byRunTime(decisions);
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
  const modelWidth = runModelColumnWidth(page);
  const fixedWidth = (concept: string) => (concept === 'model' ? modelWidth : RUN_COLUMN_WIDTHS[concept]!);
  // The operator, 2026-11-10 ("in column why gap - make it dynamic"): the table fills its panel with a fixed layout, which
  // stretched every column by the same factor (Model 160 px drew 269 px at 1920). Each column now keeps its own width and
  // only the last shown column (Duration, or Score with every field shown) takes the room left, after the last value.
  // A fixed layout spreads any width it has left over every column, so the last column is given exactly what is left:
  // its own width, or the panel's width less the other shown columns when that is more.
  const lastColumn = showAllFields ? 'score' : 'duration';
  const shownNow = [...RUN_DEFAULT_COLUMNS, ...(showAllFields ? RUN_EXTRA_COLUMNS : []), ...(showRouting ? RUN_ROUTING_COLUMNS : [])];
  const othersWidth = shownNow.filter(concept => concept !== lastColumn).reduce((sum, concept) => sum + fixedWidth(concept), 0);
  const columnWidth = (concept: string) => (concept === lastColumn
    ? `max(${fixedWidth(concept)}px, calc(100% - ${othersWidth}px))` : fixedWidth(concept));
  const canonicalSearch = writeRunsSearch(search, { ...view, page: current + 1 });
  // OMN-23309: useSearch reads whichever page is current, so a Runs table still mounted while the user leaves would
  // send them back to /runs. The table canonicalises the URL only while the path is /runs.
  useEffect(() => {
    if (syncUrl && location === '/runs' && canonicalSearch !== search.replace(/^\?/, '')) {
      navigate(`/runs${canonicalSearch ? `?${canonicalSearch}` : ''}`, { replace: true });
    }
  }, [canonicalSearch, location, navigate, search, syncUrl]);
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
  const weekLabel = (value: string) => value === today ? `Today ${value}` : `${fmtLocaleDate(new Date(`${value}T00:00:00Z`), 'en-US', { weekday: 'short', timeZone: 'UTC' })} ${value}`;
  // OMN-21166 AC75: a sortable header names its order for assistive tech; the first click puts the largest or newest
  // first, the next reverses it.
  // Lakshman 2026-11-04, "all should be in different color and different icons": each column header carries its
  // concept's own glyph in that concept's colour (the same pair the concept draws on every other page).
  const headIcon = (concept: string, label: string) => <ConceptIcon concept={concept} label={label} size={13} />;
  // Lakshman 2026-11-05 ("in all columns add a tooltip so that when we hover it should tell about that column"): each header
  // explains its column on hover and on keyboard focus (the kit Tooltip), from RUN_COLUMN_TIPS.
  const plainHeader = (concept: string, label: string, extra = false) => <th data-column={concept} data-extra={extra ? '' : undefined} style={{ width: columnWidth(concept) }}>
    <span className="local-runs-tip" data-field-tone={concept}><Tooltip text={RUN_COLUMN_TIPS[concept] ?? label} side="bottom"><span className="local-runs-head" tabIndex={0}>{headIcon(concept, label)}{label}</span></Tooltip></span>
  </th>;
  const sortHeader = (key: RunSortKey, label: string, concept: string) => {
    const active = view.sort === key;
    const direction = active ? view.dir ?? 'desc' : null;
    return <th data-column={concept} style={{ width: columnWidth(concept) }} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
      <span className="local-runs-tip" data-field-tone={concept}><Tooltip text={RUN_COLUMN_TIPS[concept] ?? label} side="bottom">
      <button type="button" className="local-sort-header" data-sort-active={active ? '' : undefined}
        onClick={() => updateView({ sort: key, dir: active && direction === 'desc' ? 'asc' : 'desc', page: 1 })}>
        {headIcon(concept, label)}{label}{/* Only a sorted column draws its arrow: an empty one still took the button's gap, so the label sat 6px
          short of its column's right-aligned figures (Lakshman 2026-11-05, "alignment of column and data is bad"). */}
        {direction && <span aria-hidden="true">{direction === 'asc' ? ' ↑' : ' ↓'}</span>}
      </button>
      </Tooltip></span>
    </th>;
  };
  // OMN-21166 AC76: every row the search and filters match, across all pages and in the shown order, as served.
  // Lakshman 2026-11-04: an export asks first, so a mistaken click downloads nothing.
  const [pendingExport, setPendingExport] = useState<'csv' | 'json' | null>(null);
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
          : `${formatDashboardCount(week.reduce((sum, item) => sum + item.runs, 0))} ${truncated ? 'runs in the latest returned rows' : 'runs served this week'} · by created day (UTC)`}</p>
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
          autoComplete="off" spellCheck={false} onChange={event => updateView({ query: event.target.value, page: 1 }, true)} />
      </div>
      {/* OMN-22168 (Lakshman 2026-11-04, "dropdown should be modern and colourful, use lucide icons too"): each filter is
          the kit Dropdown with its own glyph and colour; options carry the status, tier and model colours and task icons. */}
      <div className="local-dashboard-filters">
        <div className="local-filter-field">
        <Dropdown id={`${id}-task`} label="Task" value={task} icon={<ListChecks size={15} />} tone="var(--ds-field-task)"
          onChange={value => updateView({ task: value, page: 1 })}
          options={[{ value: 'all', label: 'All tasks' }, ...tasks.map(name => ({ value: name,
            label: `${taskLabel(name)} (${formatDashboardCount(taskFacetRuns.filter(run => recorded(run.task_type) === name).length)})`,
            icon: <TaskIcon task={name} /> }))]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-status`} label="Status" value={status} icon={<CircleCheck size={15} />} tone="var(--ds-field-pass)"
          onChange={value => filter('status')({ target: { value } })}
          options={[{ value: 'all', label: 'All statuses' },
            { value: 'passed', label: 'passed', tone: 'var(--ds-field-pass)' },
            { value: 'failed', label: 'failed', tone: 'var(--ds-field-fail)' },
            { value: 'Not recorded', label: 'Not recorded', tone: 'var(--ds-ink-3)' }]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-cause`} label="Cause" value={cause} icon={<TriangleAlert size={15} />} tone="var(--ds-field-failures)"
          onChange={value => filter('cause')({ target: { value } })}
          options={[{ value: 'all', label: 'All causes' },
            ...(cause !== 'all' && !causes.includes(cause) ? [{ value: cause, label: `${failureCauseLabel(cause)} (not in current data)` }] : []),
            ...causes.map(name => ({ value: name, label: failureCauseLabel(name), tone: 'var(--ds-field-failures)' }))]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-model`} label="Model" value={model} icon={<Bot size={15} />} tone="var(--ds-field-model)"
          onChange={value => filter('model')({ target: { value } })}
          options={[{ value: 'all', label: 'All models' },
            ...(model !== 'all' && !models.includes(model) ? [{ value: model, label: `${model} (not in current data)` }] : []),
            ...models.map(name => ({ value: name, label: name, tone: modelColorOf(name) }))]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-tier`} label="Tier" value={tier} icon={<Layers size={15} />} tone="var(--ds-field-tier)"
          onChange={value => filter('tier')({ target: { value } })}
          options={[{ value: 'all', label: 'All tiers' },
            ...(tier !== 'all' && !tiers.includes(tier) ? [{ value: tier, label: `${tierLabel(tier)} (not in current data)` }] : []),
            ...tiers.map(name => ({ value: name, label: tierLabel(name), tone: tierColor(name) }))]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-backend`} label="Backend" value={backend} icon={<Server size={15} />} tone="var(--ds-field-backend)"
          onChange={value => filter('backend')({ target: { value } })}
          options={[{ value: 'all', label: 'All backends' },
            ...(backend !== 'all' && !backends.includes(backend) ? [{ value: backend, label: `${backend} (not in current data)` }] : []),
            ...backends.map(name => ({ value: name, label: name, icon: <Server size={15} />, tone: 'var(--ds-field-backend)' }))]} />
        </div>
        <div className="local-filter-field">
        <Dropdown id={`${id}-window`} label="Window" value={span} icon={<CalendarDays size={15} />} tone="var(--ds-field-activity)"
          onChange={value => filter('span')({ target: { value } })}
          options={[{ value: 'all', label: 'All time' }, { value: 'today', label: 'Today (UTC)', icon: <CalendarDays size={15} />, tone: 'var(--ds-field-activity)' }]} />
        </div>
        {filtered && (
          <button type="button" className="local-filter-clear" onClick={() => { setSelectedRunId(null); updateView({ ...DEFAULT_RUNS_VIEW, query: '', day: '', task: 'all', tier: 'all' }); }}>Clear filters</button>
        )}
      </div>
      </div>
      {/* Lakshman 2026-11-04: the scope line ("N recent runs returned; earlier history is not included") and the totals
          line under it are removed from Runs; the pager below still counts the matching runs. */}
      {routingSlot && createPortal(<RoutingAnalysis rows={runs} complete={!truncated} />, routingSlot)}
      {shown.length === 0 ? <EmptyState>No runs match these filters</EmptyState> : (
        <>
          <div className={`local-runs-list-detail${selectedRun ? ' local-runs-list-detail--selected' : ''}`}>
            <div className="local-runs-table-column">
          <h3 className="local-visually-hidden" data-page-heading tabIndex={-1}>Run list</h3>
          {/* Lakshman 2026-11-04: each view switch has an info icon beside it that says, on hover or keyboard focus, what
              the switch adds to the table. */}
          <p className="local-dashboard-caption local-recent-toolbar"><span className="local-recent-switch"><label>
            <input type="checkbox" data-identity-decoration="switch" checked={showAllFields} onChange={event => setShowAllFields(event.target.checked)} aria-controls={`${id}-table`} />
            Show all run fields
          </label><InfoTip side="bottom" label="About Show all run fields" text={RUN_FIELDS_TIP} /></span>
          <span className="local-recent-switch"><label>
            <input type="checkbox" data-identity-decoration="switch" checked={showRouting} onChange={event => setShowRouting(event.target.checked)} aria-controls={`${id}-table`} />
            Routing columns
          </label><InfoTip side="bottom" label="About Routing columns" text={ROUTING_COLUMNS_TIP} /></span>
          <span className="local-runs-export" role="group" aria-label="Export the matching runs">
            <button type="button" data-export="csv" onClick={() => setPendingExport('csv')}><FileSpreadsheet size={15} aria-hidden="true" />Export CSV</button>
            <button type="button" data-export="json" onClick={() => setPendingExport('json')}><FileJson size={15} aria-hidden="true" />Export JSON</button>
          </span></p>
          <ConfirmDialog open={pendingExport !== null} tone={pendingExport === 'json' ? 'purple' : 'green'}
            icon={pendingExport === 'json' ? <FileJson size={16} /> : <FileSpreadsheet size={16} />}
            title={`Download ${formatDashboardCount(shown.length)} ${shown.length === 1 ? 'run' : 'runs'} as ${pendingExport === 'json' ? 'JSON' : 'CSV'}?`}
            confirmLabel={`Download ${pendingExport === 'json' ? 'JSON' : 'CSV'}`}
            onCancel={() => setPendingExport(null)}
            onConfirm={() => { const format = pendingExport; setPendingExport(null); if (format) exportRuns(format); }}>
            <p>The file holds the runs that match the current search and filters, every field of each.</p>
          </ConfirmDialog>
          {/* Lakshman 2026-11-05 ("do all 12"): the run list opens on eight columns (run, time, status with its cause, model,
              tokens, cost, saving, duration); "Show all run fields" adds backend, host, task type, route tier and quality score,
              and "Routing columns" adds requested model, finish reason and escalations (the last two shown only when unusual). OMN-21166 AC27 P2: every
              field stays in the page in either view; the all-fields columns (data-extra) are drawn always and hidden by the
              layout until the switch is on, and that view also lists baseline model, basis and tokens to compliance. */}
          {(() => {
            const baselineOf = (run: Row) => (isMissing(run.savings_baseline_model) ? bySession.get(String(run.correlation_id))?.baseline_model : run.savings_baseline_model);
            const baselines = new Set(page.map(baselineOf).filter(value => !isMissing(value)).map(String));
            const sharedBaseline = baselines.size === 1 ? [...baselines][0]! : null;
            const byDay = !view.sort || view.sort === 'created';
            const shownColumns = [...RUN_DEFAULT_COLUMNS, ...(showAllFields ? RUN_EXTRA_COLUMNS : []), ...(showRouting ? RUN_ROUTING_COLUMNS : [])];
            // The table is as wide as its panel, or its columns when they need more. Its own width (not a min-width that
            // forces it wider) lets the browser give the room left to the one column with no width, not to every column.
            const tableWidth = shownColumns.reduce((sum, concept) => sum + fixedWidth(concept), 0);
            return <DataTable fit className={`local-runs-wrap${showAllFields ? ' local-runs-wrap--all' : ''}${showRouting ? ' local-runs-wrap--routing' : ''}`} id={`${id}-table`} style={{ '--runs-table-width': `max(100%, ${tableWidth}px)` } as CSSProperties}>
              <thead>
                <tr>
                  {plainHeader('identity', 'Run')}{sortHeader('created', 'Time', 'age')}{plainHeader('run-outcome', 'Status')}
                  {plainHeader('model', 'Model')}{plainHeader('backend', 'Backend', true)}
                  {/* OMN-21166 AC206 D10: Routing columns adds requested model, finish reason and escalations. */}
                  {showRouting && <>{plainHeader('routing-model', 'Requested model')}{plainHeader('completion', 'Finish reason')}{plainHeader('escalated', 'Escalations')}</>}
                  {plainHeader('host', 'Host', true)}
                  {plainHeader('tokens', 'Tokens')}{sortHeader('cost', 'Cost', 'cost')}
                  {/* The shared baseline is named in the header's tooltip and accessible name, not on the page. */}
                  <th data-column="savings" style={{ width: RUN_COLUMN_WIDTHS.savings }} aria-label={sharedBaseline ? `Saving vs ${sharedBaseline}` : undefined}>
                    <span className="local-runs-tip" data-field-tone="savings"><Tooltip side="bottom" text={sharedBaseline
                      ? `Modelled saving vs ${sharedBaseline}: what the run's tokens would cost at ${sharedBaseline}'s prices, less what the run cost. ${sharedBaseline} never ran.`
                      : RUN_COLUMN_TIPS.savings!}>
                      <span className="local-runs-head" tabIndex={0}>{headIcon('savings', 'Saving')}Saving</span>
                    </Tooltip></span>
                  </th>
                  {plainHeader('baseline', 'Baseline model', true)}{plainHeader('basis', 'Basis', true)}
                  {sortHeader('duration', 'Duration', 'duration')}
                  {plainHeader('task', 'Task type', true)}{plainHeader('tokens-completion', 'Tokens to compliance', true)}
                  {plainHeader('tier', 'Route tier', true)}{plainHeader('score', 'Quality score', true)}
                </tr>
              </thead>
              <tbody>{page.map((run, index) => {
                const session = bySession.get(String(run.correlation_id));
                const dayKey = runDayKey(run.created_at);
                const dayStart = index === 0 || dayKey !== runDayKey(page[index - 1]!.created_at);
                const requested = isMissing(run.requested_model) ? null : String(run.requested_model);
                const answered = modelOrUnknown(run.model_name);
                const basis = session?.usage_source;
                const saving = runModelledCell(run, sharedBaseline === null);
                const score = Number(run.actual_score);
                return <tr key={String(run.correlation_id ?? index)} tabIndex={0} aria-selected={selectedRunId !== null && selectedRunId === run.correlation_id}
                  data-day-start={byDay && dayStart ? '' : undefined}
                  onClick={event => { if ((event.target as HTMLElement).closest('a, button, input, select, summary')) return; setSelectedRunId(String(run.correlation_id ?? '')); }}
                  onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !(event.target as HTMLElement).closest('a, button, input, select, summary')) { event.preventDefault(); setSelectedRunId(String(run.correlation_id ?? '')); } }}>
                  <td data-label="Run" className="local-dashboard-cell-token">
                    {/* WF-3: a run opens its own path on Workflow; a run with no recorded id has nothing to open. */}
                    <RunRef id={run.correlation_id} short />
                    {isFixture(run) && <Badge>fixture</Badge>}
                  </td>
                  <td data-label="Time" className="local-dashboard-cell-token local-dashboard-cell-time"><RunTimeCell value={run.created_at} /></td>
                  {/* Item 10: the status; on a run that failed, its cause and failure detail are the pill's tooltip. */}
                  <td data-label="Status" className="local-run-status-cell">{causeOf(run) !== 'none' ? <FailedStatus run={run} /> : <OutcomePill value={statusOf(run)} />}</td>
                  {/* A run's model sets that filter, as the selects above do. Item 3: a run answered by another model than it
                      asked for names the requested one before it. */}
                  <td data-label="Model" className="local-dashboard-cell-token">
                    {requested !== null && requested !== answered && <span className="local-run-requested" title={`Requested ${requested}, answered by ${answered}`}>{requested} →</span>}
                    <button type="button" className="local-cell-filter local-run-model" aria-label={`Show only runs of model ${answered}`} onClick={() => updateView({ model: answered, page: 1 })}>
                      {breakableName(answered)}
                    </button>
                  </td>
                  <td data-label="Backend" className="local-dashboard-cell-token" data-extra="">
                    <button type="button" className="local-cell-filter" aria-label={`Show only runs of backend ${recorded(run.backend_id)}`} onClick={() => updateView({ backend: recorded(run.backend_id), page: 1 })}>
                      {breakableName(recorded(run.backend_id))}
                    </button>
                  </td>
                  {showRouting && <>
                    <td data-label="Requested model" className="local-dashboard-cell-token" data-cell="requested-model">{recorded(run.requested_model)}</td>
                    <td data-label="Finish reason" data-cell="finish-reason"><QuietUnlessUnusual value={run.finish_reason} usual={text => text === 'stop'} usualText="Finished normally (stop)" /></td>
                    <td data-label="Escalations" data-cell="escalations" data-num=""><QuietUnlessUnusual value={run.escalation_count} usual={text => Number(text) === 0} usualText="No escalation" /></td>
                  </>}
                  <td data-label="Host" className="local-dashboard-cell-token" data-extra="">{breakableHost(recorded(run.host))}</td>
                  {/* Item 4: tokens in and out in one cell; their total is the two added, so it is not a column of its own. */}
                  <td data-label="Tokens" data-num="" title={`${tokensTitle(run.tokens_input, 'in') ?? 'Tokens in not recorded'}, ${tokensTitle(run.tokens_output, 'out') ?? 'tokens out not recorded'}`}>
                    {isMissing(run.tokens_input) && isMissing(run.tokens_output) ? 'Not recorded'
                      : <><span data-field-tone="tokens-in" data-field-unavailable={isMissing(run.tokens_input)}>{recordedTokens(run.tokens_input)}</span><span className="local-run-quiet"> / </span><span data-field-tone="tokens-out" data-field-unavailable={isMissing(run.tokens_output)}>{recordedTokens(run.tokens_output)}</span></>}
                  </td>
                  <td data-label="Cost" data-num=""><CostCell session={session} run={run} /></td>
                  {/* Items 1 and 2: the baseline is named once in the header when the rows share it; a basis other than
                      measured is a tag beside the figure. */}
                  {/* Lakshman 2026-11-07: an unmeasured saving reads "Not measured" on one line, muted; the reason is its
                      tooltip and stays in the cell's text for assistive tech, so the row keeps one line's height. */}
                  <td data-label={sharedBaseline ? `Saving vs ${sharedBaseline}` : 'Saving'} data-num="" data-unmeasured={saving.startsWith('Not measured') ? '' : undefined}
                    title={saving.startsWith('Not measured: ') ? saving : undefined}>{saving.startsWith('Not measured: ')
                      ? <>Not measured<span className="local-visually-hidden">{saving.slice('Not measured'.length)}</span></> : saving}{!isMissing(basis) && String(basis) !== 'measured' && !saving.startsWith('Not measured') && <span className="local-run-tag">{String(basis)}</span>}</td>
                  <td data-label="Baseline model" className="local-dashboard-cell-token" data-extra="">{recorded(baselineOf(run))}</td>
                  <td data-label="Basis" data-extra="">{recorded(basis)}</td>
                  <td data-label="Duration" data-num="" title={exactMs(run.latency_ms)}>{duration(run.latency_ms)}</td>
                  <td data-label="Task type" data-extra="">{isMissing(run.task_type) ? recorded(run.task_type) : <span className="local-task-cell"><TaskIcon task={String(run.task_type)} />{taskLabel(run.task_type)}</span>}</td>
                  <td data-label="Tokens to compliance" data-extra="" data-num="" title={tokensTitle(run.tokens_to_compliance)}>{recordedTokens(run.tokens_to_compliance)}</td>
                  <td data-label="Route tier" data-extra="">{tierOf(run)}</td>
                  {/* Item 7: one form for every score, two decimals; the served value is in the title. */}
                  <td data-label="Quality score" data-extra="" data-num="" title={recorded(run.actual_score)}>{isMissing(run.actual_score) || !Number.isFinite(score) ? recorded(run.actual_score) : fmtFixed(score, 2)}</td>
                </tr>;
              })}</tbody>
          </DataTable>;
          })()}
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
            <FactList>
              <Fact term="Task">{isMissing(selectedRun.task_type) ? recorded(selectedRun.task_type) : taskLabel(selectedRun.task_type)}</Fact>
              <Fact term="Cause"><span className="local-runs-cause" data-failure-cause={causeOf(selectedRun)} title={causeTextOf(selectedRun)}>{causeTextOf(selectedRun)}</span></Fact>
              <Fact term="Model">{modelOrUnknown(selectedRun.model_name)}</Fact>
              <Fact term="Route tier">{tierOf(selectedRun)}</Fact>
              <Fact term="Duration">{duration(selectedRun.latency_ms)}</Fact>
              <Fact term="Cost">{costOf(selectedSession, selectedRun)}</Fact>
              <Fact term="Tokens in" data-field-tone="tokens-in" data-field-unavailable={isMissing(selectedRun.tokens_input)} valueTitle={tokensTitle(selectedRun.tokens_input, 'in')}>{recordedTokens(selectedRun.tokens_input)}</Fact>
              <Fact term="Tokens out" data-field-tone="tokens-out" data-field-unavailable={isMissing(selectedRun.tokens_output)} valueTitle={tokensTitle(selectedRun.tokens_output, 'out')}>{recordedTokens(selectedRun.tokens_output)}</Fact>
              <Fact term="Modelled saving">{runModelledCell(selectedRun)}</Fact>
              <Fact term="Quality score">{recorded(selectedRun.actual_score)}
                <Meter kind="selected-quality" label="Quality score versus required bar" min={0} max={1} now={selectedScore}
                  valueText={`Quality score ${recorded(selectedRun.actual_score)}; required bar ${recorded(selectedRun.required_bar)}`}
                  share={selectedScore} mark={Number.isFinite(selectedRequiredBar) ? selectedRequiredBar : null} />
              </Fact>
              <Fact term="Required bar">{isMissing(selectedRun.required_bar) ? 'bar not recorded' : recorded(selectedRun.required_bar)}</Fact>
            </FactList>
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
            <Panel className="local-run-charts-panel" aria-label="Run charts">
              <PanelTitle data-page-heading tabIndex={-1}><ConceptIcon concept="duration" label="Run charts" size={16} />Run charts</PanelTitle>
              {/* Lakshman 2026-11-05 ("in runs page many bar graph use tab and full page"): the five run charts are one
                  full-width row of tabs, one big chart at a time, as on Overview; the chosen tab is kept in the address
                  (?runchart=). Each hint counts the listed runs that served that chart's value, never a computed figure. */}
              {(() => {
                const served = (value: unknown) => (typeof value === 'number' || typeof value === 'string')
                  && String(value).trim() !== '' && Number.isFinite(Number(value));
                const of = (count: number) => `${formatDashboardCount(count)} of ${formatDashboardCount(listed.length)} runs`;
                const weekRuns = week.reduce((sum, item) => sum + item.runs, 0);
                return <DashboardTabs label="Run charts" param="runchart" tabs={[
                  { id: 'duration', label: 'Duration per run', tone: 'var(--ds-field-duration)', icon: <Timer size={18} />,
                    hint: of(listed.filter(run => served(run.duration)).length),
                    panel: () => <div className="local-run-charts"><RunDurationChart runs={listed} onOpen={openRun} /></div> },
                  { id: 'tokens', label: 'Tokens per run', tone: 'var(--ds-field-tokens)', icon: <ChartArea size={18} />,
                    hint: of(listed.filter(run => served(run.tokensIn) || served(run.tokensOut)).length),
                    panel: () => <div className="local-run-charts"><RunTokensChart runs={listed} onOpen={openRun} /></div> },
                  { id: 'cost', label: 'Cost per run', tone: 'var(--ds-field-cost)', icon: <CircleDollarSign size={18} />,
                    hint: of(listed.filter(run => served(run.cost)).length),
                    panel: () => <div className="local-run-charts"><RunMetricChart runs={listed} onOpen={openRun} metric="cost" /></div> },
                  { id: 'score', label: 'Quality score per run', tone: 'var(--ds-field-score)', icon: <Gauge size={18} />,
                    hint: of(listed.filter(run => served(run.score)).length),
                    panel: () => <div className="local-run-charts"><RunMetricChart runs={listed} onOpen={openRun} metric="score" /></div> },
                  { id: 'week', label: 'This week', tone: 'var(--ds-field-runs-daily)', icon: <CalendarDays size={18} />,
                    hint: truncated ? `Latest ${formatDashboardCount(weekRuns)} runs` : `${formatDashboardCount(weekRuns)} runs`, panel: () => weekChart },
                ]} />;
              })()}
            </Panel>)}
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
  if (!row) return <EmptyState>No quality checks served yet</EmptyState>;
  return (
    <section aria-label="Quality">
      <PassRateMeter row={row} />
      <PassRateSparkline part="headline" />
      {/* OMN-21166 part 13: the daily line and the check counts are one click away, not in view on load. */}
      <div className="local-more local-more--open" data-section="More quality detail">
        <PassRateSparkline part="trend" />
        <FactList>
          {QUALITY_FIELDS.map(([label, field]) => <Fact term={<><FieldIcon label={label} />{label}</>} key={field} data-quality-field={field} data-field-tone={fieldTone(label)} data-field-unavailable={isUnavailableField(row[field])}><Readable value={row[field]} kind={field === 'overall_pass_rate' ? 'percent' : field.startsWith('avg_') ? 'decimal' : 'count'} /></Fact>)}
        </FactList>
      </div>
      <p className="local-dashboard-caption local-recent-footer"><Link href="/delegation-evidence">View delegation evidence <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    </section>
  );
}

/**
 * OMN-21015 AC2: a model's cost under its tier, as served (summed by the view). A group with no priced run is served
 * null and says how many runs were not measured, never $0; a priced group with some unpriced runs says so beside it.
 * A model served without its unmeasured count is never read as fully measured: the count is unknown, not zero.
 */
/**
 * Lakshman 2026-11-05 ("make it best", the tier breakdown): a tier-routed share as a meter, its fill the served share of
 * a full track, with the served percent beside it (Readable, which keeps the served value in its title).
 */
export function ShareMeter({ value }: { value: unknown }) {
  const share = Number(value);
  const width = isMissing(value) || !Number.isFinite(share) ? null : Math.min(Math.max(share, 0), 1);
  return <span className="local-share-cell">
    {width !== null && <span className="local-share-meter" aria-hidden="true"><i style={{ width: `${width * 100}%` }} /></span>}
    <Readable value={value} kind="percent" />
  </span>;
}

/** A model's cost in the tier table, in the run table's short muted form when it is a measured zero ("$0"). */
export function TierModelCostCell({ model }: { model: Row }) {
  const text = tierModelCost(model);
  return !isMissing(model.cost_usd) && Number(model.cost_usd) === 0 && /^\$0\.0+$/.test(text)
    ? <span className="local-cost-free" title={text}>{text.replace(/\.0+$/, '')}</span> : <>{text}</>;
}

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
/** What each Runs view switch adds to the run list, shown on hover and keyboard focus. */
/**
 * Lakshman 2026-11-05 ("use text wrap but make it standardized table"): one standard width per run table column, the
 * same on every page and in every view, never sized by the rows on show. Each is at least the field's longest
 * unbreakable word or figure, measured in Chrome, so text wraps inside its column and nothing spills. The table is laid
 * out fixed at the sum of the columns shown, and fills its panel when that is wider.
 */
// Duration 120 (its sort header measured 120px with the button's padding, 2026-11-05), taken from the model's 260.
// Jonah 2026-11-06 ("column wrapping when there is plenty of room between the other columns (model → tokens for example)"):
// the model column is at most 200px; a longer model name wraps at its joins (Lakshman 2026-11-08).
const RUN_COLUMN_WIDTHS: Readonly<Record<string, number>> = {
  identity: 120, age: 120, 'run-outcome': 96, model: 200, backend: 200, 'routing-model': 180, completion: 150,
  escalated: 136, host: 190, tokens: 110, cost: 90, savings: 130, baseline: 170, basis: 100, duration: 120, task: 150,
  'tokens-completion': 210, tier: 136, score: 150,
};
/**
 * Lakshman 2026-11-07 ("why gap?", live lab: Qwen3.8-27B left about 200px empty before Tokens in the fixed 330px column):
 * the Model column is as wide as the longest model name on the page of runs shown, so a page of short names leaves no
 * gap. Names are drawn in the monospace face, measured in Chrome at 7.8px a character, plus the cell's 24px of padding;
 * never under 160px. Lakshman 2026-11-08 ("wrap it and save column space"): never over 200px, the Backend column's
 * width, so a longer name wraps at its joins (breakableName) instead of widening the column; a short name still keeps
 * one line (Jonah 2026-11-06). Every other column keeps its standard width.
 */
const MODEL_CHAR_PX = 7.8;
const MODEL_CELL_PADDING_PX = 24;
const MODEL_COLUMN_MIN_PX = 160;
export function runModelColumnWidth(runs: readonly Row[]): number {
  // A run answered by another model than it asked for writes "<requested> →" on its own line above, so that line counts.
  const longest = Math.max(0, ...runs.flatMap(run => {
    const answered = modelOrUnknown(run.model_name);
    const requested = isMissing(run.requested_model) ? null : String(run.requested_model);
    return requested !== null && requested !== answered ? [answered.length, requested.length + 2] : [answered.length];
  }));
  const fit = Math.ceil(longest * MODEL_CHAR_PX) + MODEL_CELL_PADDING_PX;
  return Math.min(RUN_COLUMN_WIDTHS.model!, Math.max(MODEL_COLUMN_MIN_PX, fit));
}
const RUN_DEFAULT_COLUMNS = ['identity', 'age', 'run-outcome', 'model', 'tokens', 'cost', 'savings', 'duration'];
const RUN_EXTRA_COLUMNS = ['backend', 'host', 'baseline', 'basis', 'task', 'tokens-completion', 'tier', 'score'];
const RUN_ROUTING_COLUMNS = ['routing-model', 'completion', 'escalated'];

/** What each run table column holds, shown when its header is hovered or focused (keyed by the header's concept). */
const RUN_COLUMN_TIPS: Readonly<Record<string, string>> = {
  identity: 'The run\'s id. Click it to open the run\'s full path on Workflow.',
  age: 'When the run started, in UTC. Hover a time for the exact second. Click to sort.',
  'run-outcome': 'Whether the run passed or failed its quality gate. A failed run shows why under its status.',
  model: 'The model that answered. If it differs from the model the run asked for, the requested one is shown above it. Click a model to show only its runs.',
  backend: 'The route that served the run. Click one to show only its runs.',
  'routing-model': 'The model the run asked for, before routing. The Model column is the one that answered.',
  completion: 'Why the model stopped answering. A dash means it finished normally (stop).',
  escalated: 'How many times the run moved on to another model. A dash means none.',
  host: 'The address of the machine that served the run, as recorded.',
  tokens: 'Tokens sent to the model / tokens it returned, as recorded for the run.',
  cost: 'What the run cost. A grey $0 is a free local run. Click to sort.',
  savings: 'Modelled saving: what the run\'s tokens would cost at the baseline model\'s prices, less what the run cost. The baseline never ran.',
  duration: 'How long the run took, end to end. Click to sort.',
  task: 'The kind of work the run did.',
  tier: 'The cost tier the run was routed to.',
  score: 'The quality gate\'s score, from 0 to 1, to two decimals. Hover a score for the exact value.',
};

export const KEY_HEADERS: ReadonlyArray<readonly [string, string, string]> = [
  ['backend', 'Provider', 'The provider the key is for.'],
  ['credentials', 'Key ref', 'The name the key is stored under. The key itself is never shown.'],
  ['identity', 'Fingerprint', 'The first 8 hex characters of the key\'s SHA-256, to tell keys apart.'],
  ['age', 'Set', 'When the key was set, in UTC.'],
  ['last', 'Last used', 'When a run last used the key, in UTC.'],
  ['fail', 'Revoked', 'When the key was revoked, in UTC.'],
  ['threshold', 'Expires', 'When the key expires, if it was given an expiry.'],
  ['host', 'Bound host', 'The host the key is bound to, if any.'],
];

const RUN_FIELDS_TIP = 'Adds the backend, host, task type, route tier and quality score of each run. The table scrolls sideways; '
  + 'the Run column stays in place. Every other recorded field is in the selected run and the export.';
const ROUTING_COLUMNS_TIP = 'Adds why the model stopped answering (finish reason) and how many times it escalated to another model, '
  + 'drawn only when unusual. A run answered by another model than it asked for names the requested one in its Model cell.';
