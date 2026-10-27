import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-20009: the Overview's Run locally share and Avg saving / call at 1440x900, from served exposures only, never 0
// when unmeasured. The model-routing row is the lakshman lane's by_tier on 2026-10-04 14:26Z (104 local of 124 runs,
// 20 not tier-routed) with the keys the OMN-20009 view adds. The per-run saving card binds metering-summary.v1 since the
// lab catalogue serves its column (lab recapture 2026-10-07): served, it shows the served value; not served, it says so.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';

const byTier = {
  tiers: [
    { count: 104, tier_routed: true, cost_tier_name: 'local', pct_of_tier_routed: 1 },
    { count: 20, tier_routed: false, cost_tier_name: 'not_tier_routed', pct_of_tier_routed: 0 },
  ],
  total_tasks: 124,
  tier_routed_total: 104,
  not_tier_routed_count: 20,
  local_call_count: 104,
  total_call_count: 124,
  local_call_share: 104 / 124,
};

const served: Record<string, unknown[]> = {
  [DECISIONS]: [{
    correlation_id: 'corr-20009', written_at: '2026-10-04T14:20:00Z', created_at: '2026-10-04T14:20:00Z',
    model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 813,
    tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000',
    data_source: 'real',
  }],
  [SAVINGS]: [{
    tenant_id: 'tenant-a', baseline_model: 'claude-opus-4-6', pricing_manifest_version: '1',
    sessions: [{
      session_id: 'corr-20009', created_at: '2026-10-04T14:20:00Z', model_name: 'Qwen3.8-27B', prompt_tokens: 162,
      completion_tokens: 52, local_cost_usd: 0.0011, cloud_cost_usd: 0.000844, counterfactual_baseline_usd: 0.000844,
      baseline_model: 'claude-opus-4-6', savings_usd: 0.000844, usage_source: 'measured',
    }],
  }],
  [OVERVIEW]: [{
    total_cost_usd: 0.00686, total_savings_usd: 1.289686, total_baseline_cost_usd: 1.296546,
    measured_run_count: 124, zero_token_run_count: 0,
  }],
  [ROUTING]: [{ tenant_id: 'tenant-a', total_delegations: 124, captured_at: '2026-10-04T14:26:13Z', by_tier: byTier }],
  // The served per-run saving is deliberately not savings over runs (2.9 / 3 = 0.966667): the card shows it unchanged.
  [METERING]: [{
    window_kind: 'all', window_start: '', as_of: '2026-10-04T14:26:13Z', baseline_model: 'claude-opus-4-6',
    pricing_manifest_version: '1', baseline_state: 'resolved', runs_total: 4, runs_measured: 3, savings_usd: '2.9',
    savings_per_measured_run_usd: '0.500000',
  }],
};

async function serve(page: Page, rows: Record<string, unknown[]>) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: Object.keys(rows).map((topic) => ({
          topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const answer = rows[topic];
    await route.fulfill(answer === undefined
      ? { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ rows: answer, row_count: answer.length, data_freshness: 'fresh' }) });
  });
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// OMN-21166 AC86 (Lakshman 2026-10-25): Run locally and Avg saving / call (the "Additional runtime metrics" cards) are
// deleted from Overview. The honesty property these tests held, no invented 0 and no overflow at 1440x900 from served
// exposures only, is retargeted to the Overview that remains; the deleted cards must stay gone.
test('OMN-20009: the deleted Run locally and Avg saving / call cards stay gone and Overview fits 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, served);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run locally', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Avg saving / call', exact: true })).toHaveCount(0);
  await expect(page.getByText('Additional runtime metrics', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0.9666')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20009-overview-1440x900.png'), fullPage: false });
});

test('OMN-20009: with neither routing nor usage summary served, Overview shows no invented 0%, $0 or share', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const withoutRouting = Object.fromEntries(Object.entries(served).filter(([topic]) => topic !== ROUTING && topic !== METERING));
  await serve(page, withoutRouting);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run locally', exact: true })).toHaveCount(0);
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
  await expect(page.getByText('$0', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20009-overview-unserved-1440x900.png'), fullPage: false });
});
