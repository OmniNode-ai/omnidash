import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, runIds, serveCharts } from './omn21166-chart-fixtures';

// Failure modes declared before implementation: wrong bar after hiding/zoom;
// stale selection after filters; missing value becomes zero; unknown day filled;
// keyboard/touch cannot inspect; selection changes table; chart ignores reduced motion.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', actionTimeout: 5000 });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

// OMN-21166 part 18 AC118: Runs' four run charts and "This week" sit first inside the page's one closed "More analysis".
async function openRunCharts(page: Page) {
  await page.getByText('More analysis', { exact: true }).press('Enter');
  await expect(page.locator('details.local-more').filter({ has: page.locator('article.local-run-charts-panel') })).toHaveAttribute('open', '');
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

// OMN-21166 live review 2026-10-26 ("remove this"): the charts carry no range slider and no Reset view; a chart shows
// every served point. What the zoom test also held (the selected run and the table survive) is kept.
test('a chart has no range slider; the selected run and the table are unchanged', async ({ page }, info) => {
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible(); // positive control, actual renderer
  const tableBefore = await page.locator('[data-component="recent-runs"] table').innerText();
  await chart.getByLabel('Inspect run').selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b/);
  await expect(page.getByRole('group', { name: 'Chart range' })).toHaveCount(0);
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset view', exact: true })).toHaveCount(0);
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

test('an actual bar opens its exact run after a series is hidden', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
  await openRunCharts(page);
  const chart = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  await chart.getByRole('button', { name: 'Tokens in', exact: true }).click();
  const color = await chart.getByRole('button', { name: 'Tokens out', exact: true }).locator('[data-swatch]').evaluate(el => getComputedStyle(el).backgroundColor);
  // Locate the visible painted bars through the SVG's geometry and legend color (a hatched bar's outline stroke), not
  // chart-library internals. Runs A
  // and B have measured output (run C's is not served, so it has no bar); run B's bar is the one whose tooltip names it.
  const bars = () => chart.locator('.local-chart-canvas svg path').evaluateAll((els, color) => els.filter(el => {
    const box=el.getBoundingClientRect(), canvas=el.closest('svg')!.getBoundingClientRect();
    // One path per bar: the outline; the hatch path (filled with a url(#…) pattern) is skipped.
    return getComputedStyle(el).stroke === color && !getComputedStyle(el).fill.startsWith('url(') && box.width>3 && box.height>3 && box.left>=canvas.left && box.right<=canvas.right;
  }).map(el => { const b=el.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; }), color);
  await expect.poll(async () => (await bars()).length).toBe(2);
  let box: { x: number; y: number } | undefined;
  for (const candidate of await bars()) {
    await page.mouse.move(candidate.x, candidate.y);
    if ((await chart.locator('.local-chart-canvas').innerText()).includes('chart-run-b')) { box = candidate; break; }
  }
  expect(box, 'one Tokens out bar names chart-run-b in its tooltip').toBeDefined();
  await page.mouse.move(box!.x, box!.y);
  await expect(chart.locator('.local-chart-canvas')).toContainText('chart-run-b');
  await page.mouse.click(box!.x,box!.y);
  await expect(page).toHaveURL(/workflow\?correlation_id=chart-run-b/);
  await page.screenshot({path:info.outputPath('actual-bar-exact-run.png')});
});

// OMN-21166 AC86 (Lakshman 2026-10-25): Spend per day (the money chart, its day inspector and its table) is deleted from
// Overview, so "money explorer preserves precise served zero and missing values, table and baseline" is retired with it.
// The zero-versus-missing property for days is held on the Overview window by AC85 (see the overview-window specs).

test('tier shares read directly from the routing table and preserve served denominator', async ({ page }) => {
  // OMN-21166 Maple grid: Overview's tier mix is non-interactive ranked bars that print every served share. Part 18 AC120:
  // Runs' routing breakdown (under "More analysis") has no pinnable meter bars and no nested disclosure; its table shows
  // the same served shares directly. Both keep the served denominator. Tier names read "Local"/"Cloud" (OMN-21166
  // readable tier names, tierLabel).
  await page.goto('/overview');
  const overview = page.getByRole('region', { name: 'Tier mix', exact: true });
  await expect(overview.getByRole('link', { name: 'Local: 6 · 75.0%, measured. Opens Runs filtered to Local', exact: true })).toBeVisible();
  await expect(overview.getByRole('link', { name: 'Cloud: 2 · 25.0%, measured. Opens Runs filtered to Cloud', exact: true })).toBeVisible();
  await expect(overview).toContainText('2 not tier-routed');
  await page.goto('/runs');
  await page.getByText('More analysis', { exact: true }).press('Enter');
  const area = page.getByRole('region', { name: 'Tier mix', exact: true });
  await expect(area.getByRole('button', { name: 'Inspect Local', exact: true })).toHaveCount(0);
  await expect(area.getByRole('button', { name: 'Clear tier selection' })).toHaveCount(0);
  await expect(area.locator('.local-tier-bar-select')).toHaveCount(0);
  const local = area.getByRole('row').filter({ hasText: 'Local' });
  await expect(local.locator('td[data-column="runs"]')).toHaveText('6');
  await expect(local.locator('td[data-column="share"]')).toHaveText('75.0%');
  const cloud = area.getByRole('row').filter({ hasText: 'Cloud' });
  await expect(cloud.locator('td[data-column="runs"]')).toHaveText('2');
  await expect(cloud.locator('td[data-column="share"]')).toHaveText('25.0%');
  await expect(area).toContainText('Not tier-routed');
});

test('usage model bars do not change figures, table or other model colors', async ({ page }) => {
  await page.goto('/usage');
  // OMN-21166 Maple grid: the page's Tokens per day is a stacked chart that prints each served count in the day's label;
  // part 17 AC114: "Tokens by model" (under "More usage") is hatched grouped bars, two per model, values on hover or focus.
  await expect(page.locator('[data-component="usage-tokens-by-day"]:not([data-slice]) li[data-token-day="2026-10-01"]')).toHaveAttribute('aria-label', /model-a: 162/);
  await page.getByText('More usage', { exact: true }).press('Enter');
  const figure = page.getByRole('figure', { name: 'Tokens in vs out by model', exact: true });
  const modelA = figure.locator('li.gdb-day[aria-label^="model-a:"]');
  const modelB = figure.locator('li.gdb-day[aria-label^="model-b:"]');
  await expect(modelA).toHaveAttribute('aria-label', 'model-a: 162 tokens in, 52 tokens out');
  // A count that is not recorded reads not recorded and draws no bar, never a bar of 0.
  await expect(modelB).toHaveAttribute('aria-label', 'model-b: 90 tokens in, Not recorded tokens out');
  await expect(modelB.locator('.gdb-col[data-series="out"] .gdb-bar')).toHaveCount(0);
  // OMN-21166 part 17 AC116: the "Tokens per day by model, in detail" panel and its model highlight buttons are removed.
  await expect(page.locator('[data-component="usage-tokens-by-day"][data-slice="detail"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Highlight model-b', exact: true })).toHaveCount(0);
  const before = await page.locator('[data-component="usage-by-model-day"] table').innerText();
  const swatch = modelA.locator('.gdb-col[data-series="in"] .gdb-bar');
  const color = await swatch.evaluate(el => getComputedStyle(el).color);
  await modelB.focus();
  await expect(modelB.locator('.gdb-col[data-series="in"] .gdb-val')).toBeVisible();
  expect(await swatch.evaluate(el => getComputedStyle(el).color)).toBe(color);
  expect(await page.locator('[data-component="usage-by-model-day"] table').innerText()).toBe(before);
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
  test('tier shares and model bars are reachable by touch', async ({ page }, info) => {
    // OMN-21166 part 18 AC120 / part 17 AC114: Runs' routing breakdown table shows the tier shares directly (no pinnable
    // bars); Usage's "Tokens by model" groups take focus and name every value.
    await page.goto('/runs');
    await page.getByText('More analysis', { exact: true }).tap();
    const area = page.getByRole('region', { name: 'Tier mix', exact: true });
    await expect(area.getByRole('button', { name: 'Inspect Cloud', exact: true })).toHaveCount(0);
    await expect(area.getByRole('row').filter({ hasText: 'Cloud' }).locator('td[data-column="share"]')).toHaveText('25.0%');
    await page.getByRole('link',{name:'Usage',exact:true}).tap();
    await page.getByText('More usage', { exact: true }).tap();
    const group = page.getByRole('figure', { name: 'Tokens in vs out by model', exact: true }).locator('li.gdb-day[aria-label^="model-b:"]');
    await group.tap();
    await expect(group).toHaveAttribute('aria-label', /Not recorded tokens out/);
    await expect(group.locator('.gdb-col[data-series="out"] .gdb-bar')).toHaveCount(0);
    await page.screenshot({path:info.outputPath('touch-model-highlight.png')});
  });
});
