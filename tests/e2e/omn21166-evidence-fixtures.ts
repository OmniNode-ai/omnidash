import type { Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

export const evidenceTopic = (name: string) => `${prefix}${name}`;

export const evidenceDecisions = [
  { correlation_id: 'evidence-newest', created_at: '2026-10-17T12:00:00Z', written_at: '2026-10-17T12:00:00Z', model_name: 'model-a', task_type: 'summarization', quality_gate_passed: true, tokens_input: 20, tokens_output: 10, cost_usd: '1.00', modelled_savings_usd: '2.00' },
  { correlation_id: 'evidence-middle', created_at: '2026-10-17T11:00:00Z', written_at: '2026-10-17T11:00:00Z', model_name: 'model-b', task_type: 'classification', quality_gate_passed: false, tokens_input: null, tokens_output: null, cost_usd: null, modelled_savings_usd: null },
  { correlation_id: 'evidence-oldest', created_at: '2026-10-17T10:00:00Z', written_at: '2026-10-17T10:00:00Z', model_name: 'model-a', task_type: 'summarization', quality_gate_passed: true, tokens_input: 5, tokens_output: 5, cost_usd: '0.00', modelled_savings_usd: '0.00' },
];

export const evidenceMetering = {
  tenant_id: 'evidence-fixture', window_kind: 'all', window_start: '2026-10-01', as_of: '2026-10-17T12:00:00Z',
  baseline_model: 'cloud-baseline', baseline_state: 'resolved', pricing_manifest_version: '3',
  spend_usd: '12.00', counterfactual_usd: '30.00', savings_usd: '18.00',
  runs_total: 10, runs_measured: 7, runs_unknown_tokens: 2, runs_unknown_spend: 1,
  tokens_in: 100, tokens_out: 50,
};

export const evidenceQuality = {
  overall_pass_rate: 0.75, total_passed: 6, total_failed: 2, total_checks: 8,
  escalation_count: 0, escalation_rate: 0, median_tokens_to_compliance: 0,
  failure_categories: [
    { category: 'low score', count: 1, pct_of_failures: 0.333 },
    { category: 'bad shape', count: 2, pct_of_failures: 0.667 },
  ],
  by_check_type: [
    { check_type: 'score_vs_required_bar', passed: 4, failed: 0, total: 4, pass_rate: 1 },
    { check_type: 'shape', passed: 2, failed: 2, total: 4, pass_rate: 0.5 },
  ],
};

export async function serveEvidence(page: Page, overrides: Record<string, unknown[]> = {}) {
  const rows = {
    ...chartRows,
    [evidenceTopic('delegation.decisions.v1')]: evidenceDecisions,
    [evidenceTopic('metering-summary.v1')]: [evidenceMetering],
    [evidenceTopic('delegation.quality-gate.v1')]: [evidenceQuality],
    ...overrides,
  };
  await serveCharts(page, rows);
  // The local runtime declares the legacy savings projection absent, so Overview and Evidence select the same
  // canonical metering source. An empty legacy row with a healthy catalogue entry would correctly keep that source.
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(rows).map(topic => topic === evidenceTopic('cost.savings-overview.v1')
      ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
      : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
}
