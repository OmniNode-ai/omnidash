import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'playwright/test';

const overviewTopic = 'onex.snapshot.projection.baselines.roi.v1';
const runsTopic = 'onex.snapshot.projection.swarm.runs.v1';
const screenshotPath = resolve(
  process.cwd(),
  'tests/e2e/screenshots/local-dashboard-overview-1440x900.png',
);

test('Overview shows typed unresolved state at 1440x900 with no clipped panel or zero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'omnidash.dataSourceOverride.v1',
      JSON.stringify({ mode: 'live', baseUrl: window.location.origin }),
    );
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [overviewTopic, runsTopic].map((topic) => ({
          topic,
          status: 'ok',
          backing: 'bus',
          tenant_scoped: false,
          tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = topic === overviewTopic
      ? [{ roi_percent: null, baseline_state: 'BASELINE_UNRESOLVED', savings_usd: null }]
      : [{ run_id: 'run-unmeasured', status: 'RUNNING', started_at: '2026-10-01T00:00:00Z', savings_usd: null }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }),
    });
  });

  await page.goto('/');
  await page.getByTestId('nav-local-overview').click();
  const panel = page.locator('.local-dashboard-panel').filter({ hasText: 'Return on investment' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Baseline unresolved')).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toHaveCount(0);

  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);

  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
});
