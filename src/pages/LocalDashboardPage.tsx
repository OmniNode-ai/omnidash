import { useEffect, useState } from 'react';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import '@/styles/local-dashboard.css';
import {
  loadLocalPageConfig,
  loadLocalPageSnapshots,
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

function rowsFor(component: LocalPageDocument['components'][number], snapshots: BoundProjectionSnapshot[]) {
  const topic = component.data_bindings?.[0]?.projection_topic;
  return topic === undefined ? [] : snapshots.find((snapshot) => snapshot.topic === topic)?.rows ?? [];
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
            const rows = rowsFor(component, snapshots);
            const first = (rows[0] ?? {}) as Record<string, unknown>;
            return (
              <article className="local-dashboard-panel" key={component.component_id}>
                <h2>{component.title}</h2>
                {emptyState ? (
                  <p className="local-dashboard-empty" role="status">
                    {emptyState === 'BASELINE_UNRESOLVED' ? 'Baseline unresolved' : 'No runs yet'}
                  </p>
                ) : component.component_kind === 'table' ? (
                  rows.length === 0 ? <p className="local-dashboard-empty">No runs yet</p> : (
                    <div className="local-dashboard-table-wrap">
                      <table>
                        <thead><tr><th>Run</th><th>Status</th><th>Started</th><th>Savings</th></tr></thead>
                        <tbody>{rows.map((row, index) => {
                          const record = row as Record<string, unknown>;
                          return <tr key={String(record.run_id ?? index)}>
                            <td>{valueOrUnmeasured(record.run_id)}</td>
                            <td>{valueOrUnmeasured(record.status)}</td>
                            <td>{valueOrUnmeasured(record.started_at)}</td>
                            <td>{valueOrUnmeasured(record.savings_usd)}</td>
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                  )
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
