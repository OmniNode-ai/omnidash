import { useEffect, useId, useState } from 'react';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import '@/styles/local-dashboard.css';
import {
  loadLocalPageConfig,
  loadLocalPageSnapshots,
  rowsForLocalBinding,
  rowsForLocalComponent,
  resolveLocalPageEmptyState,
  type BoundProjectionSnapshot,
  type LocalPageDocument,
  type LocalPageName,
} from '@/layout/local-page-loader';

interface LocalDashboardPageProps {
  pageName: LocalPageName;
}

function valueOrUnmeasured(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not measured';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Not measured';
  return String(value);
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
  'overview-tokens': 'metering-summary.v1',
};

function captionText(caption: Record<string, unknown> | null | undefined): string | null {
  if (!caption) return null;
  const parts: string[] = [];
  if ('baseline_model' in caption) {
    parts.push(isMissing(caption.baseline_model) ? 'Baseline unresolved' : `Baseline ${String(caption.baseline_model)}`);
  }
  if ('pricing_manifest_version' in caption && !isMissing(caption.pricing_manifest_version)) {
    parts.push(`pricing manifest v${String(caption.pricing_manifest_version)}`);
  }
  if ('zero_token_run_count' in caption && !isMissing(caption.zero_token_run_count)) {
    parts.push(`Zero-token runs: ${String(caption.zero_token_run_count)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One figure from one served exposure row: the field the widget names. A
 * required field that is absent means the figure is not measured; when that
 * field is a baseline, the figure is a savings figure with no priced baseline,
 * which is BASELINE_UNRESOLVED and never a zero.
 */
export function MetricCard({ component, config, row, caption }: MetricCardProps) {
  if ((component.data_bindings ?? []).length === 0) {
    const source = PENDING_SOURCES[component.component_id] ?? 'its exposure';
    return <p className="local-dashboard-empty" role="status">{`Not served yet: waits on ${source}`}</p>;
  }
  const required = component.data_bindings?.[0]?.required_fields ?? [config.metric_key];
  const missing = [...new Set([config.metric_key, ...required])].filter((field) => isMissing(row[field]));
  let text: string;
  if (missing.some((field) => field.includes('baseline'))) text = 'Baseline unresolved';
  else if (missing.length > 0) text = 'Not measured';
  else text = formatMetric(Number(row[config.metric_key]), config);
  const line = captionText(caption);
  return (
    <>
      <p className="local-dashboard-metric">{text}</p>
      {line && <p className="local-dashboard-caption">{line}</p>}
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

/** No served exposure carries the serving backend yet: OMN-20162 adds it to delegation events. */
const BACKEND_NOT_SERVED = 'Not served (OMN-20162)';

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

/** A run's saving from its session: 0 with no baseline is BASELINE_UNRESOLVED, never $0 (aac9032d, ticket AC4). */
function savingsOf(session: Row | undefined): string {
  if (session && session.baseline_model === null && session.savings_usd === 0) return 'Baseline unresolved';
  return recorded(session?.savings_usd);
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
    ['Run', recorded(last.correlation_id)],
    ['Model', modelOrUnknown(last.model_name)],
    ['Backend', BACKEND_NOT_SERVED],
    ['Duration', duration(last.latency_ms)],
    ['Tokens in', recorded(last.tokens_input)],
    ['Tokens out', recorded(last.tokens_output)],
    ['Cost', recorded(session?.local_cost_usd)],
    ['Task type', recorded(last.task_type)],
    ['Route tier', recorded(last.cost_tier_name)],
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

/** OV-5: the ten newest runs, newest first, with the Runs page's run columns. */
export function RecentRunsTable({ decisions, sessions, now = Date.now() }: RunViewProps) {
  const bySession = indexBy(sessions, 'session_id');
  const recent = newestFirst(decisions).slice(0, 10);
  return (
    <div className="local-dashboard-table-wrap local-dashboard-table-wrap--fit">
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Age</th><th>Status</th><th>Cause</th><th>Task type</th><th>Model</th><th>Backend</th>
            <th>Tokens in</th><th>Tokens out</th><th>Cost</th><th>Savings</th><th>Duration</th>
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
            <td>{BACKEND_NOT_SERVED}</td>
            <td>{recorded(decision.tokens_input)}</td>
            <td>{recorded(decision.tokens_output)}</td>
            <td>{recorded(session?.local_cost_usd)}</td>
            <td>{savingsOf(session)}</td>
            <td>{duration(decision.latency_ms)}</td>
            <td>{recorded(decision.cost_tier_name)}</td>
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
  rows: readonly unknown[];
  /** delegation.decisions.v1 rows, looked up by session_id = correlation_id for each run's status and cause. */
  decisions?: readonly unknown[];
  now?: number;
}

/** RU-1: every served session with its decision's status and cause, filtered by status, model and window. */
export function RunsTable({ rows, decisions = [], now = Date.now() }: RunsTableProps) {
  const id = useId();
  const [status, setStatus] = useState('all');
  const [model, setModel] = useState('all');
  const [span, setSpan] = useState('all');
  const byCorrelation = indexBy(decisions, 'correlation_id');
  const records = asRecords(rows);
  const models = [...new Set(records.map((record) => modelOrUnknown(record.model_name)))].sort();
  const today = utcDay(now);
  const shown = records.filter((record) => {
    const decision = byCorrelation.get(String(record.session_id));
    return (status === 'all' || statusOf(decision) === status)
      && (model === 'all' || modelOrUnknown(record.model_name) === model)
      && (span === 'all' || utcDay(timeOf(record.created_at)) === today);
  });
  return (
    <>
      <div className="local-dashboard-filters">
        <label htmlFor={`${id}-status`}>Status</label>
        <select id={`${id}-status`} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All</option>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="Not recorded">Not recorded</option>
        </select>
        <label htmlFor={`${id}-model`}>Model</label>
        <select id={`${id}-model`} value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="all">All</option>
          {models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <label htmlFor={`${id}-window`}>Window</label>
        <select id={`${id}-window`} value={span} onChange={(event) => setSpan(event.target.value)}>
          <option value="all">All time</option>
          <option value="today">Today (UTC)</option>
        </select>
      </div>
      {shown.length === 0 ? <p className="local-dashboard-empty" role="status">No runs match these filters</p> : (
        <div className="local-dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Session</th><th>Created</th><th>Status</th><th>Cause</th><th>Model</th><th>Backend</th>
                <th>Prompt tokens</th><th>Completion tokens</th><th>Local cost</th><th>Baseline cost</th>
                <th>Baseline model</th><th>Savings</th><th>Usage source</th>
                <th>Task type</th><th>Latency (ms)</th><th>Tokens to compliance</th><th>Route tier</th><th>Quality score</th>
              </tr>
            </thead>
            <tbody>{shown.map((record, index) => {
              const decision = byCorrelation.get(String(record.session_id));
              const unresolved = record.baseline_model === null && record.savings_usd === 0;
              const baselineCost = record.counterfactual_baseline_usd ?? record.cloud_cost_usd;
              return <tr key={String(record.session_id ?? index)}>
                <td>{valueOrUnmeasured(record.session_id)}</td>
                <td>{valueOrUnmeasured(record.created_at)}</td>
                <td>{statusOf(decision)}</td>
                <td>{causeOf(decision)}</td>
                <td>{modelOrUnknown(record.model_name)}</td>
                <td>{BACKEND_NOT_SERVED}</td>
                <td>{valueOrUnmeasured(record.prompt_tokens)}</td>
                <td>{valueOrUnmeasured(record.completion_tokens)}</td>
                <td>{valueOrUnmeasured(record.local_cost_usd)}</td>
                <td>{unresolved ? 'Baseline unresolved' : valueOrUnmeasured(baselineCost)}</td>
                {/* A measured saving whose baseline model was not written is not "not measured" (Codex, 2026-10-02). */}
                <td>{unresolved ? 'Baseline unresolved' : recorded(record.baseline_model)}</td>
                <td>{unresolved ? 'Baseline unresolved' : valueOrUnmeasured(record.savings_usd)}</td>
                <td>{valueOrUnmeasured(record.usage_source ?? record.savings_method)}</td>
                <td>{valueOrUnmeasured(record.task_type)}</td>
                <td>{valueOrUnmeasured(record.latency_ms)}</td>
                <td>{valueOrUnmeasured(record.tokens_to_compliance)}</td>
                <td>{recorded(decision?.cost_tier_name)}</td>
                <td>{recorded(decision?.actual_score)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** The renderer for a table component: its first binding's rows, joined to its second binding by a served id. */
function TableComponent({ component, snapshots }: {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
}) {
  const rows = rowsForLocalComponent(component, snapshots);
  const lookup = rowsForLocalBinding(component, snapshots, 1);
  if (component.component_id === 'overview-last-run') return <LastRunCard decisions={rows} sessions={lookup} />;
  if (component.component_id === 'overview-recent-runs') {
    return rows.length === 0 ? <NoRunsYet /> : <RecentRunsTable decisions={rows} sessions={lookup} />;
  }
  return rows.length === 0 ? <NoRunsYet /> : <RunsTable rows={rows} decisions={lookup} />;
}

export function LocalDashboardPage({ pageName }: LocalDashboardPageProps) {
  const [page, setPage] = useState<LocalPageDocument | null>(null);
  const [snapshots, setSnapshots] = useState<BoundProjectionSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // A page switch must not show the previous page's document while this one loads.
    setPage(null);
    setSnapshots([]);
    setError(null);
    setLoading(true);
    async function load() {
      try {
        const document = loadLocalPageConfig(pageName);
        const { mode } = resolveEffectiveDataSource();
        if (mode !== 'http') {
          throw new Error('Local pages require HTTP mode to read runtime exposures.');
        }
        const census = await fetchExposureCensus();
        const availableTopics = new Set(
          census.rows.filter((row) => row.reachability === 'reachable').map((row) => row.topic),
        );
        const data = await loadLocalPageSnapshots(document, createSnapshotSource(), {
          mode,
          availableTopics,
        });
        if (active) {
          setPage(document);
          setSnapshots(data);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [pageName]);

  const emptyState = page ? resolveLocalPageEmptyState(page, snapshots) : null;
  return (
    <main aria-label={`${page?.dashboard.name ?? 'Local dashboard'} page`} className="local-dashboard-page">
      <header className="local-dashboard-header">
        <div>
          <h1>{page?.dashboard.name ?? (pageName === 'overview' ? 'Overview' : 'Runs')}</h1>
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
            const width = page.dashboard.widgets.find((widget) => widget.data_source === component.component_id)?.width;
            return (
              <article className="local-dashboard-panel" data-width={String(width ?? 12)} key={component.component_id}>
                <h2>{component.title}</h2>
                {emptyState === 'NO_RUNS_YET' ? <NoRunsYet /> : emptyState ? (
                  <p className="local-dashboard-empty" role="status">Baseline unresolved</p>
                ) : component.component_kind === 'table' ? (
                  <TableComponent component={component} snapshots={snapshots} />
                ) : (() => {
                  const config = metricConfigFor(page, component.component_id);
                  return config
                    ? <MetricCard component={component} config={config} row={first} caption={captionRowFor(component, snapshots)} />
                    : <p className="local-dashboard-empty">Not measured</p>;
                })()}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
