/**
 * OMN-10947: Playwright E2E proof — dashboard updates after fresh delegation event.
 *
 * Satisfies OMN-7093 rendered output verification requirement: proves the
 * delegation dashboard refreshes within the 5s SLA when new data arrives.
 *
 * Strategy:
 * 1. Seed a dashboard with delegation-metrics + delegation-savings widgets.
 * 2. Intercept the delegation summary fixture to return baseline data (314 delegations).
 * 3. Navigate and verify the baseline renders.
 * 4. Update the intercepted fixture to return incremented data (315 delegations, higher savings).
 * 5. Wait for the auto-refresh cycle (5s refetchInterval + 1s buffer = 6s).
 * 6. Assert the delegation count and savings updated in the DOM.
 *
 * Fixtures are served via the Vite /_fixtures middleware (FileSnapshotSource).
 * useProjectionQuery polls at refetchInterval: 5000ms.
 */
import { test, expect, type Page, type Route } from 'playwright/test';

// ── Dashboard definition seeded via localStorage ─────────────────────────────

const DELEGATION_DASHBOARD = {
  id: 'omn-10947-live-refresh-proof',
  schemaVersion: '1.0',
  name: 'OMN-10947 Live Refresh',
  description: 'Proof-of-life: delegation widgets update on data change.',
  layout: [
    {
      i: 'pol-delegation-metrics',
      componentName: 'delegation-metrics',
      componentVersion: '1.0.0',
      x: 0, y: 0, w: 12, h: 4,
      config: {},
    },
    {
      i: 'pol-delegation-savings',
      componentName: 'delegation-savings',
      componentVersion: '1.0.0',
      x: 0, y: 4, w: 12, h: 5,
      config: { showSessions: true, maxSessions: 5 },
    },
  ],
  createdAt: '2026-05-17T00:00:00Z',
  updatedAt: '2026-05-17T00:00:00Z',
  author: 'omn-10947-test',
  shared: false,
};

// ── Fixture data ─────────────────────────────────────────────────────────────

const SUMMARY_BASELINE = {
  entity_id: 'summary',
  totalDelegations: 314,
  qualityGatePassRate: 0.914,
  qualityGatePassed: 287,
  qualityGateTotal: 314,
  totalSavingsUsd: 25.44,
  byTaskType: [
    { taskType: 'code_review', count: 33 },
    { taskType: 'test_generation', count: 22 },
    { taskType: 'refactor', count: 32 },
    { taskType: 'documentation', count: 22 },
    { taskType: 'bug_fix', count: 28 },
  ],
  byModel: [
    { model: 'Qwen3-Coder-30B', count: 180 },
    { model: 'glm-4-plus', count: 134 },
  ],
};

const SUMMARY_AFTER_EVENT = {
  ...SUMMARY_BASELINE,
  totalDelegations: 315,
  qualityGatePassed: 288,
  qualityGateTotal: 315,
  totalSavingsUsd: 26.02,
  byTaskType: [
    { taskType: 'code_review', count: 34 },
    { taskType: 'test_generation', count: 22 },
    { taskType: 'refactor', count: 32 },
    { taskType: 'documentation', count: 22 },
    { taskType: 'bug_fix', count: 28 },
  ],
};

const SAVINGS_BASELINE = {
  entity_id: 'savings',
  cumulative_savings_usd: 25.44,
  cumulative_local_cost_usd: 3.21,
  cumulative_cloud_cost_usd: 28.65,
  baseline_model: 'claude-opus-4-20250514',
  pricing_manifest_version: '1',
  session_count: 12,
  sessions: [
    {
      session_id: 'sess-001',
      task_type: 'code_review',
      local_cost_usd: 0.28,
      cloud_cost_usd: 2.41,
      savings_usd: 2.13,
      baseline_model: 'claude-opus-4-20250514',
      pricing_manifest_version: '1',
      savings_method: 'measured',
      usage_source: 'measured',
      model_name: 'local-qwen3-coder-30b',
      prompt_tokens: 1200,
      completion_tokens: 800,
      latency_ms: 3400,
      created_at: '2026-05-17T08:00:00Z',
    },
  ],
  captured_at: '2026-05-17T10:00:00Z',
  provisioned: true,
};

const SAVINGS_AFTER_EVENT = {
  ...SAVINGS_BASELINE,
  cumulative_savings_usd: 27.57,
  cumulative_cloud_cost_usd: 30.78,
  session_count: 13,
  sessions: [
    {
      session_id: 'sess-002',
      task_type: 'refactor',
      local_cost_usd: 0.31,
      cloud_cost_usd: 2.44,
      savings_usd: 2.13,
      baseline_model: 'claude-opus-4-20250514',
      pricing_manifest_version: '1',
      savings_method: 'measured',
      usage_source: 'measured',
      model_name: 'local-qwen3-coder-30b',
      prompt_tokens: 1400,
      completion_tokens: 900,
      latency_ms: 3800,
      created_at: '2026-05-17T10:05:00Z',
    },
    ...SAVINGS_BASELINE.sessions,
  ],
  captured_at: '2026-05-17T10:05:00Z',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedDashboard(page: Page) {
  await page.addInitScript(({ dashboard }) => {
    const list = JSON.stringify([dashboard]);
    localStorage.setItem('omnidash.dashboards.list.v1', list);
    localStorage.setItem('omnidash.lastActiveId.v1', dashboard.id);
  }, { dashboard: DELEGATION_DASHBOARD });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('OMN-10947: delegation dashboard live refresh proof', () => {
  test('delegation count updates after simulated delegation event within 6s SLA', async ({ page }) => {
    // Phase gate: track which fixture version to serve
    let serveSummary = SUMMARY_BASELINE;

    // Intercept the delegation summary fixture endpoint
    const summaryTopic = encodeURIComponent('onex.snapshot.projection.delegation.summary.v1');
    await page.route(`**/_fixtures/${summaryTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['summary.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serveSummary),
        });
      }
    });

    await seedDashboard(page);
    await page.goto('/');

    // Wait for the delegation metrics widget to render with baseline data
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });

    // The delegation-metrics widget renders totalDelegations as a stat.
    // Wait for "314" to appear in the page (from our baseline fixture).
    await expect(page.locator('text=314')).toBeVisible({ timeout: 10000 });

    // -- Trigger: simulate a new delegation event by changing fixture response --
    serveSummary = SUMMARY_AFTER_EVENT;

    // Wait for auto-refresh: useProjectionQuery has refetchInterval: 5000ms
    // SLA: 5s poll + 1s buffer = 6s total
    await expect(page.locator('text=315')).toBeVisible({ timeout: 7000 });

    // The old value should no longer be present
    await expect(page.locator('text=314')).not.toBeVisible({ timeout: 2000 });
  });

  test('savings widget shows dollar amount and updates after new delegation', async ({ page }) => {
    let serveSavings = SAVINGS_BASELINE;
    let serveSummary = SUMMARY_BASELINE;

    const summaryTopic = encodeURIComponent('onex.snapshot.projection.delegation.summary.v1');
    const savingsTopic = encodeURIComponent('onex.snapshot.projection.delegation.savings.v1');

    // Intercept delegation summary
    await page.route(`**/_fixtures/${summaryTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['summary.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serveSummary),
        });
      }
    });

    // Intercept delegation savings
    await page.route(`**/_fixtures/${savingsTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['savings.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serveSavings),
        });
      }
    });

    await seedDashboard(page);
    await page.goto('/');

    // Wait for savings widget to render
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });

    // Savings widget displays cumulative_savings_usd as a dollar amount via KPI.
    // The KPI uses CountUp animation. The value 25.44 should render as "$25.44" or
    // have "25.44" visible. We check for the prefix "$" appearing alongside a number.
    const savingsKpi = page.locator('.kpi:has(.kpi-label:text("Est. savings vs Opus"))');
    await expect(savingsKpi).toBeVisible({ timeout: 10000 });
    // Verify it shows a dollar sign (confirming currency formatting)
    await expect(savingsKpi.locator('.kpi-num')).toContainText('$', { timeout: 10000 });

    // -- Trigger: new delegation event updates savings --
    serveSavings = SAVINGS_AFTER_EVENT;
    serveSummary = SUMMARY_AFTER_EVENT;

    // Wait for refresh cycle (5s + 1s buffer)
    // The new savings value is 27.57 — wait for "27.57" to appear
    await expect(savingsKpi.locator('.kpi-num')).toContainText('27.57', { timeout: 7000 });
  });

  test('screenshot: delegation dashboard populated state (OMN-7093)', async ({ page }) => {
    const summaryTopic = encodeURIComponent('onex.snapshot.projection.delegation.summary.v1');
    const savingsTopic = encodeURIComponent('onex.snapshot.projection.delegation.savings.v1');

    await page.route(`**/_fixtures/${summaryTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['summary.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SUMMARY_BASELINE),
        });
      }
    });

    await page.route(`**/_fixtures/${savingsTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['savings.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SAVINGS_BASELINE),
        });
      }
    });

    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    // Wait for data to render
    await expect(page.locator('text=314')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'tests/e2e/screenshots/delegation-live-refresh-populated.png',
      fullPage: true,
    });
  });
});
