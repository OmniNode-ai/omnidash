import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a missing chart reserves a chart-sized blank area; unavailable
// text competes with measured figures; compact styling hides run details or data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('missing spend is a compact notice, while measured charts and run identity survive', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/overview');
  await page.getByText('Additional runtime metrics', { exact: true }).press('Enter');
  const spend = page.locator('[data-component="overview-spend-by-day"]');
  await expect(spend).toContainText('No day rows yet');
  expect(await spend.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(150);
  const latest = page.locator('[data-component="overview-last-run"]');
  expect(await latest.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(220);
  await expect(latest.getByRole('link', { name: 'chart-run-a', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-a/);
  await latest.getByText('Execution details', { exact: true }).click();
  await expect(latest.getByText('Quality score', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('missing-compact.png'), fullPage: true });
  await serveCharts(page);
  await page.reload();
  await page.getByText('Additional runtime metrics', { exact: true }).press('Enter');
  await expect(page.locator('[data-component="overview-spend-by-day"] .local-chart-canvas')).toBeVisible();
  await expect(page.locator('[data-component="overview-spend-by-day"] tr').filter({ hasText: '2026-10-02' }).locator('td').nth(1)).toHaveText('$0.00');
  await expect(page.locator('[data-component="overview-spend-by-day"] tr').filter({ hasText: '2026-10-03' }).locator('td').nth(1)).toHaveText('Not measured');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('populated-narrow.png'), fullPage: true });
});

test('developer unavailable KPIs read as status, with reasons retained', async ({ page }, info) => {
  await serveCharts(page);
  await page.route(/\/projection\/.*node-generation-completed\.v1/, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture producer unavailable' }) }));
  await page.goto('/event-bus');
  const unknown = page.locator('.kpi').filter({ has: page.locator('.k-v', { hasText: 'Not measured' }) }).first();
  await expect(unknown).toBeVisible();
  expect(await unknown.locator('.k-v').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(18);
  await expect(unknown.locator('.k-sub')).toBeVisible();
  await page.screenshot({ path: info.outputPath('developer-status.png'), fullPage: true });
});
