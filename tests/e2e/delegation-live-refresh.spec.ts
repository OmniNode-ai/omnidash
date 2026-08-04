/**
 * OMN-10947: Playwright E2E proof — dashboard updates after fresh delegation event.
 *
 * Satisfies OMN-7093 rendered output verification requirement: proves the
 * delegation dashboard refreshes within the 5s SLA when new data arrives.
 *
 * Strategy:
 * 1. Seed a dashboard with delegation-metrics + delegation-cost-breakdown widgets.
 * 2. Intercept the delegation summary fixture to return baseline data (314 delegations).
 * 3. Navigate and verify the baseline renders.
 * 4. Update the intercepted fixture to return incremented data (315 delegations, higher cost).
 * 5. Wait for the auto-refresh cycle (5s refetchInterval + 1s buffer = 6s).
 * 6. Assert the delegation count and cost breakdown updated in the DOM.
 *
 * Fixtures are served via the Vite /_fixtures middleware (FileSnapshotSource).
 * useProjectionQuery polls at refetchInterval: 5000ms.
 *
 * OMN-14896: the delegation-savings widget (savings_estimates) was retired and
 * replaced by delegation-cost-breakdown (llm_cost_aggregates via
 * cost.summary.v1) — this spec's cost-breakdown coverage was updated in the
 * same change to exercise the new widget/topic instead of the deleted one.
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
      i: 'pol-delegation-cost-breakdown',
      componentName: 'delegation-cost-breakdown',
      componentVersion: '1.0.0',
      x: 0, y: 4, w: 12, h: 5,
      config: {},
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

// Row shape from onex.snapshot.projection.cost.summary.v1 — a direct
// passthrough of llm_cost_aggregates (see DelegationCostBreakdownWidget.tsx).
const COST_BREAKDOWN_BASELINE = [
  {
    aggregation_key: 'model:qwen3-coder-30b',
    window: '24h',
    total_cost_usd: '25.44',
    total_tokens: 1_204_000,
    call_count: 12,
    updated_at: '2026-05-17T10:00:00Z',
  },
];

const COST_BREAKDOWN_AFTER_EVENT = [
  {
    ...COST_BREAKDOWN_BASELINE[0],
    total_cost_usd: '27.57',
    total_tokens: 1_318_000,
    call_count: 13,
    updated_at: '2026-05-17T10:05:00Z',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedDashboard(page: Page) {
  await page.addInitScript(({ dashboard }) => {
    const list = JSON.stringify([dashboard]);
    localStorage.setItem('omnidash.dashboards.list.v1', list);
    localStorage.setItem('omnidash.lastActiveId.v1', dashboard.id);
  }, { dashboard: DELEGATION_DASHBOARD });
}

async function selectFiveSecondAutoRefresh(page: Page) {
  await page.getByRole('button', { name: 'Auto-refresh' }).click();
  await page.getByRole('menuitem', { name: '5s' }).click();
}

function delegationMetricsWidget(page: Page) {
  return page.locator('[data-testid="grid-item"]').filter({
    has: page.getByText('Delegation Metrics', { exact: true }),
  }).first();
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
    await selectFiveSecondAutoRefresh(page);

    // Wait for the delegation metrics widget to render with baseline data
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });

    // The delegation-metrics widget renders totalDelegations as a stat.
    // Wait for "314" to appear in the page (from our baseline fixture).
    const metricsWidget = delegationMetricsWidget(page);
    await expect(metricsWidget.getByText('314', { exact: true })).toBeVisible({ timeout: 10000 });

    // -- Trigger: simulate a new delegation event by changing fixture response --
    serveSummary = SUMMARY_AFTER_EVENT;

    // Wait for auto-refresh: useProjectionQuery has refetchInterval: 5000ms
    // SLA: 5s poll + 1s buffer = 6s total
    await expect(metricsWidget.getByText('315', { exact: true })).toBeVisible({ timeout: 7000 });

    // The old value should no longer be present
    await expect(metricsWidget.getByText('314', { exact: true })).not.toBeVisible({ timeout: 2000 });
  });

  test('cost breakdown widget shows dollar amount and updates after new delegation', async ({ page }) => {
    let serveCostBreakdown = COST_BREAKDOWN_BASELINE;
    let serveSummary = SUMMARY_BASELINE;

    const summaryTopic = encodeURIComponent('onex.snapshot.projection.delegation.summary.v1');
    const costSummaryTopic = encodeURIComponent('onex.snapshot.projection.cost.summary.v1');

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

    // Intercept cost summary (llm_cost_aggregates passthrough — OMN-14896)
    await page.route(`**/_fixtures/${costSummaryTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['cost-summary.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serveCostBreakdown),
        });
      }
    });

    await seedDashboard(page);
    await page.goto('/');
    await selectFiveSecondAutoRefresh(page);

    // Wait for cost breakdown widget to render
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });

    // Cost breakdown widget displays the sum of total_cost_usd for the selected
    // window ('24h' by default) as a dollar amount via KPI. The KPI uses CountUp
    // animation. The value 25.44 should render as "$25.44".
    const costKpi = page.locator('.kpi:has(.kpi-label:text("Total cost"))');
    await expect(costKpi).toBeVisible({ timeout: 10000 });
    // Verify it shows a dollar sign (confirming currency formatting)
    await expect(costKpi.locator('.kpi-num')).toContainText('$', { timeout: 10000 });

    // -- Trigger: new delegation event updates the cost aggregate --
    serveCostBreakdown = COST_BREAKDOWN_AFTER_EVENT;
    serveSummary = SUMMARY_AFTER_EVENT;

    // Wait for refresh cycle (5s + 1s buffer)
    // The new total cost value is 27.57 — wait for "27.57" to appear
    await expect(costKpi.locator('.kpi-num')).toContainText('27.57', { timeout: 7000 });
  });

  test('screenshot: delegation dashboard populated state (OMN-7093)', async ({ page }) => {
    const summaryTopic = encodeURIComponent('onex.snapshot.projection.delegation.summary.v1');
    const costSummaryTopic = encodeURIComponent('onex.snapshot.projection.cost.summary.v1');

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

    await page.route(`**/_fixtures/${costSummaryTopic}/**`, async (route: Route) => {
      const url = route.request().url();
      if (url.endsWith('index.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['cost-summary.json']),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(COST_BREAKDOWN_BASELINE),
        });
      }
    });

    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    // Wait for data to render
    await expect(delegationMetricsWidget(page).getByText('314', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'tests/e2e/screenshots/delegation-live-refresh-populated.png',
      fullPage: true,
    });
  });
});
