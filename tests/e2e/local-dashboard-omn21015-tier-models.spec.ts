import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-21015 AC2, in a real browser: Overview's Tier mix lists each model under its tier with its runs, share and cost,
// exactly as delegation.model-routing.v1 serves them (omnimarket migration 0060). The row is constructed in the served
// shape: 3 qwen-a and 1 unpriced qwen-b on local, 2 priced gemini on cheap_cloud whose unmeasured count is not served.
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';

const routing = [{
  tenant_id: '0af28cd0-0654-42e0-a050-358ee8240940',
  by_tier: {
    total_tasks: 7, tier_routed_total: 6, not_tier_routed_count: 1,
    tiers: [
      { cost_tier_name: 'local', count: 4, tier_routed: true, pct_of_tier_routed: 0.6666666666666666, models: [
        { model_name: 'qwen-a', count: 3, pct_of_tier_routed: 0.5, cost_usd: 0, unmeasured_cost_count: 0 },
        { model_name: 'qwen-b', count: 1, pct_of_tier_routed: 0.16666666666666666, cost_usd: null, unmeasured_cost_count: 1 },
      ] },
      { cost_tier_name: 'cheap_cloud', count: 2, tier_routed: true, pct_of_tier_routed: 0.3333333333333333, models: [
        { model_name: 'gemini', count: 2, pct_of_tier_routed: 0.3333333333333333, cost_usd: 0.009 },
      ] },
    ],
  },
}];

async function serve(page: Page, served: Record<string, unknown[]>) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: Object.keys(served).map((topic) => ({ topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = served[topic];
    await route.fulfill(rows !== undefined
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }) }
      : { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) });
  });
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function cells(page: Page, name: string): Promise<string[]> {
  const row = page.getByRole('region', { name: 'Tier mix' }).getByRole('row', { name: new RegExp(`^${name}`) });
  await expect(row).toBeVisible();
  return row.getByRole('cell').allTextContents();
}

test('OMN-21015 AC2: Overview lists each model under its tier with its served runs, share and cost', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [ROUTING]: routing });
  await page.goto('/');

  const panel = page.getByRole('region', { name: 'Tier mix' });
  await expect(panel).toBeVisible();
  // Two models in one tier are two rows, each listed under its own tier.
  const names = await panel.getByRole('row').evaluateAll((rows) => rows.slice(1).map((r) => r.querySelector('td')?.textContent ?? ''));
  expect(names).toEqual(['local', 'qwen-a', 'qwen-b', 'cheap_cloud', 'gemini']);

  // Runs, share and cost exactly as served; an unpriced model is never $0, and a model with no served unmeasured count is
  // never shown as fully measured.
  expect((await cells(page, 'qwen-a')).slice(1, 4)).toEqual(['3', '0.5', '$0.00']);
  expect((await cells(page, 'qwen-b')).slice(1, 4)).toEqual(['1', '0.16666666666666666', 'Not measured (1 run)']);
  expect((await cells(page, 'gemini')).slice(1, 4)).toEqual(['2', '0.3333333333333333', '$0.009 (unpriced runs unknown)']);

  // Every column, the cost included, is readable without scrolling sideways at 1440x900: the served shares are long
  // decimals, and a table wider than its panel hid the Cost column behind a sideways scroll.
  const wrap = panel.locator('.local-dashboard-table-wrap');
  expect(await wrap.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  const panelRight = await panel.evaluate((element) => element.getBoundingClientRect().right);
  const costRights = await panel.getByRole('row').evaluateAll((rows) =>
    rows.slice(1).map((row) => row.querySelectorAll('td')[3]?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY));
  for (const right of costRights) expect(right).toBeLessThanOrEqual(panelRight);

  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-tier-models-1440x900.png'), fullPage: false });
});
