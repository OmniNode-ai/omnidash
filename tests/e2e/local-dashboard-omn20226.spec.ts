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

test('OMN-20226: on a fresh store Compression and Cache hit rate are Not measured, never 0, at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [METERING]: [freshAllRow] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  // The control: the same row's measured per-run saving renders, so the page did read this row.
  await expect(panel(page, 'Avg saving / call').getByText('$0.001045', { exact: true })).toBeVisible();
  for (const title of CARDS) {
    const card = panel(page, title);
    await expect(card.locator('.local-dashboard-metric')).toHaveText('Not measured');
    await expect(card.getByText(/^-?\d|%$|x$/)).toHaveCount(0);
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

test('OMN-20226: with metering-summary.v1 not served, both cards say so and show no number', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, {});
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  for (const title of CARDS) {
    const card = panel(page, title);
    await expect(card.getByText(`Not served: ${METERING}`)).toBeVisible();
    await expect(card.locator('.local-dashboard-metric')).toHaveCount(0);
  }
  await panel(page, 'Compression').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: screenshotPath('local-dashboard-omn20226-overview-unserved-1440x900.png'), fullPage: false });
});
