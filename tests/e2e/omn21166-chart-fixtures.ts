import type { Page } from 'playwright/test';

export const prefix = 'onex.snapshot.projection.';
export const runIds = ['chart-run-a', 'chart-run-b', 'chart-run-c'];
export const chartRows: Record<string, unknown[]> = {
  [prefix + 'delegation.decisions.v1']: runIds.map((id, i) => ({
    correlation_id: id, created_at: `2026-10-17T10:0${3-i}:00Z`, written_at: `2026-10-17T10:0${3-i}:00Z`,
    model_name: i === 1 ? 'model-b' : 'model-a', quality_gate_passed: i !== 1,
    quality_gate_detail: 'completed', latency_ms: i === 2 ? null : [813, 210][i],
    tokens_input: [162, 90, 0][i], tokens_output: [52, 20, null][i],
    backend_id: 'local', task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'fixture',
  })),
  [prefix + 'delegation.savings.v1']: [],
  [prefix + 'metering-summary.v1']: [1, 2, 3].map((day, i) => ({
    tenant_id: 'chart-fixture-tenant', window_kind: 'day', window_start: `2026-10-0${day}`,
    as_of: '2026-10-17T10:00:00Z', baseline_model: 'baseline-a', baseline_state: 'resolved',
    spend_usd: ['0.010000', '0.000000', null][i], counterfactual_usd: ['0.020000','0.030000','0.040000'][i],
    savings_usd: ['0.010000','0.030000',null][i], runs_total: 1,
  })),
  [prefix + 'delegation.model-routing.v1']: [{ by_tier: { total_tasks: 10, tier_routed_total: 8, not_tier_routed_count: 2,
    tiers: [{ cost_tier_name: 'local', count: 6, tier_routed: true, pct_of_tier_routed: .75 },
      { cost_tier_name: 'cloud', count: 2, tier_routed: true, pct_of_tier_routed: .25 }] } }],
  [prefix + 'delegation.quality-gate.v1']: [{ overall_pass_rate: .75, total_passed: 6, total_failed: 2, total_checks: 8 }],
  [prefix + 'usage-by-model-day.v1']: [
    { usage_day: '2026-10-01', model_id: 'model-a', input_tokens: 162, output_tokens: 52, measured_cost_usd: '0.001', call_count: 1, call_share: .75, cost_tier_name: 'local' },
    { usage_day: '2026-10-01', model_id: 'model-b', input_tokens: 90, output_tokens: null, measured_cost_usd: null, call_count: 1, call_share: .25, cost_tier_name: 'cloud' },
  ],
  [prefix + 'node-generation-completed.v1']: [],
};

export async function serveCharts(page: Page, rows = chartRows) {
  await page.addInitScript(() => localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: location.origin })));
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(rows).map(topic => ({ topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false })) }) }));
  await page.route('**/projection/**', route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    const data = rows[topic] ?? [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: data, row_count: data.length, data_freshness: 'stale' }) });
  });
}
