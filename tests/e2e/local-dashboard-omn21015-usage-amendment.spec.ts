import { expect, test } from 'playwright/test';
import { chartRows, narrowTo, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseChartTab } from './chart-tabs';
// Failure modes: unbounded table, unequal adjacent panes, token panel on wrong row,
// keyboard pagination broken, mobile overflow and display precision changing raw chart data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const days = Array.from({ length: 59 }, (_, i) => ({
  window_kind: 'day', window_start: new Date(Date.UTC(2026, 7, 25 + i)).toISOString().slice(0, 10),
  as_of: '2026-10-22T10:00:00Z', baseline_model: 'baseline-a', baseline_state: 'resolved',
  savings_usd: '3.5923', runs_total: i + 1,
}));
for (const theme of ['light', 'dark']) {
  test(`Usage ${theme}: adjacent bounded panes, full-width tokens and keyboard paging`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: days });
    await page.goto('/usage');
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\btheme-${theme}\\b`));
    // OMN-22168 (Lakshman 2026-11-05, "all bar graph should be switched via tabs"): Savings per day and Savings by model
    // are tabs of one full-width "Savings and spend" panel, drawn one at a time in the same place; the day table is
    // inside the chart's panel, below the chart. Tokens is the next full-width panel below it.
    const money = page.locator('.local-chart-tabs-panel').filter({ has: page.getByRole('tablist', { name: 'Savings and spend charts' }) });
    const tokensPanel = page.locator('.local-chart-tabs-panel').filter({ has: page.getByRole('tablist', { name: 'Token charts' }) });
    await chooseChartTab(page, 'Savings per day');
    const savings = page.locator('[data-component="usage-savings-series"]:not([data-slice])');
    const figure = savings.getByRole('figure', { name: 'Savings per day vs baseline-a', exact: true });
    const table = savings.getByRole('table', { name: 'Savings per day vs baseline-a', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(8);
    await expect(table).toContainText('$3.59');
    await savings.getByLabel('Inspect day', { exact: true }).selectOption('0');
    await expect(savings.locator('.local-chart-detail')).toContainText('Savings: $3.59');
    const left = await savings.boundingBox();
    expect(left).not.toBeNull();
    const chartBox = await figure.boundingBox(), ledger = await table.locator('..').boundingBox();
    expect(chartBox).not.toBeNull(); expect(ledger).not.toBeNull();
    expect(ledger!.y).toBeGreaterThanOrEqual(chartBox!.y + chartBox!.height);
    expect(ledger!.x).toBeGreaterThanOrEqual(left!.x);
    expect(ledger!.x + ledger!.width).toBeLessThanOrEqual(left!.x + left!.width + 1);
    const moneyBox = await money.boundingBox(), tokensBox = await tokensPanel.boundingBox();
    expect(moneyBox).not.toBeNull(); expect(tokensBox).not.toBeNull();
    expect(tokensBox!.y).toBeGreaterThanOrEqual(moneyBox!.y + moneyBox!.height);
    expect(Math.abs(tokensBox!.width - moneyBox!.width)).toBeLessThan(2);
    expect(Math.abs(tokensBox!.x - moneyBox!.x)).toBeLessThan(2);
    // Savings by model is drawn where Savings per day was: same left edge and width, one panel at a time.
    await chooseChartTab(page, 'Savings by model');
    const byModel = page.locator('[data-component="usage-savings-series"][data-slice="by-model"]');
    const right = await byModel.boundingBox();
    expect(right).not.toBeNull();
    await expect(savings).toHaveCount(0);
    expect(Math.abs(right!.x - left!.x)).toBeLessThan(2);
    expect(Math.abs(right!.width - left!.width)).toBeLessThan(2);
    expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);
    await chooseChartTab(page, 'Savings per day');
    const next = savings.getByRole('button', { name: 'Next savings days for baseline-a' });
    await next.focus(); await page.keyboard.press('Enter');
    await expect(table.locator('tbody tr').first()).toContainText(days[8]!.window_start);
    await page.screenshot({ path: info.outputPath(`usage-${theme}-desktop.png`), fullPage: true });
    for (const width of [390, 320]) {
      await narrowTo(page, width, 844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const a = await figure.boundingBox(), b = await table.boundingBox();
      expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
      await page.screenshot({ path: info.outputPath(`usage-${theme}-${width}.png`), fullPage: true });
    }
  });
}

test('Overview money cards truncate, preserve tiny nonzero and retain missing states', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-22T10:00:00Z', total_cost_usd: '3.5923', total_savings_usd: '1074.2157', run_count: 3 }], [prefix + 'metering-summary.v1']: [{
    ...days[0], window_kind: 'all', window_start: '', spend_usd: '3.5923',
    savings_usd: '1074.2157', savings_per_measured_run_usd: '0.009',
    runs_measured: 3, runs_total: 3, tokens_in: 123, tokens_out: 456,
  }] });
  await page.goto('/overview');
  await expect(page.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('$3.5923');
  await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$1,074.2157');
  // OMN-21166 AC86 (Lakshman 2026-10-25): the "Avg saving / call" card (overview-avg-saving-per-call) is deleted from Overview.
  await expect(page.locator('[data-component="overview-avg-saving-per-call"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-money.png'), fullPage: true });
});

test('each baseline keeps its own savings chart beside its daily ledger', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [
    ...days.slice(0, 2), ...days.slice(0, 2).map(row => ({ ...row, baseline_model: 'baseline-b' })),
  ] });
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-savings-series"]:not([data-slice])');
  for (const baseline of ['baseline-a', 'baseline-b']) {
    const figure = panel.getByRole('figure', { name: `Savings per day vs ${baseline}`, exact: true });
    // OMN-21166 part 13: each baseline's own day table is under its own "Savings by day as a table", below its own chart.
    const block = panel.locator('.local-usage-savings').filter({ has: page.getByRole('figure', { name: `Savings per day vs ${baseline}`, exact: true }) });
    const table = block.getByRole('table', { name: `Savings per day vs ${baseline}`, exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(panel.getByRole('table', { name: `Savings per day vs ${baseline}`, exact: true })).toHaveCount(1);
    const a = await figure.boundingBox(), b = await table.boundingBox();
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(40);
  }
});
