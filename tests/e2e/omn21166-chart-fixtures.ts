import { expect, type Page } from 'playwright/test';

export const prefix = 'onex.snapshot.projection.';
/**
 * The fixtures' own "now". The pages read the latest 30 UTC days from the browser's clock, so fixed fixture dates aged
 * out of the window as the real date moved on (the 2026-10-01 usage rows did on 2026-10-31; the 2026-10-17 runs would on
 * 2026-11-16). serveCharts freezes the browser's date here, so every fixture date keeps its place in the window; timers
 * still run. A spec that builds its rows from the real date calls keepRealClock(page) first.
 */
// The real date these fixtures were written against (late October): the Oct 1 usage rows and the Oct 17 runs both sit in
// the 30-day window, and All time starts at the first run.
export const FIXTURE_NOW = '2026-10-30T12:00:00Z';
/** A UTC day the given number of days before the fixtures' now; recentDay(1) is the fixtures' yesterday. */
export const recentDay = (daysAgo: number) => new Date(Date.parse(FIXTURE_NOW) - daysAgo * 86_400_000).toISOString().slice(0, 10);
export const USAGE_DAY = recentDay(2);
const realClock = new WeakSet<Page>();
/** Keep the browser on the real clock, for a spec whose rows are dated from the real date. */
export function keepRealClock(page: Page) { realClock.add(page); }
export const runIds = ['chart-run-a', 'chart-run-b', 'chart-run-c'];
export const chartRows: Record<string, unknown[]> = {
  [prefix + 'cost.savings-overview.v1']: [],
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
  [prefix + 'delegation.model-routing.v1']: [{ total_delegations: 10,
    rows: [
      { model_name: 'model-a', task_type: 'summarization', count: 6, pct_of_model: 1, pct_of_total: .6 },
      { model_name: 'model-b', task_type: 'summarization', count: 4, pct_of_model: 1, pct_of_total: .4 },
    ],
    by_tier: { total_tasks: 10, tier_routed_total: 8, not_tier_routed_count: 2,
    tiers: [{ cost_tier_name: 'local', count: 6, tier_routed: true, pct_of_tier_routed: .75 },
      { cost_tier_name: 'cloud', count: 2, tier_routed: true, pct_of_tier_routed: .25 }] } }],
  [prefix + 'delegation.quality-gate.v1']: [{ overall_pass_rate: .75, total_passed: 6, total_failed: 2, total_checks: 8,
    escalation_count: 0, escalation_rate: 0,
    failure_categories: [{ category: 'fixture quality failure', count: 2, pct_of_failures: 1 }] }],
  [prefix + 'usage-by-model-day.v1']: [
    { usage_day: USAGE_DAY, model_id: 'model-a', input_tokens: 162, output_tokens: 52, measured_cost_usd: '0.001', call_count: 1, call_share: .75, cost_tier_name: 'local' },
    { usage_day: USAGE_DAY, model_id: 'model-b', input_tokens: 90, output_tokens: null, measured_cost_usd: null, call_count: 1, call_share: .25, cost_tier_name: 'cloud' },
  ],
  [prefix + 'node-generation-completed.v1']: [],
};

export async function serveCharts(page: Page, rows = chartRows) {
  if (!realClock.has(page)) await page.clock.setFixedTime(new Date(FIXTURE_NOW));
  await page.addInitScript(() => localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: location.origin })));
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(rows).map(topic => ({ topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false })) }) }));
  await page.route('**/projection/**', route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    const data = rows[topic] ?? [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: data, row_count: data.length, data_freshness: 'stale' }) });
  });
}

/** Enter the retained native field view on Overview or Runs without changing its values. */
export async function revealRunFields(page: Page) {
  await page.locator('details.local-recent-fields > summary, .local-dashboard-page label input[type="checkbox"]').first().waitFor({ state: 'attached' });
  const disclosure = page.locator('details.local-recent-fields');
  if (await disclosure.count() && await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').press('Enter');
  await page.getByRole('checkbox', { name: 'Show all run fields', exact: true }).check();
}

/**
 * Narrow the viewport and wait for the sidebar to settle. Crossing 1024px folds the sidebar through a matchMedia change
 * event that lands after setViewportSize resolves (Sidebar.tsx), so checking the Collapse sidebar button and then
 * clicking it raced that event: the click then waited 30 s for a label that had already become Expand sidebar (the
 * organization and legacy-overview flakes of 2026-11-03). Below the line the page shows the folded sidebar.
 */
export async function narrowTo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  if (width > 1024) return;
  const sidebar = page.locator('aside.sidebar');
  if (await sidebar.count() === 0) return;
  await expect(sidebar).toHaveClass(/(^|\s)collapsed(\s|$)/);
}
