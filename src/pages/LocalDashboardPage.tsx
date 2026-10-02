import { useEffect, useState } from 'react';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import '@/styles/local-dashboard.css';
import {
  loadLocalPageConfig,
  loadLocalPageSnapshots,
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

interface RunsTableProps {
  rows: readonly unknown[];
}

export function RunsTable({ rows }: RunsTableProps) {
  return (
    <div className="local-dashboard-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Session</th><th>Created</th><th>Model</th><th>Prompt tokens</th>
            <th>Completion tokens</th><th>Local cost</th><th>Baseline cost</th>
            <th>Baseline model</th><th>Savings</th><th>Usage source</th>
            <th>Task type</th><th>Latency (ms)</th><th>Tokens to compliance</th>
          </tr>
        </thead>
        <tbody>{rows.map((row, index) => {
          const record = row as Record<string, unknown>;
          const unresolved = record.baseline_model === null && record.savings_usd === 0;
          const baselineCost = record.counterfactual_baseline_usd ?? record.cloud_cost_usd;
          return <tr key={String(record.session_id ?? index)}>
            <td>{valueOrUnmeasured(record.session_id)}</td>
            <td>{valueOrUnmeasured(record.created_at)}</td>
            <td>{modelOrUnknown(record.model_name)}</td>
            <td>{valueOrUnmeasured(record.prompt_tokens)}</td>
            <td>{valueOrUnmeasured(record.completion_tokens)}</td>
            <td>{valueOrUnmeasured(record.local_cost_usd)}</td>
            <td>{unresolved ? 'Baseline unresolved' : valueOrUnmeasured(baselineCost)}</td>
            <td>{unresolved ? 'Baseline unresolved' : valueOrUnmeasured(record.baseline_model)}</td>
            <td>{unresolved ? 'Baseline unresolved' : valueOrUnmeasured(record.savings_usd)}</td>
            <td>{valueOrUnmeasured(record.usage_source ?? record.savings_method)}</td>
            <td>{valueOrUnmeasured(record.task_type)}</td>
            <td>{valueOrUnmeasured(record.latency_ms)}</td>
            <td>{valueOrUnmeasured(record.tokens_to_compliance)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
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
            return (
              <article className="local-dashboard-panel" key={component.component_id}>
                <h2>{component.title}</h2>
                {emptyState ? (
                  <p className="local-dashboard-empty" role="status">
                    {emptyState === 'BASELINE_UNRESOLVED' ? 'Baseline unresolved' : 'No runs yet'}
                  </p>
                ) : component.component_kind === 'table' ? (
                  rows.length === 0 ? <p className="local-dashboard-empty">No runs yet</p> : <RunsTable rows={rows} />
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
