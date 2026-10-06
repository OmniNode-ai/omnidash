import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { UsageByModelDayTable } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { TenantNotConfiguredState } from '@/components/dashboard/TenantNotConfiguredState';
import { subscribeLocalPageRefresh } from '@/services/local-page-refresh';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch, type RunsViewState } from '@/navigation/runs-url-state';
import '@/styles/local-dashboard.css';
import {
  loadLocalPageConfig,
  loadLocalPageSnapshots,
  rowsForLocalBinding,
  rowsForLocalComponent,
  resolveLocalPageEmptyState,
  withLastGood,
  METERING_SUMMARY_TOPIC,
  type BoundProjectionSnapshot,
  type LocalPageDocument,
  type LocalPageName,
} from '@/layout/local-page-loader';

interface LocalDashboardPageProps {
  pageName: LocalPageName;
  syncUrl?: boolean;
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
  const digits = config.precision ?? 0;
  const grouped = value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (config.format === 'currency') return `$${grouped}`;
  if (config.format === 'percent') return `${grouped}%`;
  return grouped;
}

interface MetricCardProps {
  component: LocalPageDocument['components'][number];
  config: MetricCardConfig;
  row: Record<string, unknown>;
  /** The served row of the component's second binding, rendered as a line under the figure. */
  caption?: Record<string, unknown> | null;
}

/**
 * The exposure a card without a served binding waits for. A page contract cannot carry free text, so the name a
 * typed "not served yet" state shows lives here, one entry per such card (requirements: an empty state names
 * what it waits on).
 */
const PENDING_SOURCES: Record<string, string> = {
  // US-3: bound once metering-summary.v1 is served (omnimarket#3368); its renderer is SavingsSeries.
  'usage-savings-series': 'metering-summary.v1',
};

/** AK-3: cloud keys are not linked in the local MVP; one line, no form. */
const CLOUD_NOT_LINKED = 'CLOUD_NOT_LINKED: cloud keys are not linked in the local runtime. There is nothing to set here.';

/** A component bound to no served exposure: what it waits on, never a blank panel (FR-3 partial pages, SV-3). */
export function PendingState({ componentId }: { componentId: string }) {
  if (componentId === 'api-keys-cloud') return <p className="local-dashboard-empty" role="status">{CLOUD_NOT_LINKED}</p>;
  return (
    <p className="local-dashboard-empty" role="status">
      {`Not served yet: waits on ${PENDING_SOURCES[componentId] ?? 'its exposure'}`}
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
export function MetricCard({ component, config, row, caption }: MetricCardProps) {
  if ((component.data_bindings ?? []).length === 0) {
    const source = PENDING_SOURCES[component.component_id] ?? 'its exposure';
    return <p className="local-dashboard-empty" role="status">{`Not served yet: waits on ${source}`}</p>;
  }
  const required = component.data_bindings?.[0]?.required_fields ?? [config.metric_key];
  const missing = [...new Set([config.metric_key, ...required])].filter((field) => isMissing(row[field]));
  let text: string;
  // No served row is not an unresolved baseline: nothing was measured (OMN-19980 AC2c).
  if (Object.keys(row).length === 0) text = 'Not measured';
  // A metering-summary.v1 row says so itself: an unpriced baseline leaves its saving null (OMN-19977 AC7). Only a
  // card that asks for baseline_state is priced at the baseline; spend, run counts and tokens are not (Amendment 2).
  else if (row.baseline_state === 'unresolved' && required.includes('baseline_state')) text = 'Baseline unresolved';
  else if (missing.some((field) => field.includes('baseline'))) text = 'Baseline unresolved';
  else if (missing.length > 0) text = 'Not measured';
  else text = formatMetric(Number(row[config.metric_key]), config);
  const line = captionText(caption);
  // A savings figure is a modelled counterfactual: served tokens priced at the baseline's list price, with no
  // baseline run behind it (Jonah's savings handoff on OMN-19981, aac9032d, item 5).
  const modelled = caption !== null && caption !== undefined && 'baseline_model' in caption;
  return (
    <>
      <p className="local-dashboard-metric">{text}</p>
      {line && <p className="local-dashboard-caption">{line}</p>}
      {modelled && <p className="local-dashboard-caption">{SAVINGS_MODELLED}</p>}
    </>
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

/**
 * OMN-19980 Step B: an Overview headline figure (Spend, Savings, Measured runs, Tokens in and out) from
 * metering-summary.v1's all-time row, the row `onex metering` renders. Every card picks the same row, so the four
 * figures cannot disagree (Amendment 2). The fold keys rows by baseline model and keeps an older baseline's rows, so
 * after a baseline change there are two all rows; the one refreshed last is the baseline the runtime resolves now,
 * because every refresh runs under the resolved baseline. Two refreshed at the same moment cannot be told apart and
 * are refused by name, never one picked silently. The Savings card's caption is that row's baseline model and pricing
 * manifest version; Measured runs' caption is that row's run classes.
 */
export function MeteringTotalCard({ component, config, rows }: {
  component: LocalPageDocument['components'][number];
  config: MetricCardConfig;
  rows: readonly unknown[];
}) {
  const all = asRecords(rows).filter((row) => row.window_kind === 'all');
  if (all.length === 0) return <p className="local-dashboard-metric">Not measured: no all-time row</p>;
  const newest = Math.max(...all.map((row) => timeOf(row.as_of)));
  const latest = all.filter((row) => timeOf(row.as_of) === newest);
  if (latest.length > 1) return <p className="local-dashboard-metric">{`Not measured: ${latest.length} baseline models`}</p>;
  const row = latest[0];
  if (config.metric_key === TOKENS_IN_AND_OUT) return <p className="local-dashboard-metric">{tokensText(row)}</p>;
  const required = component.data_bindings?.[0]?.required_fields ?? [];
  const caption = required.includes('baseline_model')
    ? { baseline_model: row.baseline_model, pricing_manifest_version: row.pricing_manifest_version }
    : required.includes('runs_total')
      ? { runs_total: row.runs_total, runs_unknown_tokens: row.runs_unknown_tokens, runs_unknown_spend: row.runs_unknown_spend }
      : null;
  return <MetricCard component={component} config={config} row={row} caption={caption} />;
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

/** A run's status is its served quality-gate verdict; a run with no served decision has none recorded. */
function statusOf(decision: Row | undefined): RunStatus {
  if (!decision || typeof decision.quality_gate_passed !== 'boolean') return 'Not recorded';
  return decision.quality_gate_passed ? 'passed' : 'failed';
}

/** A failed run's typed cause is the served quality_gate_detail (a provider 429, a timeout, a refused answer). */
function causeOf(decision: Row | undefined): string {
  const status = statusOf(decision);
  if (status === 'passed') return 'none';
  if (status === 'Not recorded' || isMissing(decision?.quality_gate_detail)) return 'Not recorded';
  return String(decision?.quality_gate_detail);
}

function recorded(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : String(value);
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

/** OV-4: the newest run, its typed cause when it failed, and every figure typed when it is not served. */
export function LastRunCard({ decisions, sessions, now = Date.now() }: RunViewProps) {
  const last = newestFirst(decisions)[0];
  if (!last) return <NoRunsYet />;
  const session = indexBy(sessions, 'session_id').get(String(last.correlation_id));
  const status = statusOf(last);
  const fields: Array<[string, string]> = [
    ['Status', status],
    ...(status === 'failed' ? [['Cause', causeOf(last)] as [string, string]] : []),
    ['Quality score', recorded(last.actual_score)],
    ['Run', recorded(last.correlation_id)],
    ['Model', modelOrUnknown(last.model_name)],
    // OMN-20162's columns: the backend and host of the attempt that accepted the run.
    ['Backend', recorded(last.backend_id)],
    ['Host', recorded(last.host)],
    ['Duration', duration(last.latency_ms)],
    ['Tokens in', recorded(last.tokens_input)],
    ['Tokens out', recorded(last.tokens_output)],
    ['Cost', recorded(session?.local_cost_usd)],
    ['Basis', recorded(session?.usage_source)],
    ['Task type', recorded(last.task_type)],
    ['Route tier', tierOf(last)],
    ['Age', age(last.written_at, now)],
  ];
  return (
    <section aria-label="Last run">
      <dl className="local-dashboard-fields">
        {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}

/**
 * OV-5: the ten newest runs, newest first, with the Runs page's run columns. A run shows its cost, never a per-run
 * saving: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RecentRunsTable({ decisions, sessions, now = Date.now() }: RunViewProps) {
  const bySession = indexBy(sessions, 'session_id');
  const recent = newestFirst(decisions).slice(0, 10);
  return (
    <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit">
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Age</th><th>Status</th><th>Cause</th><th>Task type</th><th>Model</th><th>Backend</th>
            <th>Host</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th><th>Basis</th><th>Duration</th>
            <th>Route tier</th><th>Quality score</th><th>Run</th>
          </tr>
        </thead>
        <tbody>{recent.map((decision, index) => {
          const session = bySession.get(String(decision.correlation_id));
          return <tr key={String(decision.correlation_id ?? index)}>
            <td className="local-dashboard-cell-token">{recorded(decision.written_at)}</td>
            <td>{age(decision.written_at, now)}</td>
            <td>{statusOf(decision)}</td>
            <td>{causeOf(decision)}</td>
            <td>{recorded(decision.task_type)}</td>
            <td>{modelOrUnknown(decision.model_name)}</td>
            <td>{recorded(decision.backend_id)}</td>
            <td>{recorded(decision.host)}</td>
            <td>{recorded(decision.tokens_input)}</td>
            <td>{recorded(decision.tokens_output)}</td>
            <td>{recorded(session?.local_cost_usd)}</td>
            <td>{recorded(session?.usage_source)}</td>
            <td>{duration(decision.latency_ms)}</td>
            <td>{tierOf(decision)}</td>
            <td>{recorded(decision.actual_score)}</td>
            <td className="local-dashboard-cell-token">{recorded(decision.correlation_id)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

/** RU-4: the typed empty state names the one command that makes the first run. */
export function NoRunsYet() {
  return (
    <div className="local-dashboard-empty" role="status">
      <p>No runs yet</p>
      <p>Make the first run with <code>{FIRST_RUN_COMMAND}</code></p>
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
}

/** A row whose served data_source names anything but real data is fixture data (FR-2). */
function isFixture(decision: Row): boolean {
  return typeof decision.data_source === 'string' && decision.data_source !== '' && decision.data_source !== 'real';
}

/**
 * RU-1: every served run with its status, cause and cost, filtered by status, cause, model and window, paged. No
 * per-run saving or baseline price: savings are window totals from metering-summary.v1 only (OMN-19980 AC2).
 */
export function RunsTable({ decisions, sessions, now = Date.now(), pageSize = 25, syncUrl = false }: RunsTableProps) {
  const id = useId();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [localView, setLocalView] = useState<RunsViewState>(DEFAULT_RUNS_VIEW);
  const view = syncUrl ? readRunsSearch(search) : localView;
  const { status, cause, model, span } = view;
  const pageIndex = view.page - 1;
  const bySession = indexBy(sessions, 'session_id');
  const runs = newestFirst(decisions);
  const models = [...new Set(runs.map((run) => modelOrUnknown(run.model_name)))].sort();
  const causes = [...new Set(runs.filter((run) => statusOf(run) === 'failed').map((run) => causeOf(run)))].sort();
  const today = utcDay(now);
  const shown = runs.filter((run) => (status === 'all' || statusOf(run) === status)
    && (cause === 'all' || causeOf(run) === cause)
    && (model === 'all' || modelOrUnknown(run.model_name) === model)
    && (span === 'all' || utcDay(timeOf(run.created_at)) === today));
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(pageIndex, pages - 1);
  const page = shown.slice(current * pageSize, (current + 1) * pageSize);
  const canonicalSearch = writeRunsSearch(search, { ...view, page: current + 1 });
  useEffect(() => {
    if (syncUrl && canonicalSearch !== search.replace(/^\?/, '')) {
      navigate(`/runs${canonicalSearch ? `?${canonicalSearch}` : ''}`, { replace: true });
    }
  }, [canonicalSearch, navigate, search, syncUrl]);
  const updateView = (change: Partial<RunsViewState>) => {
    const next = { ...view, ...change };
    if (syncUrl) {
      const query = writeRunsSearch(search, next);
      navigate(`/runs${query ? `?${query}` : ''}`);
    } else setLocalView(next);
  };
  const filter = (key: 'status' | 'cause' | 'model' | 'span') => (event: { target: { value: string } }) =>
    updateView({ [key]: event.target.value, page: 1 });
  return (
    <>
      <div className="local-dashboard-filters">
        <label htmlFor={`${id}-status`}>Status</label>
        <select id={`${id}-status`} value={status} onChange={filter('status')}>
          <option value="all">All</option>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="Not recorded">Not recorded</option>
        </select>
        <label htmlFor={`${id}-cause`}>Cause</label>
        <select id={`${id}-cause`} value={cause} onChange={filter('cause')}>
          <option value="all">All</option>
          {cause !== 'all' && !causes.includes(cause) && <option value={cause}>{cause} (not in current data)</option>}
          {causes.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <label htmlFor={`${id}-model`}>Model</label>
        <select id={`${id}-model`} value={model} onChange={filter('model')}>
          <option value="all">All</option>
          {model !== 'all' && !models.includes(model) && <option value={model}>{model} (not in current data)</option>}
          {models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <label htmlFor={`${id}-window`}>Window</label>
        <select id={`${id}-window`} value={span} onChange={filter('span')}>
          <option value="all">All time</option>
          <option value="today">Today (UTC)</option>
        </select>
      </div>
      {shown.length === 0 ? <p className="local-dashboard-empty" role="status">No runs match these filters</p> : (
        <>
          <div className="local-dashboard-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th><th>Created</th><th>Status</th><th>Cause</th><th>Model</th><th>Backend</th><th>Host</th>
                  <th>Tokens in</th><th>Tokens out</th><th>Local cost</th><th>Baseline model</th><th>Basis</th>
                  <th>Task type</th><th>Duration</th><th>Tokens to compliance</th><th>Route tier</th><th>Quality score</th>
                </tr>
              </thead>
              <tbody>{page.map((run, index) => {
                const session = bySession.get(String(run.correlation_id));
                return <tr key={String(run.correlation_id ?? index)}>
                  <td>{recorded(run.correlation_id)}{isFixture(run) && <span className="local-dashboard-badge">fixture</span>}</td>
                  <td>{recorded(run.created_at)}</td>
                  <td>{statusOf(run)}</td>
                  <td>{causeOf(run)}</td>
                  <td>{modelOrUnknown(run.model_name)}</td>
                  <td>{recorded(run.backend_id)}</td>
                  <td>{recorded(run.host)}</td>
                  <td>{recorded(run.tokens_input)}</td>
                  <td>{recorded(run.tokens_output)}</td>
                  <td>{recorded(session?.local_cost_usd)}</td>
                  <td>{recorded(session?.baseline_model)}</td>
                  <td>{recorded(session?.usage_source)}</td>
                  <td>{recorded(run.task_type)}</td>
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
      <dl className="local-dashboard-fields">
        {QUALITY_FIELDS.map(([label, field]) => <div key={field}><dt>{label}</dt><dd>{recorded(row[field])}</dd></div>)}
      </dl>
    </section>
  );
}

/**
 * OMN-20225 AC3: the tier mix, from delegation.model-routing.v1's served by_tier (view migration 0045). Each tier's
 * count and share are the view's; runs with no tier are the served not_tier_routed_count, never folded into a tier.
 */
export function TierMixPanel({ row }: { row: Row | null }) {
  const byTier = row && typeof row.by_tier === 'object' && row.by_tier !== null && !Array.isArray(row.by_tier)
    ? (row.by_tier as Row) : null;
  const tiers = byTier && Array.isArray(byTier.tiers) ? asRecords(byTier.tiers) : [];
  if (!byTier || tiers.length === 0) {
    return <p className="local-dashboard-empty" role="status">No tier mix served yet</p>;
  }
  return (
    <section aria-label="Tier mix">
      <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit">
        <table>
          <thead><tr><th>Tier</th><th>Runs</th><th>Share of tier-routed</th></tr></thead>
          <tbody>{tiers.map((tier, index) => (
            <tr key={`${String(tier.cost_tier_name)}-${index}`}>
              <td>{recorded(tier.cost_tier_name)}</td>
              <td>{recorded(tier.count)}</td>
              <td>{recorded(tier.pct_of_tier_routed)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <dl className="local-dashboard-fields">
        <div><dt>Tier-routed</dt><dd>{recorded(byTier.tier_routed_total)}</dd></div>
        <div><dt>Not tier-routed</dt><dd>{recorded(byTier.not_tier_routed_count)}</dd></div>
        <div><dt>All runs</dt><dd>{recorded(byTier.total_tasks)}</dd></div>
      </dl>
    </section>
  );
}

/** CR-1 to CR-3: provider key references only (never a value), or the command that sets the first one. */
export function CredentialsTable({ rows }: { rows: readonly unknown[] }) {
  const keys = asRecords(rows);
  if (keys.length === 0) {
    return (
      <div className="local-dashboard-empty" role="status">
        <p>No provider key set</p>
        <p>Set one with <code>onex secret set</code></p>
      </div>
    );
  }
  return (
    <div className="local-dashboard-table-wrap">
      <table>
        <thead><tr><th>Provider</th><th>Key ref</th><th>Set</th><th>Revoked</th></tr></thead>
        <tbody>{keys.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            <td>{recorded(key.provider)}</td>
            <td>{recorded(key.name)}</td>
            <td>{recorded(key.created_at)}</td>
            <td>{isMissing(key.revoked_at) ? 'Not revoked' : String(key.revoked_at)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** WF-1 waits on run-trace.v1; until then the page shows the steps one served decision records. */
const RUN_TRACE_PENDING = 'Full path not served yet: waits on run-trace.v1 (OMN-19987)';

/**
 * WF-3: the newest run's recorded steps, in a fixed order, each from one served field of its decision row. The
 * browser orders nothing but the declared newest-first authority (written_at); the per-step path is run-trace.v1's.
 */
export function WorkflowPath({ decisions }: { decisions: readonly unknown[] }) {
  const run = newestFirst(decisions)[0];
  if (!run) return <NoRunsYet />;
  const status = statusOf(run);
  const steps: Array<[string, string]> = [
    ['Request', `${recorded(run.created_at)} · ${recorded(run.task_type)}`],
    ['Routing', `tier ${tierOf(run)} · model ${modelOrUnknown(run.model_name)} · backend ${recorded(run.backend_id)} · host ${recorded(run.host)}`],
    ['Quality gate', status === 'failed'
      ? `failed: ${causeOf(run)}`
      : `${status} · score ${recorded(run.actual_score)}`],
    ['Terminal', `${recorded(run.written_at)} · ${duration(run.latency_ms)}`],
  ];
  return (
    <div>
      <p className="local-dashboard-subtitle">Run <code>{recorded(run.correlation_id)}</code></p>
      <ol className="local-dashboard-steps">
        {steps.map(([name, value]) => <li key={name}><strong>{name}</strong><span>{value}</span></li>)}
      </ol>
      <p className="local-dashboard-empty" role="status">{RUN_TRACE_PENDING}</p>
    </div>
  );
}

/** AK-1: the tenant id from a served row; minted-at waits on local-identity.v1. */
export function LocalIdentity({ row }: { row: Record<string, unknown> | null }) {
  return (
    <dl className="local-dashboard-fields">
      <div><dt>Tenant</dt><dd>{recorded(row?.tenant_id)}</dd></div>
      <div><dt>Minted</dt><dd>Not served yet: waits on local-identity.v1 (OMN-19986)</dd></div>
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

/** The renderer for a table component: its first binding's rows, joined to its second binding by a served id. */
function TableComponent({ component, snapshots, pageSize, syncUrl }: {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  pageSize: number;
  syncUrl: boolean;
}) {
  const rows = rowsForLocalComponent(component, snapshots);
  const lookup = rowsForLocalBinding(component, snapshots, 1);
  if (component.component_id === 'overview-last-run') return <LastRunCard decisions={rows} sessions={lookup} />;
  if (component.component_id === 'overview-recent-runs') {
    return rows.length === 0 ? <NoRunsYet /> : <RecentRunsTable decisions={rows} sessions={lookup} />;
  }
  if (component.component_id === 'overview-quality' || component.component_id === 'overview-tier-mix') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    const row = first && typeof first === 'object' && !Array.isArray(first) ? (first as Row) : null;
    return component.component_id === 'overview-quality' ? <QualityPanel row={row} /> : <TierMixPanel row={row} />;
  }
  if (component.component_id === 'credentials-keys') return <CredentialsTable rows={rows} />;
  if (component.component_id === 'workflow-run-path') return <WorkflowPath decisions={rows} />;
  // US-1, US-2, US-4: served rows as served. The exposure is tenant-scoped, so the server filters, not the browser.
  if (component.component_id === 'usage-by-model-day') return <UsageByModelDayTable rows={rows} />;
  if (component.component_id === 'api-keys-local-identity') {
    const first = rawRowsFor(component, snapshots, 0)[0];
    return <LocalIdentity row={first && typeof first === 'object' ? (first as Record<string, unknown>) : null} />;
  }
  return rows.length === 0 ? <NoRunsYet /> : <RunsTable decisions={rows} sessions={lookup} pageSize={pageSize} syncUrl={syncUrl} />;
}

/** Resolve a widget's bindings once per exposure; contracts can request several fields from one topic. */
function boundSnapshotsFor(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): BoundProjectionSnapshot[] {
  const seen = new Set<string>();
  const bound: BoundProjectionSnapshot[] = [];
  for (const binding of component.data_bindings ?? []) {
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
        <p className="local-dashboard-error" role="alert" key={snapshot.topic}>
          {snapshot.failure!.message}
          {snapshot.lastGoodAt ? `; last good ${age(snapshot.lastGoodAt, now)}` : ''}
        </p>
      ))}
      {unservedLookups.map((snapshot) => (
        <p className="local-dashboard-empty" role="status" key={snapshot.topic}>{snapshot.failure!.message}</p>
      ))}
      {readAt !== null && (
        <p className={`local-dashboard-asof${stale ? ' local-dashboard-asof--stale' : ''}`}>{`As of ${age(readAt, now)}`}</p>
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
  return snapshot?.failure?.message ?? null;
}

/** A component whose row-gating binding failed with no last good rows renders only its read state. */
function bindingFailedEmpty(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): boolean {
  return rowGatingSnapshots(component, snapshots)
    .some((snapshot) => Boolean(snapshot.failure) && !snapshot.lastGoodAt);
}

const PAGE_TITLES: Record<LocalPageName, string> = {
  overview: 'Overview',
  runs: 'Runs',
  workflow: 'Workflow',
  usage: 'Usage',
  credentials: 'Credentials',
  'api-keys': 'API Keys',
};

export function LocalDashboardPage({ pageName, syncUrl = false }: LocalDashboardPageProps) {
  const [page, setPage] = useState<LocalPageDocument | null>(null);
  const [snapshots, setSnapshots] = useState<BoundProjectionSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef<BoundProjectionSnapshot[]>([]);
  // One source per mounted page, so a double mount (React's development mode) shares its reads in flight.
  const source = useRef<ReturnType<typeof createSnapshotSource> | null>(null);

  useEffect(() => {
    let active = true;
    // A page switch must not show the previous page's document while this one loads.
    setPage(null);
    setSnapshots([]);
    latest.current = [];
    setError(null);
    setLoading(true);
    let document: LocalPageDocument;
    try {
      document = loadLocalPageConfig(pageName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
      return () => { active = false; };
    }
    // Every read after the first keeps the last good rows on screen while it runs, and when it fails (F25).
    async function load() {
      try {
        const { mode } = resolveEffectiveDataSource();
        if (mode !== 'http') {
          throw new Error('Local pages require HTTP mode to read runtime exposures.');
        }
        const census = await fetchExposureCensus();
        const availableTopics = new Set(
          census.rows.filter((row) => row.reachability === 'reachable').map((row) => row.topic),
        );
        source.current ??= createSnapshotSource();
        const data = await loadLocalPageSnapshots(document, source.current, {
          mode,
          availableTopics,
        });
        if (active) {
          const merged = withLastGood(latest.current, data);
          latest.current = merged;
          setPage(document);
          setSnapshots(merged);
          setError(null);
        }
      } catch (cause) {
        if (active && latest.current.length === 0) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) setLoading(false);
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
  }, [pageName]);

  const emptyState = page ? resolveLocalPageEmptyState(page, snapshots) : null;
  const now = Date.now();
  const interval = page?.dashboard.refresh_interval_seconds ?? 30;
  return (
    <main aria-label={`${page?.dashboard.name ?? 'Local dashboard'} page`} className="local-dashboard-page">
      <header className="local-dashboard-header">
        <div>
          <h1>{page?.dashboard.name ?? PAGE_TITLES[pageName]}</h1>
          <p>{page?.dashboard.description}</p>
        </div>
        <span className="local-dashboard-mode">Local runtime · HTTP</span>
      </header>
      {loading && <p role="status">Loading runtime exposures…</p>}
      {error && <p className="local-dashboard-error" role="alert">{error}</p>}
      {!loading && !error && page && (
        <section className="local-dashboard-grid" aria-label="Dashboard components">
          {page.components.map((component) => {
            const rows = rowsForLocalComponent(component, snapshots);
            const first = (rows[0] ?? {}) as Record<string, unknown>;
            const widget = page.dashboard.widgets.find((candidate) => candidate.data_source === component.component_id);
            const pageSize = Number((widget?.config as Record<string, unknown> | undefined)?.page_size ?? 25);
            const notServed = notServedTopic(component, snapshots);
            const unbound = (component.data_bindings ?? []).length === 0;
            return (
              <article className="local-dashboard-panel" data-width={String(widget?.width ?? 12)} key={component.component_id}>
                <h2>{component.title}</h2>
                {unbound && component.component_kind !== 'metric_card' ? <PendingState componentId={component.component_id} />
                  : notServed ? <p className="local-dashboard-empty" role="status">{notServed}</p>
                  : bindingFailedEmpty(component, snapshots) ? null
                  : emptyState === 'NO_RUNS_YET' ? <NoRunsYet />
                  : emptyState ? <p className="local-dashboard-empty" role="status">Baseline unresolved</p>
                  : component.component_kind === 'table' ? (
                    <TableComponent component={component} snapshots={snapshots} pageSize={pageSize} syncUrl={syncUrl} />
                  ) : component.data_bindings?.[0]?.projection_topic === METERING_SUMMARY_TOPIC ? (() => {
                    const config = metricConfigFor(page, component.component_id);
                    return config
                      ? <MeteringTotalCard component={component} config={config} rows={rows} />
                      : <p className="local-dashboard-empty">Not measured</p>;
                  })() : (() => {
                    const config = metricConfigFor(page, component.component_id);
                    return config
                      ? <MetricCard component={component} config={config} row={first} caption={captionRowFor(component, snapshots)} />
                      : <p className="local-dashboard-empty">Not measured</p>;
                  })()}
                <WidgetReadState component={component} snapshots={snapshots} now={now} interval={interval} />
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
