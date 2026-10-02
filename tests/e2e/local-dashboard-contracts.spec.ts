import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'playwright/test';

const overviewTopic = 'onex.snapshot.projection.baselines.roi.v1';
const runsTopic = 'onex.snapshot.projection.delegation.savings.v1';
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

test('Runs renders delegation sessions at 1440x900 from a fresh store without measured zero', async ({ page }) => {
  const runsScreenshotPath = resolve(
    process.cwd(),
    'tests/e2e/screenshots/local-dashboard-runs-1440x900.png',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    // Start from a clean browser store so persisted dashboard state cannot hide a
    // missing current Runs contract or manufacture a numeric fallback.
    localStorage.clear();
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
        topics: [{
          topic: runsTopic,
          status: 'ok',
          backing: 'bus',
          // Tenant resolution is covered by the focused projection-tenant
          // suite; this browser proof isolates current Runs rendering.
          tenant_scoped: false,
          tenant_column: null,
        }],
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [{
          tenant_id: 'tenant-fresh-store',
          sessions: [
            {
              session_id: 'corr-19981-01',
              created_at: '2026-10-01T00:00:00Z',
              model_name: 'qwen3-coder',
              prompt_tokens: 120,
              completion_tokens: 80,
              local_cost_usd: 0.12,
              counterfactual_baseline_usd: 0.48,
              baseline_model: 'claude-opus-4.1',
              savings_usd: 0.36,
              usage_source: 'projection',
              task_type: 'coding',
              latency_ms: 420,
              tokens_to_compliance: 200,
            },
            {
              session_id: 'corr-19981-unmeasured',
              created_at: '2026-10-01T00:01:00Z',
              model_name: 'qwen3-coder',
              prompt_tokens: 100,
              completion_tokens: 50,
              local_cost_usd: 0.1,
              counterfactual_baseline_usd: null,
              baseline_model: null,
              savings_usd: 0,
              usage_source: 'projection',
              task_type: 'coding',
              latency_ms: 390,
              tokens_to_compliance: 150,
            },
          ],
        }],
        row_count: 1,
        data_freshness: 'fresh',
      }),
    });
  });

  await page.goto('/');
  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
  await expect(page.getByText('corr-19981-01')).toBeVisible();
  await expect(page.getByText('corr-19981-unmeasured')).toBeVisible();
  await expect(page.getByText('Baseline unresolved')).toHaveCount(3);
  await expect(page.getByText('$0', { exact: false })).toHaveCount(0);

  const panels = page.locator('.local-dashboard-panel');
  const panelCount = await panels.count();
  expect(panelCount).toBeGreaterThan(0);
  for (let index = 0; index < panelCount; index += 1) {
    const bounds = await panels.nth(index).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  }

  mkdirSync(dirname(runsScreenshotPath), { recursive: true });
  await page.screenshot({ path: runsScreenshotPath, fullPage: false });
});
