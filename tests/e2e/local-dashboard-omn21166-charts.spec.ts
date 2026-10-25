import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, runIds, serveCharts } from './omn21166-chart-fixtures';

// Failure modes declared before implementation: wrong bar after hiding/zoom;
// stale selection after filters; missing value becomes zero; unknown day filled;
// keyboard/touch cannot inspect; selection changes table; chart ignores reduced motion.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', actionTimeout: 5000 });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

// OMN-21166 part 13: Runs' four run charts and "This week" sit under the closed "More run charts" section.
async function openRunCharts(page: Page) {
  await page.getByText('More run charts', { exact: true }).press('Enter');
  await expect(page.locator('details.local-more').filter({ hasText: 'More run charts' })).toHaveAttribute('open', '');
}

test('single-token chart axis never marks valid fractional tick coordinates as missing data', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: [{
    ...chartRows[prefix + 'delegation.decisions.v1'][0] as object,
    tokens_input: 1, tokens_output: 0,
  }] });
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  await expect(chart.locator('svg text').filter({ hasText: 'Not measured' })).toHaveCount(0);
  await expect(chart.locator('svg text').filter({ hasText: /^1$/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('single-token-axis.png') });
});

test('chart zoom/reset changes visible range without changing table or selected identity', async ({ page }, info) => {
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible(); // positive control, actual renderer
  const tableBefore = await page.locator('[data-component="recent-runs"] table').innerText();
  await chart.getByLabel('Inspect run').selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b/);
  await chart.getByLabel('First point').focus();
  await chart.getByLabel('First point').press('ArrowRight');
  await expect(chart.getByText('Showing 2–3 of 3')).toBeVisible();
  await chart.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(chart.getByText('Showing 1–3 of 3')).toBeVisible();
  expect(await page.locator('[data-component="recent-runs"] table').innerText()).toBe(tableBefore);
  await chart.getByRole('link', { name: 'Open run', exact: true }).click();
  await expect(page).toHaveURL(/workflow\?correlation_id=chart-run-b/);
  await page.screenshot({ path: info.outputPath('selected-run-workflow.png') });
});

test('chart selected run is cleared after filtering rather than opening a different index', async ({ page }) => {
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  await chart.getByLabel('Inspect run').selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /chart-run-b/);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('passed');
  await expect(chart.getByLabel('Inspect run')).toHaveValue('');
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-component="recent-runs"] table')).not.toContainText('chart-run-b');
});

test('an actual bar opens its exact run after a series is hidden and the range is zoomed', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  await chart.getByRole('button', { name: 'Tokens in', exact: true }).click();
  await chart.getByLabel('First point').focus();
  await chart.getByLabel('First point').press('ArrowRight');
  await expect(chart.getByText('Showing 2–3 of 3')).toBeVisible();
  const color = await chart.getByRole('button', { name: 'Tokens out', exact: true }).locator('[data-swatch]').evaluate(el => getComputedStyle(el).backgroundColor);
  // Locate the visible painted bar through the SVG's geometry and legend color,
  // not chart-library internals. Only run B has measured output in this range.
  await expect.poll(async () => chart.locator('.local-chart-canvas svg path').evaluateAll((els, color) => els.filter(el => {
    const box=el.getBoundingClientRect(), canvas=el.closest('svg')!.getBoundingClientRect();
    return getComputedStyle(el).fill === color && box.width>3 && box.height>3 && box.left>=canvas.left && box.right<=canvas.right;
  }).length, color)).toBe(1);
  const box = await chart.locator('.local-chart-canvas svg path').evaluateAll((els, color) => {
    const el=els.find(el => { const b=el.getBoundingClientRect(), c=el.closest('svg')!.getBoundingClientRect(); return getComputedStyle(el).fill===color && b.width>3 && b.height>3 && b.left>=c.left && b.right<=c.right; })!;
    const b=el.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2};
  },color);
  await page.mouse.move(box.x,box.y);
  await expect(chart.locator('.local-chart-canvas')).toContainText('chart-run-b');
  await page.mouse.click(box.x,box.y);
  await expect(page).toHaveURL(/workflow\?correlation_id=chart-run-b/);
  await page.screenshot({path:info.outputPath('actual-bar-exact-run.png')});
});

// OMN-21166 AC86 (Lakshman 2026-10-25): Spend per day (the money chart, its day inspector and its table) is deleted from
// Overview, so "money explorer preserves precise served zero and missing values, table and baseline" is retired with it.
// The zero-versus-missing property for days is held on the Overview window by AC85 (see the overview-window specs).

test('tier selection pins on keyboard/touch, resets, and preserves served denominator', async ({ page }) => {
  // OMN-21166 Maple grid: Overview's tier mix is non-interactive ranked bars that print every served share; the pinnable
  // tier bars are Runs' routing breakdown, under "More analysis". Both keep the served denominator. Tier names read
  // "Local"/"Cloud" (OMN-21166 readable tier names, tierLabel).
  await page.goto('/overview');
  const overview = page.getByRole('region', { name: 'Tier mix', exact: true });
  await expect(overview.getByRole('listitem', { name: 'Local: 6 · 75.0%, measured', exact: true })).toBeVisible();
  await expect(overview.getByRole('listitem', { name: 'Cloud: 2 · 25.0%, measured', exact: true })).toBeVisible();
  await expect(overview).toContainText('2 not tier-routed');
  await page.goto('/runs');
  await page.getByText('More analysis', { exact: true }).press('Enter');
  const area = page.getByRole('region', { name: 'Tier mix', exact: true });
  const tier = area.getByRole('button', { name: 'Inspect Local', exact: true });
  await tier.press('Enter');
  await expect(tier).toHaveAttribute('aria-pressed', 'true');
  await expect(area.getByRole('status')).toContainText('75.0% of tier-routed runs');
  await expect(area.getByRole('status')).toContainText('6 runs');
  await area.getByRole('button', { name: 'Clear tier selection' }).click();
  await expect(tier).toHaveAttribute('aria-pressed', 'false');
  await expect(area).toContainText('Not tier-routed');
});

test('usage model highlighting does not change figures, table or other model colors', async ({ page }) => {
  await page.goto('/usage');
  // OMN-21166 Maple grid: the page's Tokens per day is a stacked chart that prints each served count in the day's label;
  // the highlight control and the per-day list are the detail under "More usage".
  await expect(page.locator('[data-component="usage-tokens-by-day"]:not([data-slice]) li[data-token-day="2026-10-01"]')).toHaveAttribute('aria-label', /model-a: 162/);
  await page.getByText('More usage', { exact: true }).press('Enter');
  const panel = page.locator('[data-component="usage-tokens-by-day"][data-slice="detail"]');
  await expect(panel).toContainText('model-a: 162');
  const before = await page.locator('[data-component="usage-by-model-day"] table').innerText();
  const swatch = panel.locator('.usage-tokens-fill').first();
  const color = await swatch.evaluate(el => getComputedStyle(el).backgroundColor);
  await panel.getByRole('button', { name: 'Highlight model-b', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('model-b');
  await expect(panel.getByRole('status')).toContainText('Not recorded');
  expect(await swatch.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(color);
  expect(await page.locator('[data-component="usage-by-model-day"] table').innerText()).toBe(before);
  await panel.getByRole('button', { name: 'Clear model highlight' }).click();
});

test('reduced motion disables chart engine animation, single point omits meaningless zoom', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
  await openRunCharts(page);
  await expect(page.locator('.local-chart-canvas').first().locator('svg')).toBeVisible();
  await expect(page.locator('.local-chart').first()).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('failed');
  await expect(page.getByRole('figure', { name: 'Duration per run' }).getByLabel('First point')).toHaveCount(0);
});

test('empty money data remains explicit and cannot expose an invented graph', async ({ page }, info) => {
  // OMN-21166 AC86 (Lakshman 2026-10-25): Spend per day is deleted from Overview; the same property is checked on the
  // Spend headline card and the charts that remain: with no metering rows read, nothing is drawn as a zero.
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/overview');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.locator('[data-component="overview-spend-by-day"]')).toHaveCount(0);
  const spend = page.locator('article[data-component="overview-spend"] .local-dashboard-metric');
  await expect(spend).toHaveText(/^Not measured/);
  await expect(spend).not.toHaveText(/\$0/);
  await page.screenshot({ path: info.outputPath('no-invented-series.png') });
});

test.describe('touch chart controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('tier selection and model highlight respond to actual taps', async ({ page }, info) => {
    // OMN-21166 Maple grid: the tappable tier bars are Runs' routing breakdown ("More analysis"); the highlight is under "More usage".
    await page.goto('/runs');
    await page.getByText('More analysis', { exact: true }).tap();
    const tier = page.getByRole('button', { name: 'Inspect Cloud', exact: true });
    await tier.tap();
    await expect(tier).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('region',{name:'Tier mix',exact:true}).getByRole('status')).toContainText('25.0% of tier-routed runs');
    await page.getByRole('button',{name:'Clear tier selection'}).tap();
    await page.getByRole('link',{name:'Usage',exact:true}).tap();
    await page.getByText('More usage', { exact: true }).tap();
    const panel=page.locator('[data-component="usage-tokens-by-day"][data-slice="detail"]');
    await panel.getByRole('button',{name:'Highlight model-b',exact:true}).tap();
    await expect(panel.getByRole('status')).toContainText('Not recorded');
    await panel.getByRole('button',{name:'Clear model highlight'}).tap();
    await page.screenshot({path:info.outputPath('touch-model-highlight.png')});
  });
});
