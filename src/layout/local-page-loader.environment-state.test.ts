import { describe, expect, it } from 'vitest';
import { loadLocalPageConfig, resolveLocalPageEmptyState, DELEGATION_DECISIONS_TOPIC, type BoundProjectionSnapshot } from './local-page-loader';

// Separate integration correction: Environment service rows/read failures are
// not run evidence and must not suppress the page's existing empty-run state.
const ENVIRONMENT = 'onex.snapshot.projection.local-environment.v1';
const page = loadLocalPageConfig('overview');
// OMN-21166 live review 2026-10-25: Overview no longer binds Environment (it moved to API Keys); an Environment read is
// still supplied here, so a health snapshot beside Overview's run reads still cannot stand in for run evidence.
function snapshots(): BoundProjectionSnapshot[] {
  return [...new Set([...page.components.flatMap(component => component.data_bindings?.map(binding => binding.projection_topic) ?? []), ENVIRONMENT])]
    .map(topic => ({ topic, rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-10-24T05:12:00Z' }));
}

describe('Environment cannot masquerade as run evidence', () => {
  it.each(['healthy', 'failed'] as const)('keeps No runs yet with %s health and no run rows', state => {
    const rows = snapshots();
    const health = rows.find(snapshot => snapshot.topic === ENVIRONMENT)!;
    expect(health).toBeDefined();
    if (state === 'healthy') { health.rows = [{ mode: 'native', service: 'local-runtime', verdict: 'running' }]; health.rowCount = 1; }
    else health.failure = { kind: 'error', message: 'Health read failed' };
    expect(resolveLocalPageEmptyState(page, rows)).toBe('NO_RUNS_YET');
  });

  it('positive control: a served run still clears No runs yet', () => {
    const rows = snapshots();
    const runs = rows.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)!;
    expect(runs).toBeDefined();
    runs.rows = [{ correlation_id: '11111111-1111-4111-8111-111111111111', terminal_ok: 1 }]; runs.rowCount = 1;
    expect(resolveLocalPageEmptyState(page, rows)).toBeNull();
  });
});
