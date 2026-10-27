import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a missing chart reserves a chart-sized blank area; unavailable
// text competes with measured figures; compact styling hides run details or data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('missing spend is a compact notice, while measured charts and run identity survive', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [] });
  await page.goto('/overview');
  // OMN-21166 AC86 (Lakshman 2026-10-25): "Additional runtime metrics", the Spend per day chart ("No day rows yet") and
  // the Last run card are deleted from Overview. The same property is held on what survives: an unserved spend is a
  // compact notice on its headline card, never a chart-sized blank, and the measured quality card and the run charts
  // beside it are untouched.
  const spend = page.locator('[data-component="overview-spend"]');
  await expect(spend).toContainText('Not measured: overview totals unavailable');
  expect(await spend.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(150);
  await expect(page.locator('[data-component="overview-quality"][data-slice="card"] .local-dashboard-metric')).toHaveText('75.0%');
  await expect(page.getByRole('figure', { name: 'Runs per day', exact: true }).getByRole('button', { name: /^Oct 17: 3 runs/ })).toBeVisible();
  // Run identity survives on Runs, which still links each run (the Last run card that linked it is gone from Overview).
  await page.goto('/runs');
  await expect(page.getByRole('link', { name: 'chart-run-a', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-a/);
  await page.screenshot({ path: info.outputPath('missing-compact.png'), fullPage: true });
  await serveCharts(page);
  await page.goto('/usage');
  // The served day rows: a measured value is drawn, a day whose value is not served reads Not measured, never $0.
  await page.getByText('Savings by day as a table', { exact: true }).press('Enter');
  const days = page.getByRole('table', { name: /Savings per day/ });
  await expect(days.getByRole('row').filter({ hasText: '2026-10-01' }).getByRole('cell').nth(1)).toHaveText('$0.01');
  await expect(days.getByRole('row').filter({ hasText: '2026-10-03' }).getByRole('cell').nth(1)).toHaveText('Not measured');
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
