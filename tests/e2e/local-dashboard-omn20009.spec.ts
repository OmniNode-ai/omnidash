import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-20009: the Overview's Run locally share and Avg saving / call at 1440x900, from served exposures only, never 0
// when unmeasured. The model-routing row is the lakshman lane's by_tier on 2026-10-04 14:26Z (104 local of 124 runs,
// 20 not tier-routed) with the keys the OMN-20009 view adds. metering-summary.v1 is not served on the lab yet, so the
// per-run saving card waits on it.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';

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

const panel = (page: Page, title: string) =>
  page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

test('OMN-20009: Run locally shows the served share and Avg saving / call waits on its exposure, at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, served);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  const share = panel(page, 'Run locally');
  await expect(share.getByText('83.9%', { exact: true })).toBeVisible();
  await expect(share.getByText('104 of 124 runs local · 20 not tier-routed')).toBeVisible();
  // The tier-routed share the view also serves (local 100 %) is never the run-locally figure.
  await expect(share.getByText('100.0%')).toHaveCount(0);

  const saving = panel(page, 'Avg saving / call');
  await expect(saving.getByText('Not served yet: waits on metering-summary.v1')).toBeVisible();
  await expect(saving.getByText(/\$0/)).toHaveCount(0);

  // The two cards sit in the row under Last run: each fits one 1440x900 screen whole once scrolled to, and nothing
  // is cut off sideways. (Above the fold stay Spend, Savings, Measured runs and Last run, the existing AC4 check.)
  for (const card of [share, saving]) {
    await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(card).toBeInViewport({ ratio: 1 });
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeLessThanOrEqual(900);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await share.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20009-overview-1440x900.png'), fullPage: false });
});

test('OMN-20009: with neither exposure served, both cards say why and neither shows 0', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { [ROUTING]: _routing, ...withoutRouting } = served;
  await serve(page, withoutRouting);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  const share = panel(page, 'Run locally');
  await expect(share.getByText(`Not served: ${ROUTING}`)).toBeVisible();
  await expect(share.getByText(/%/)).toHaveCount(0);
  const saving = panel(page, 'Avg saving / call');
  await expect(saving.getByText('Not served yet: waits on metering-summary.v1')).toBeVisible();
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
  await expect(page.getByText('$0', { exact: true })).toHaveCount(0);
  await share.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20009-overview-unserved-1440x900.png'), fullPage: false });
});
