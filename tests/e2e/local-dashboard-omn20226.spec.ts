import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-20226: the Overview's Compression and Cache hit rate at 1440x900, each a served metering-summary.v1 column and
// "Not measured" while nothing produces it -- never 0, 0%, 0.00 or a blank (AC1, AC2). The served row is the all-time
// row a fresh .201 install folded from three real delegations on 2026-10-07 06:00Z (omnimarket#3508's migration 0003
// applied): the per-run saving is measured, compression and cache hit rate are null.
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const CARDS = ['Compression', 'Cache hit rate'] as const;

const freshAllRow = {
  tenant_id: '5b2a5378-1b8b-4cb8-be8e-2b8be90d4e8e', window_kind: 'all', window_start: '',
  window_end: '2026-10-07T06:00:57.756640+00:00', as_of: '2026-10-07T06:00:57.756640+00:00',
  baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', baseline_state: 'resolved',
  runs_total: 3, runs_measured: 3, runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 807, tokens_out: 152,
  spend_usd: '0.0', counterfactual_usd: '0.003134', savings_usd: '0.003134', savings_per_measured_run_usd: '0.001045',
  compression_ratio: null, cache_hit_rate: null, runs_cache_answered: null,
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

// OMN-21166 AC86 (Lakshman 2026-10-25): the Compression and Cache hit rate cards (and the whole "Additional runtime
// metrics" disclosure, Avg saving / call included) are deleted from Overview. What these tests protect still applies to
// the surviving headline cards: they fit at 1440x900, and an unserved metering-summary.v1 shows a typed state,
// never a number.
const SUMMARY_CARDS = ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'] as const;

test('OMN-20226: on a fresh store the deleted cards stay gone and the headline cards read the fresh row and fit, at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The all-time spend and savings cards read cost.savings-overview.v1 beside the metering row (as on dev).
  await serve(page, { [METERING]: [freshAllRow], 'onex.snapshot.projection.cost.savings-overview.v1': [{
    window: 'all', captured_at: '2026-10-07T06:00:57Z', total_cost_usd: '0.0', total_savings_usd: '0.003134', run_count: 3 }] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  // The control: the same row's measured figures render, so the page did read this row.
  await expect(page.locator('[data-component="overview-measured"] .local-dashboard-metric')).toHaveText('3');
  // OMN-21166 AC86 (Lakshman 2026-10-25): Compression, Cache hit rate and Avg saving / call are deleted from Overview.
  for (const title of [...CARDS, 'Avg saving / call']) await expect(panel(page, title)).toHaveCount(0);
  await expect(page.locator('.local-overview-secondary')).toHaveCount(0);
  await expect(page.locator('.local-dashboard-page')).not.toContainText(/Compression|Cache hit rate/);
  for (const id of SUMMARY_CARDS) {
    const card = page.locator(`[data-component="${id}"]`);
    await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(card).toBeInViewport({ ratio: 1 });
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20226-overview-1440x900.png'), fullPage: false });
});

test('OMN-20226: with metering-summary.v1 not served, the headline cards say so and show no number', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, {});
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  for (const id of SUMMARY_CARDS) {
    const card = page.locator(`[data-component="${id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.local-dashboard-metric')).toHaveCount(0);
    await expect(card.getByRole('status')).toContainText('Not available yet');
    await expect(card).not.toContainText(/\d/);
  }
  await page.locator('[data-component="overview-spend"]').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20226-overview-unserved-1440x900.png'), fullPage: false });
});
