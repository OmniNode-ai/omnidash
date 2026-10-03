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

async function serveFixtures(page: Page, servedRows: Record<string, unknown[]> = fixtures) {
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
        topics: Object.keys(servedRows).map((topic) => ({
          topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = servedRows[topic];
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
  await expect(nav.getByRole('link')).toHaveText([
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

test('local panels follow both themes on every page without losing readable surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    for (const [name, title] of [
      ['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'],
      ['usage', 'Usage'], ['credentials', 'Credentials'], ['api-keys', 'API Keys'],
    ]) {
      await page.getByTestId(`nav-local-${name}`).click();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator('.local-dashboard-panel').first()).toBeVisible();
      const surfaces = await page.locator('.local-dashboard-panel').evaluateAll((panels) => {
        const expected = document.createElement('div');
        expected.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        return panels.map((panel) => ({
          title: panel.querySelector('h2')?.textContent,
          background: getComputedStyle(panel).backgroundColor,
          expected: expected.style.backgroundColor,
        }));
      });
      for (const surface of surfaces) expect(surface.background, `${theme} ${name} ${surface.title}`).toBe(surface.expected);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expectNoPanelCutOff(page);
    }
    await page.getByTestId('nav-local-overview').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
    await page.screenshot({ path: screenshotPath(`local-dashboard-overview-${theme}-1440x900.png`) });
  }
});

test('Overview and Runs scroll to their last row while the header stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const manyDecisions = Array.from({ length: 26 }, (_, index) => ({
    ...decisions[0], correlation_id: `scroll-run-${String(index).padStart(2, '0')}`,
    written_at: new Date(Date.UTC(2026, 9, 2, 10, 30 - index)).toISOString(),
  }));
  await serveFixtures(page, { ...fixtures, [DECISIONS]: manyDecisions });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  const scrollPage = page.locator('.local-dashboard-page');
  await expect(page.locator('.local-dashboard-table-wrap tbody tr')).toHaveCount(10);
  await expect.poll(() => scrollPage.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.mouse.move(1100, 650);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => scrollPage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const lastOverviewRow = page.locator('.local-dashboard-table-wrap tbody tr').last();
  expect((await lastOverviewRow.boundingBox())!.y + (await lastOverviewRow.boundingBox())!.height).toBeLessThanOrEqual(900);
  expect((await page.getByRole('button', { name: 'Toggle theme', exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual(0);

  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByText('Runs 1–25 of 26')).toBeAttached();
  await page.mouse.move(1100, 650);
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => scrollPage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
  const table = page.locator('.local-dashboard-table-wrap');
  const bounds = (await table.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, Math.max(100, bounds.y + bounds.height - 20));
  await page.mouse.wheel(5000, 0);
  await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Runs 26–26 of 26')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
  await page.screenshot({ path: screenshotPath('local-dashboard-runs-scroll-1440x900.png') });
});

test('manual Refresh rereads local exposures and preserves the Runs filter', async ({ page }) => {
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/projection/')) reads += 1;
  });
  await serveFixtures(page);
  await page.goto('/');
  await expect(page.getByText('$1.2252', { exact: true })).toBeVisible();
  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('passed');
  const before = reads;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads, { timeout: 3000 }).toBeGreaterThan(before);
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('passed');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
});

// Catch dark surfaces/text left in light mode, including hover, collapsed/mobile rails and rename inputs.
test('sidebar surfaces and controls follow the theme in expanded and collapsed layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  const token = async (name: string) => page.evaluate((name) => {
    const parsed = document.createElement('div');
    parsed.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return parsed.style.color;
  }, name);
  const sidebar = page.locator('.sidebar');

  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    const background = await token(theme === 'light' ? '--panel-2' : '--sidebar');
    const foreground = await token(theme === 'light' ? '--ink' : '--sidebar-ink');
    const secondary = await token(theme === 'light' ? '--ink-2' : '--sidebar-ink-2');
    const hover = theme === 'light' ? await token('--line-2') : 'oklch(0.22 0.01 260)';
    await expect(sidebar).toHaveCSS('background-color', background);
    await expect(sidebar).toHaveCSS('color', foreground);
    await expect(page.getByTestId('nav-local-runs')).toHaveCSS('color', secondary);
    await expect(page.locator('.local-nav-chip').first()).toHaveCSS('border-top-color', await token('--sidebar-line'));
    await page.getByTestId('nav-local-runs').hover();
    await expect(page.getByTestId('nav-local-runs')).toHaveCSS('background-color', hover);
    await expect(page.getByTestId('nav-local-runs')).toHaveCSS('color', foreground);

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await expect(sidebar).toHaveClass('sidebar collapsed');
      await expect(sidebar).toHaveCSS('background-color', background);
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
      await expect(sidebar).toHaveClass('sidebar');
      await expect(sidebar).toHaveCSS('background-color', background);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'New dashboard', exact: true }).click();
    const rename = sidebar.locator('input');
    await expect(rename).toBeVisible();
    await expect(rename).toHaveCSS('background-color', theme === 'light' ? await token('--panel') : 'oklch(0.28 0.01 260)');
    await rename.press('Escape');
    await page.getByTestId('nav-local-overview').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
  }
});

// Failure modes: state-only navigation, lost deep links/history, malformed filters, stale pagination and unknown paths.
test('local pages have real links, canonical URLs and survive direct opens and reloads', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('navigation', { name: 'Local' }).getByRole('link')).toHaveCount(6);
  for (const [path, title] of [
    ['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'],
    ['usage', 'Usage'], ['credentials', 'Credentials'], ['api-keys', 'API Keys'],
  ]) {
    const link = page.getByTestId(`nav-local-${path}`);
    await expect(link).toHaveAttribute('href', `/${path}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  }
  await page.goto('/runs/');
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Runs', exact: true })).toBeVisible();
});

test('Runs URL preserves filters and pagination through reload and Back/Forward', async ({ page }) => {
  const model = 'route/model with spaces';
  const many = Array.from({ length: 60 }, (_, index) => ({
    ...decisions[0], correlation_id: `route-run-${index}`, model_name: model,
    quality_gate_passed: index >= 34, quality_gate_detail: index >= 34 ? 'completed' : 'provider timeout',
    written_at: new Date(Date.UTC(2026, 9, 2, 10, 59 - index)).toISOString(),
  }));
  await serveFixtures(page, { ...fixtures, [DECISIONS]: many });
  await page.goto(`/runs?status=failed&model=${encodeURIComponent(model)}&page=2`);
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('failed');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue(model);
  await page.reload();
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await page.getByTestId('nav-local-overview').click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goBack();
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('Runs 1–25 of 34')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.getByLabel('Status', { exact: true }).selectOption('passed');
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('status')).toBe('passed');
  await page.goBack();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('failed');
  await expect(page.getByText('Runs 1–25 of 34')).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('passed');
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
});

test('bad URL values stay usable, absent models are explicit and unknown pages recover', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/runs?status=bad&window=yesterday&page=-3');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('all');
  await expect(page.getByLabel('Window', { exact: true })).toHaveValue('all');
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto('/runs?page=9999');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto('/runs?model=absent-model&cause=absent-cause');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('absent-model');
  await expect(page.getByLabel('Cause', { exact: true })).toHaveValue('absent-cause');
  await expect(page.getByText('No runs match these filters')).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByTestId('nav-local-overview')).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Go to Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
});

// Failure modes observed in Chrome: transparent selected row, no hover on selected rows,
// square targets, invisible keyboard focus, and a breadcrumb stuck on Dashboards.
test('navigation selection, hover and keyboard focus remain distinct in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/overview');
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    for (const path of ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys']) {
      const selected = page.getByTestId(`nav-local-${path}`);
      await selected.click();
      await page.mouse.move(700, 60);
      await expect(selected).toHaveAttribute('aria-current', 'page');
      await expect(selected).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(selected).toHaveCSS('border-radius', '8px');
      const selectedBackground = await selected.evaluate(el => getComputedStyle(el).backgroundColor);
      await selected.hover();
      await expect(selected).not.toHaveCSS('background-color', selectedBackground);
      const other = page.getByTestId(path === 'overview' ? 'nav-local-runs' : 'nav-local-overview');
      await page.mouse.move(700, 60);
      const resting = await other.evaluate(el => getComputedStyle(el).backgroundColor);
      await other.hover();
      await expect(other).not.toHaveCSS('background-color', resting);
      await expect(other).not.toHaveAttribute('aria-current', 'page');
      await other.focus();
      await other.press('Tab');
      const focused = page.locator('.sidebar :focus-visible');
      await expect(focused).toHaveCount(1);
      await expect(focused).toHaveCSS('outline-style', 'solid');
      await expect(focused).toHaveCSS('outline-width', '2px');
    }
    await page.getByTestId('nav-local-overview').click();
    await page.mouse.move(700, 60);
    await page.screenshot({ path: screenshotPath(`local-dashboard-navigation-${theme}-1440x900.png`) });
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expect(page.getByTestId('nav-local-overview')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  }
});

test('breadcrumbs describe the actual page through navigation and direct URLs', async ({ page }) => {
  await serveFixtures(page);
  for (const [path, title] of [['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'], ['usage', 'Usage'], ['credentials', 'Credentials'], ['api-keys', 'API Keys']]) {
    await page.goto(`/${path}`);
    await expect(page.locator('.breadcrumbs .cur')).toHaveText(title);
  }
  await page.goto('/no-such-page');
  await expect(page.locator('.breadcrumbs .cur')).toHaveText('Page not found');
});

// A dashboard can remain selected in the store while a local page is open.
// Creating from Overview must open the new canvas, and navigation must highlight only the visible page.
test('creating a dashboard opens its canvas and leaves only one selected navigation item', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'New dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator('.sidebar input').press('Escape');
  await expect(page.locator('.sidebar .dash-item.active')).toHaveCount(1);
  await page.getByTestId('nav-local-overview').click();
  await expect(page.locator('.sidebar .dash-item.active')).toHaveCount(1);
  await expect(page.getByTestId('nav-local-overview')).toHaveClass('dash-item active');
});

// The live Chrome pass showed raw, square select controls and an unnecessary scrollbar in the empty list.
test('Runs filters, pagination and table hover use readable themed controls', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/runs');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    const selects = page.locator('.local-dashboard-filters select');
    await expect(selects).toHaveCount(4);
    for (const select of await selects.all()) {
      await expect(select).toHaveCSS('border-radius', '6px');
      await expect(select).toHaveCSS('min-height', '34px');
      await expect(select).toHaveCSS('border-top-style', 'solid');
    }
    const previous = page.getByRole('button', { name: 'Previous page', exact: true });
    await expect(previous).toBeDisabled();
    await expect(previous).toHaveCSS('opacity', '0.45');
    await expect(previous).toHaveCSS('border-radius', '6px');
    const row = page.locator('.local-dashboard-table-wrap tbody tr').first();
    await page.mouse.move(1000, 70);
    const rest = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await row.hover();
    await expect(row).not.toHaveCSS('background-color', rest);
    await page.screenshot({ path: screenshotPath(`local-dashboard-controls-${theme}-1440x900.png`) });
  }
});

test('short sidebar windows scroll navigation without a cramped empty-list scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 632 });
  await serveFixtures(page);
  await page.goto('/overview');
  const emptyList = page.locator('.dash-list');
  await expect.poll(() => emptyList.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 500 });
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveCSS('overflow-y', 'auto');
  await page.getByTestId('nav-lab').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('nav-lab')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeInViewport();
});
