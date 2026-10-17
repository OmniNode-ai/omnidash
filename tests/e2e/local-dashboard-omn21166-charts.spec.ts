import { expect, test } from 'playwright/test';
import { chartRows, prefix, runIds, serveCharts } from './omn21166-chart-fixtures';

// Failure modes declared before implementation: wrong bar after hiding/zoom;
// stale selection after filters; missing value becomes zero; unknown day filled;
// keyboard/touch cannot inspect; selection changes table; chart ignores reduced motion.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

test('chart zoom/reset changes visible range without changing table or selected identity', async ({ page }, info) => {
  await page.goto('/runs');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible(); // positive control, actual renderer
  const tableBefore = await page.locator('main table').innerText();
  await chart.getByLabel('Inspect run').selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b/);
  await chart.getByLabel('First point').focus();
  await chart.getByLabel('First point').press('ArrowRight');
  await expect(chart.getByText('Showing 2–3 of 3')).toBeVisible();
  await chart.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(chart.getByText('Showing 1–3 of 3')).toBeVisible();
  expect(await page.locator('main table').innerText()).toBe(tableBefore);
  await chart.getByRole('link', { name: 'Open run', exact: true }).click();
  await expect(page).toHaveURL(/workflow\?correlation_id=chart-run-b/);
  await page.screenshot({ path: info.outputPath('selected-run-workflow.png') });
});

test('chart selected run is cleared after filtering rather than opening a different index', async ({ page }) => {
  await page.goto('/runs');
  const chart = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  await chart.getByLabel('Inspect run').selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /chart-run-b/);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('passed');
  await expect(chart.getByLabel('Inspect run')).toHaveValue('');
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveCount(0);
  await expect(page.locator('main table')).not.toContainText('chart-run-b');
});

test('an actual bar opens its exact run after a series is hidden and the range is zoomed', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
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

test('money explorer preserves precise served zero and missing values, table and baseline', async ({ page }, info) => {
  await page.goto('/overview');
  const chart = page.getByRole('figure', { name: 'Spend per day vs baseline-a', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  await chart.getByLabel('Inspect day').selectOption('1');
  await expect(chart.getByRole('status')).toContainText('$0.000000');
  await chart.getByLabel('Inspect day').selectOption('2');
  await expect(chart.getByRole('status')).toContainText('Not measured');
  await expect(chart.getByRole('status')).toContainText('2026-10-03');
  await expect(page.locator('[data-component="overview-spend-by-day"] table')).toContainText('2026-10-01');
  await page.screenshot({ path: info.outputPath('money-unknown.png') });
});

test('tier selection pins on keyboard/touch, resets, and preserves served denominator', async ({ page }) => {
  await page.goto('/overview');
  const area = page.getByRole('region', { name: 'Tier mix', exact: true });
  const tier = area.getByRole('button', { name: /Inspect local/ });
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
  const panel = page.locator('[data-component="usage-tokens-by-day"]');
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
  await expect(page.locator('.local-chart-canvas').first().locator('svg')).toBeVisible();
  await expect(page.locator('.local-chart').first()).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('failed');
  await expect(page.getByRole('figure', { name: 'Duration per run' }).getByLabel('First point')).toHaveCount(0);
});

test('empty money data remains explicit and cannot expose an invented graph', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/overview');
  const panel = page.locator('[data-component="overview-spend-by-day"]');
  await expect(panel).toContainText('No day rows');
  await expect(panel.locator('.local-chart-canvas')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('no-invented-series.png') });
});

test.describe('touch chart controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('tier selection and model highlight respond to actual taps', async ({ page }, info) => {
    await page.goto('/overview');
    const tier = page.getByRole('button', { name: 'Inspect cloud', exact: true });
    await tier.tap();
    await expect(tier).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('region',{name:'Tier mix',exact:true}).getByRole('status')).toContainText('25.0% of tier-routed runs');
    await page.getByRole('button',{name:'Clear tier selection'}).tap();
    await page.getByRole('link',{name:'Usage',exact:true}).tap();
    const panel=page.locator('[data-component="usage-tokens-by-day"]');
    await panel.getByRole('button',{name:'Highlight model-b',exact:true}).tap();
    await expect(panel.getByRole('status')).toContainText('Not recorded');
    await panel.getByRole('button',{name:'Clear model highlight'}).tap();
    await page.screenshot({path:info.outputPath('touch-model-highlight.png')});
  });
});
