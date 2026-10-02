import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-19981 AC4: no page renders 0 for an unmeasured figure, and the default page renders at 1440x900 with no panel
// cut off. The fixtures are the served shapes read from the lakshman lane on 2026-10-02, including one unmeasured run
// (no baseline, 0 savings, no latency) next to a measured one.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';

const decisions = [
  {
    correlation_id: 'corr-19981-measured', written_at: '2026-10-02T10:07:00Z', created_at: '2026-10-02T10:07:00Z',
    model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 813,
    tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000',
    tokens_to_compliance: 214, data_source: 'real',
  },
  {
    correlation_id: 'corr-19981-unmeasured', written_at: '2026-10-02T10:01:00Z', created_at: '2026-10-02T10:01:00Z',
    model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: null,
    tokens_input: 161, tokens_output: 36, task_type: 'summarization', cost_tier_name: 'local', actual_score: null,
    tokens_to_compliance: null, data_source: 'real',
  },
];

const fixtures: Record<string, unknown[]> = {
  [DECISIONS]: decisions,
  [SAVINGS]: [{
    tenant_id: 'tenant-fresh-store',
    baseline_model: null,
    pricing_manifest_version: '1',
    sessions: [
      {
        session_id: 'corr-19981-measured', created_at: '2026-10-02T10:07:00Z', model_name: 'Qwen3.8-27B',
        prompt_tokens: 162, completion_tokens: 52, local_cost_usd: 0.0011, cloud_cost_usd: 0.000844,
        counterfactual_baseline_usd: 0.000844, baseline_model: 'claude-opus-4-6', savings_usd: 0.000844,
        usage_source: 'measured',
      },
      {
        session_id: 'corr-19981-unmeasured', created_at: '2026-10-02T10:01:00Z', model_name: 'Qwen3.8-27B',
        prompt_tokens: 161, completion_tokens: 36, local_cost_usd: 0.0004, cloud_cost_usd: null,
        counterfactual_baseline_usd: null, baseline_model: null, savings_usd: 0, usage_source: 'measured',
      },
    ],
  }],
  [OVERVIEW]: [{
    total_cost_usd: 0.00686, total_savings_usd: 1.2252, total_baseline_cost_usd: 1.2321,
    measured_run_count: 46, zero_token_run_count: 0,
  }],
  [CREDENTIALS]: [],
  [USAGE]: [],
};

async function serveFixtures(page: Page) {
  await page.addInitScript(() => {
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
        topics: Object.keys(fixtures).map((topic) => ({
          topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = fixtures[topic];
    await route.fulfill(rows === undefined
      ? { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }) });
  });
}

/** Every panel's content fits its width, and the page itself never scrolls sideways. */
async function expectNoPanelCutOff(page: Page) {
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    panels: [...document.querySelectorAll<HTMLElement>('.local-dashboard-panel')].map((panel) => ({
      title: panel.querySelector('h2')?.textContent ?? '',
      right: panel.getBoundingClientRect().right,
      overflow: panel.scrollWidth - panel.clientWidth,
    })),
  }));
  expect(layout.panels.length).toBeGreaterThan(0);
  expect(layout.documentWidth).toBeLessThanOrEqual(1440);
  for (const panel of layout.panels) {
    expect(panel.right, panel.title).toBeLessThanOrEqual(1440);
    expect(panel.overflow, panel.title).toBeLessThanOrEqual(0);
  }
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

test('Overview is the default page and fits 1440x900 with no unmeasured 0 (AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  const recent = page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: 'Recent runs' }) });
  const unmeasured = recent.getByRole('row').filter({ hasText: 'corr-19981-unmeasured' });
  await expect(unmeasured).toBeVisible();
  await expect(unmeasured.getByText('Baseline unresolved')).toBeVisible();
  await expect(unmeasured.getByText('Not recorded').first()).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toHaveCount(0);
  await expect(page.getByText('$0', { exact: true })).toHaveCount(0);

  // The headline panels sit above the fold; Recent runs starts above it.
  for (const title of ['Spend', 'Savings', 'Measured runs', 'Last run']) {
    const bounds = await page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).boundingBox();
    expect(bounds, title).not.toBeNull();
    expect(bounds!.y + bounds!.height, title).toBeLessThanOrEqual(900);
  }
  expect((await recent.boundingBox())!.y).toBeLessThan(900);
  await expectNoPanelCutOff(page);

  await page.screenshot({ path: screenshotPath('local-dashboard-overview-1440x900.png'), fullPage: false });
});

test('Runs lists every decision with typed unmeasured values at 1440x900 (AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await page.getByTestId('nav-local-runs').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Runs' })).toBeVisible();
  const unmeasured = page.getByRole('row').filter({ hasText: 'corr-19981-unmeasured' });
  await expect(unmeasured).toBeVisible();
  await expect(unmeasured.getByText('Baseline unresolved')).toHaveCount(3);
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toHaveCount(0);
  await expectNoPanelCutOff(page);

  await page.screenshot({ path: screenshotPath('local-dashboard-runs-1440x900.png'), fullPage: false });
});

test('every local page opens in order, names a served exposure, and fits 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Local' });
  await expect(nav.getByRole('button')).toHaveText([
    'Overview', 'Runs', 'Workflow partial', 'Usage partial', 'Credentials partial', 'API Keys partial',
  ].map((label) => new RegExp(`^${label.replace(' partial', '\\s*partial')}$`)));

  for (const [testId, title] of [
    ['nav-local-workflow', 'Workflow'],
    ['nav-local-usage', 'Usage'],
    ['nav-local-credentials', 'Credentials'],
    ['nav-local-api-keys', 'API Keys'],
  ] as const) {
    await page.getByTestId(testId).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/As of \d+s ago/).first()).toBeVisible();
    await expect(page.getByText('0', { exact: true })).toHaveCount(0);
    await expectNoPanelCutOff(page);
  }
});
