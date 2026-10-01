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
            <td>{valueOrUnmeasured(record.model_name)}</td>
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
                ) : (
                  <p className="local-dashboard-metric">
                    {valueOrUnmeasured(first.roi_percent)}{first.roi_percent == null ? '' : '%'}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
