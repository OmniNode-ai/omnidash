import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: an empty spend panel shares a tall row with routing,
// leaving blank space under the notice. Missing daily metering also falsely
// says no runs today even when the same response serves today's decisions.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

// OMN-21166 AC86 (Lakshman 2026-10-25): Spend per day is deleted from Overview. Its property (an empty daily money
// chart is compact, says why in an accessible status, and leaves no empty chart column) still applies to the surviving
// daily money chart, Usage's "Savings per day", so the test runs there.
test('empty daily savings is compact with its cause accessible and no empty chart column', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/usage');
  const savings = page.locator('[data-component="usage-savings-series"]:not([data-slice])');
  await expect(savings.getByRole('status')).toHaveText('No daily savings data available yet.');
  await expect(savings.locator('.local-chart-canvas')).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (width < 768 && await collapse.isVisible()) await collapse.click();
    expect(await savings.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(width === 1440 ? 130 : 190);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await savings.screenshot({ path: info.outputPath(`empty-savings-${width}.png`) });
  }
  await page.screenshot({ path: info.outputPath('empty-savings-cause.png'), fullPage: true });
});

test('missing daily metering never claims no runs; measured zero still renders exactly', async ({ page }) => {
  const day = new Date().toISOString().slice(0, 10);
  const decisions = chartRows[prefix + 'delegation.decisions.v1'].map(row => ({
    ...row as Record<string, unknown>, written_at: `${day}T10:00:00Z`, created_at: `${day}T10:00:00Z`,
  }));
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: decisions, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/overview');
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  const summary = page.locator('.local-overview-summary');
  for (const id of ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens']) {
    await expect(summary.locator(`[data-component="${id}"]`)).toContainText('Not measured: daily totals unavailable (UTC)');
  }
  await expect(page.getByRole('button', { name: /3 runs, 2 passed, 1 failed/ })).toBeVisible();
  await expect(summary).not.toContainText('no runs today');
  // OMN-21166 live review 2026-10-25: the Delegation Quality card is an all-time figure that this window does not change,
  // so only the four metering-backed cards are checked for a measured value.
  await expect(summary.locator(['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens']
    .map(id => `[data-component="${id}"] [data-measured="true"]`).join(', '))).toHaveCount(0);
  await serveCharts(page, { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: `${day}T11:00:00Z`, total_cost_usd: 0, total_savings_usd: 0, run_count: 1, measured_run_count: 1, tokens_total: 0 }], [prefix + 'metering-summary.v1']: [{
    window_kind: 'day', window_start: day, as_of: `${day}T11:00:00Z`,
    baseline_model: 'baseline-a', baseline_state: 'resolved', pricing_manifest_version: '1',
    spend_usd: '0.000000', savings_usd: '0.000000', runs_total: 1, runs_measured: 1,
    runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 0, tokens_out: 0,
  }] });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(summary.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('Not measured: daily totals unavailable (UTC)');
  await page.getByRole('radio', { name: 'All time', exact: true }).click();
  await expect(summary.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('$0.00');
  await expect(summary.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$0.00');
  await expect(summary.locator('[data-component="overview-measured"] .local-dashboard-metric')).toHaveText('1');
  await expect(summary.locator('[data-component="overview-tokens"] .local-dashboard-metric')).toHaveText('0');
});
