/**
 * OMN-12833 (WS1 Task 5): Playwright E2E proof for delegation-token-usage widget.
 *
 * Replaces the retired cost-cluster.spec.ts tests (cost-summary, cost-by-repo,
 * token-usage). Those widgets are intentionally hidden in beta because their
 * backend tables (llm_cost_aggregates, llm_call_metrics) have no live data yet.
 * This spec proves the beta-visible replacement — delegation-token-usage — renders
 * correctly against fixture data.
 *
 * Strategy:
 * 1. Seed localStorage with a dashboard containing delegation-token-usage.
 * 2. Intercept the fixture route and return deterministic inline data.
 * 3. Assert the widget renders its KPI row and per-model breakdown.
 * 4. Assert empty state when the fixture returns no rows.
 * 5. Take a screenshot for PR evidence (OMN-7093 visual output policy).
 *
 * Topic: onex.snapshot.projection.delegation.token-usage.v1
 * Fixtures served via the Vite /_fixtures middleware (FileSnapshotSource).
 */
import { test, expect, type Page, type Route } from 'playwright/test';

// ── Dashboard seeded via localStorage ────────────────────────────────────────

const TOKEN_USAGE_DASHBOARD = {
  id: 'omn-12833-delegation-token-usage-proof',
  schemaVersion: '1.0',
  name: 'OMN-12833 Token Usage Proof',
  description: 'E2E proof-of-life for delegation-token-usage widget.',
  layout: [
    {
      i: 'pol-delegation-token-usage',
      componentName: 'delegation-token-usage',
      componentVersion: '1.0.0',
      x: 0, y: 0, w: 12, h: 6,
      config: { showCost: true, showProvenance: true },
    },
  ],
  createdAt: '2026-06-30T00:00:00Z',
  updatedAt: '2026-06-30T00:00:00Z',
  author: 'omn-12833-test',
  shared: false,
};

// ── Fixture data ──────────────────────────────────────────────────────────────

const TOKEN_USAGE_POPULATED = {
  total_prompt_tokens: 284_000,
  total_completion_tokens: 96_000,
  total_tokens: 380_000,
  total_estimated_cost_usd: 1.42,
  provenance_summary: { measured: 2, estimated: 0, unknown: 0 },
  by_model: [
    {
      model_id: 'qwen3-coder-30b',
      model_name: 'Qwen3-Coder-30B',
      prompt_tokens: 180_000,
      completion_tokens: 60_000,
      total_tokens: 240_000,
      estimated_cost_usd: 0.92,
      usage_source: 'measured',
      token_provenance: 'measured',
    },
    {
      model_id: 'glm-4-plus',
      model_name: 'glm-4-plus',
      prompt_tokens: 104_000,
      completion_tokens: 36_000,
      total_tokens: 140_000,
      estimated_cost_usd: 0.50,
      usage_source: 'measured',
      token_provenance: 'measured',
    },
  ],
  captured_at: '2026-06-30T08:00:00Z',
  provisioned: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOPIC = encodeURIComponent('onex.snapshot.projection.delegation.token-usage.v1');

async function seedDashboard(page: Page) {
  await page.addInitScript(({ dashboard }) => {
    const list = JSON.stringify([dashboard]);
    localStorage.setItem('omnidash.dashboards.list.v1', list);
    localStorage.setItem('omnidash.lastActiveId.v1', dashboard.id);
  }, { dashboard: TOKEN_USAGE_DASHBOARD });
}

async function interceptPopulatedFixture(page: Page) {
  await page.route(`**/_fixtures/${TOPIC}/**`, async (route: Route) => {
    const url = route.request().url();
    if (url.endsWith('index.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['token-usage.json']),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TOKEN_USAGE_POPULATED),
      });
    }
  });
}

async function interceptEmptyFixture(page: Page) {
  await page.route(`**/_fixtures/${TOPIC}/**`, async (route: Route) => {
    const url = route.request().url();
    if (url.endsWith('index.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    } else {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

function tokenUsageWidget(page: Page) {
  return page.locator('[data-testid="grid-item"]').filter({
    has: page.getByText('Token Usage', { exact: true }),
  }).first();
}

// ── Tests — populated fixture ─────────────────────────────────────────────────

test.describe('delegation-token-usage widget — populated fixture', () => {
  test.beforeEach(async ({ page }) => {
    await interceptPopulatedFixture(page);
    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    await expect(tokenUsageWidget(page)).toBeVisible({ timeout: 10000 });
  });

  test('widget renders with Token Usage title', async ({ page }) => {
    await expect(tokenUsageWidget(page).getByText('Token Usage', { exact: true })).toBeVisible();
  });

  test('KPI row shows total tokens label', async ({ page }) => {
    await expect(tokenUsageWidget(page).getByText('Total tokens', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('KPI row shows prompt and completion labels', async ({ page }) => {
    const widget = tokenUsageWidget(page);
    await expect(widget.getByText('Prompt', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(widget.getByText('Completion', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test('per-model breakdown shows both model names', async ({ page }) => {
    const widget = tokenUsageWidget(page);
    await expect(widget.getByText('Qwen3-Coder-30B')).toBeVisible({ timeout: 10000 });
    await expect(widget.getByText('glm-4-plus')).toBeVisible({ timeout: 10000 });
  });

  test('cost column shows estimated cost', async ({ page }) => {
    await expect(tokenUsageWidget(page).getByText('Est. cost', { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

// ── Tests — empty fixture ─────────────────────────────────────────────────────

test.describe('delegation-token-usage widget — empty fixture', () => {
  test('shows empty state when no token usage data', async ({ page }) => {
    await interceptEmptyFixture(page);
    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    await expect(tokenUsageWidget(page).getByText('No token usage data')).toBeVisible({ timeout: 10000 });
  });
});

// ── Screenshot — OMN-7093 visual output policy ────────────────────────────────

test.describe('OMN-12833 — PR body screenshot', () => {
  test('screenshot: delegation-token-usage populated state', async ({ page }) => {
    await interceptPopulatedFixture(page);
    await seedDashboard(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="grid-item"]', { timeout: 15000 });
    await expect(tokenUsageWidget(page).getByText('Qwen3-Coder-30B')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/e2e/screenshots/delegation-token-usage-populated.png',
      fullPage: true,
    });
  });
});
