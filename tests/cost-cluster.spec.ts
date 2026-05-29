/**
 * OMN-10305: Playwright E2E proof-of-life for cost-trend cluster widgets.
 *
 * R10 mandatory: rendered-output assertions against displayContract.
 * Per-widget: populated fixture + per-reason empty-state verification.
 *
 * Fixtures served by the Vite dev server via /_fixtures middleware from the
 * fixtures/ directory. Dev fixtures seeded by OMN-10305.
 *
 * Storage: seeds localStorage with a test dashboard containing all 3 widgets,
 * then navigates to the app and asserts rendered DOM.
 */
import { test, expect, type Page } from 'playwright/test';

// Dashboard definition seeded via localStorage. Layout contains all 3 new
// cost-cluster widgets so we can assert each in one page load.
const COST_CLUSTER_DASHBOARD = {
  id: 'omn-10305-proof-of-life',
  schemaVersion: '1.0',
  name: 'OMN-10305 Proof of Life',
  description: 'Automated proof-of-life dashboard for cost-cluster widgets.',
  layout: [
    {
      i: 'pol-cost-summary',
      componentName: 'cost-summary',
      componentVersion: '1.0.0',
      x: 0, y: 0, w: 12, h: 3,
      config: {},
    },
    {
      i: 'pol-cost-by-repo',
      componentName: 'cost-by-repo',
      componentVersion: '1.0.0',
      x: 0, y: 3, w: 6, h: 5,
      config: {},
    },
    {
      i: 'pol-token-usage',
      componentName: 'token-usage',
      componentVersion: '1.0.0',
      x: 6, y: 3, w: 6, h: 5,
      config: {},
    },
  ],
  createdAt: '2026-04-29T00:00:00Z',
  updatedAt: '2026-04-29T00:00:00Z',
  author: 'omn-10305-test',
  shared: false,
};

async function seedDashboard(page: Page) {
  await page.addInitScript(({ dashboard }) => {
    const list = JSON.stringify([dashboard]);
    localStorage.setItem('omnidash.dashboards.list.v1', list);
    localStorage.setItem('omnidash.lastActiveId.v1', dashboard.id);
  }, { dashboard: COST_CLUSTER_DASHBOARD });
}

async function waitForCostSummary(page: Page) {
  await expect(page.getByText('Cost summary · last 7 days')).toBeVisible({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// cost-summary — KPI tile cluster: 3 tiles with formatted values
// ---------------------------------------------------------------------------

test.describe('cost-summary widget — populated fixture (R9/R10)', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page);
    await page.goto('/');
    // Wait for the dashboard to render at least one widget.
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    await waitForCostSummary(page);
  });

  test('renders compact cost-summary KPI surface', async ({ page }) => {
    await expect(page.getByText('Cloud spend', { exact: true })).toBeVisible();
    await expect(page.getByText('Avoided', { exact: true })).toBeVisible();
    await expect(page.getByText('Tokens', { exact: true })).toBeVisible();
  });

  test('total-cost tile shows currency-formatted value $12.34', async ({ page }) => {
    await expect(page.getByText('$12.34')).toBeVisible({ timeout: 10000 });
  });

  test('total-savings tile shows currency-formatted value $4.56', async ({ page }) => {
    await expect(page.getByText('$4.56').first()).toBeVisible({ timeout: 10000 });
  });

  test('total-tokens tile shows compact formatted count 1.2M', async ({ page }) => {
    await expect(page.getByText('1.2M')).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// cost-summary — empty fixture falls back to deterministic synthetic summary
// ---------------------------------------------------------------------------

test.describe('cost-summary widget — empty fixture synthetic fallback', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a dashboard with cost-summary but intercept the index.json to return []
    // so FileSnapshotSource fetches 0 records. The current adapter intentionally
    // keeps a deterministic synthetic fallback surface instead of an empty tile.
    await seedDashboard(page);
    await page.route(
      '**/_fixtures/**/index.json',
      (route) => route.fulfill({ status: 200, body: '[]', contentType: 'application/json' }),
    );
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
  });

  test('renders synthetic fallback summary when projection empty', async ({ page }) => {
    await waitForCostSummary(page);
    await expect(page.getByText('75%')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('$487.62').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('38.4M')).toBeVisible({ timeout: 10000 });
  });

  test('empty fixture does not render a fetch error', async ({ page }) => {
    await waitForCostSummary(page);
    await expect(page.getByText(/Failed to fetch|Error:/)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// cost-by-repo — bar chart: 3 bars with repo_name labels
// ---------------------------------------------------------------------------

test.describe('cost-by-repo widget — populated fixture (R9/R10)', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    // BarChart renders barchart-canvas wrapper.
    await page.waitForSelector('[data-testid="barchart-canvas"]', { timeout: 15000 });
  });

  test('renders barchart-canvas wrapper for cost-by-repo', async ({ page }) => {
    const canvas = page.locator('[data-testid="barchart-canvas"]').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test('no empty-reason attribute on barchart-canvas when fixture populated', async ({ page }) => {
    // populated fixture → no empty state inside barchart-canvas.
    const empty = page.locator('[data-testid="barchart-canvas"] [data-empty-reason]');
    await expect(empty).toHaveCount(0, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// cost-by-repo — upstream-blocked empty state (missing repo_name)
// ---------------------------------------------------------------------------

test.describe('cost-by-repo widget — upstream-blocked (missing-field reason)', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page);
    // Intercept the cost-by-repo index.json and individual file to return rows without repo_name.
    const encodedTopic = encodeURIComponent('onex.snapshot.projection.cost.by_repo.v1');
    await page.route(
      `**/_fixtures/${encodedTopic}/index.json`,
      (route) => route.fulfill({
        status: 200,
        body: JSON.stringify(['upstream-blocked.json']),
        contentType: 'application/json',
      }),
    );
    await page.route(
      `**/_fixtures/${encodedTopic}/upstream-blocked.json`,
      (route) => route.fulfill({
        status: 200,
        body: JSON.stringify({ aggregation_key: 'repo:omniclaude', total_cost_usd: 5.0, window: '7d' }),
        contentType: 'application/json',
      }),
    );
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
  });

  test('renders missing-field empty state when repo_name absent', async ({ page }) => {
    const emptyEl = page.locator('[data-testid="barchart-canvas"] [data-empty-reason="missing-field"]');
    await expect(emptyEl).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// token-usage — trend chart: 5 hourly buckets
// ---------------------------------------------------------------------------

test.describe('token-usage widget — populated fixture (R9/R10)', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    // TrendChart renders trendchart-canvas wrapper.
    await page.waitForSelector('[data-testid="trendchart-canvas"]', { timeout: 15000 });
  });

  test('renders trendchart-canvas wrapper for token-usage', async ({ page }) => {
    const canvas = page.locator('[data-testid="trendchart-canvas"]').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test('no empty-reason displayed when fixture has 5 populated buckets', async ({ page }) => {
    const empty = page.locator('[data-testid="trendchart-empty"]');
    await expect(empty).toHaveCount(0, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// token-usage — no-data empty state
// ---------------------------------------------------------------------------

test.describe('token-usage widget — no-data empty state', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboard(page);
    // Intercept the token-usage index.json to return [] so no records are fetched.
    const encodedTopic = encodeURIComponent('onex.snapshot.projection.cost.token_usage.v1');
    await page.route(
      `**/_fixtures/${encodedTopic}/index.json`,
      (route) => route.fulfill({ status: 200, body: '[]', contentType: 'application/json' }),
    );
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
  });

  test('renders trendchart-empty with no-data reason when fixture empty', async ({ page }) => {
    const empty = page.locator('[data-testid="trendchart-empty"][data-empty-reason="no-data"]');
    await expect(empty).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Sub-task 5: Screenshots for PR body (OMN-7093 visual output policy)
// ---------------------------------------------------------------------------

test.describe('OMN-10305 sub-task 5 — PR body screenshots', () => {
  test('screenshot: cost-summary + cost-by-repo + token-usage populated dashboard', async ({ page }) => {
    await seedDashboard(page);
    await page.goto('/');
    await waitForCostSummary(page);
    await page.waitForSelector('[data-testid="barchart-canvas"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="trendchart-canvas"]', { timeout: 10000 });
    // Wait for any loading states to resolve.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/cost-cluster-populated.png', fullPage: true });
  });

  test('screenshot: cost-summary empty state (no-data)', async ({ page }) => {
    await seedDashboard(page);
    await page.route('**/_fixtures/**/index.json', (route) =>
      route.fulfill({ status: 200, body: '[]', contentType: 'application/json' }),
    );
    await page.goto('/');
    await waitForCostSummary(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/cost-summary-empty.png', fullPage: true });
  });
});
