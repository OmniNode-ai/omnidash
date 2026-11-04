import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts, keepRealClock } from './omn21166-chart-fixtures';
import { expectFilter } from './filter-dropdowns';
import { chooseChartTab } from './chart-tabs';
// This spec dates its rows from the real clock, so the browser keeps it (see FIXTURE_NOW).
test.beforeEach(({ page }) => keepRealClock(page));

// Before implementation: Overview duplicates all deep analysis, latest-run
// internals and the full run table; moving them risks losing data/drilldowns.
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: Array.from({ length: 30 }, (_, i) => ({
  ...chartRows[prefix + 'delegation.decisions.v1'][i % 3] as object,
  correlation_id: `summary-run-${i}`, created_at: new Date(Date.now() - i * 60000).toISOString(),
  written_at: new Date(Date.now() - i * 60000).toISOString(),
  quality_gate_detail: i % 3 === 1 ? 'SUMMARY_FAILURE: recorded detail' : 'completed',
})) };
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page, rows); });

test('Overview is a compact summary with exact day links and no detailed tables', async ({ page }, info) => {
  await page.goto('/overview');
  // OMN-21166 live review 2026-10-25: Quality is the fifth headline card, titled "Delegation Quality".
  await expect(page.getByRole('heading', { name: 'Delegation Quality', exact: true })).toBeVisible();
  await expect(page.locator('.local-overview-summary article')).toHaveCount(5);
  // Live review 2026-10-25: Why runs failed, More activity, Recent runs, Last run and Additional runtime metrics are
  // deleted from Overview (AC86, Lakshman 2026-10-25); the figures in view are Runs per day, Tokens per day and Runs by
  // tier (Model usage is a ranked-bars cell that shows its empty state on these fixtures, which serve no by_model).
  // OMN-22168 (Lakshman 2026-11-04): the Daily trend joins them, and the four charts are one row of tabs, so the page
  // opens on two figures (the trend and the chosen tab's chart) and each tab draws its own.
  await expect(page.locator('main figure:visible')).toHaveCount(2);
  await expect(page.getByRole('figure', { name: 'Daily trend', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Runs per day', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Why runs failed', exact: true })).toHaveCount(0);
  await chooseChartTab(page, 'Tokens per day');
  await expect(page.getByRole('figure', { name: 'Tokens per day', exact: true })).toBeVisible();
  await chooseChartTab(page, 'Model usage');
  await expect(page.locator('[data-component="overview-model-usage"]')).toBeVisible();
  await chooseChartTab(page, 'Tier mix');
  await expect(page.getByRole('figure', { name: 'Runs by tier', exact: true })).toBeVisible();
  await chooseChartTab(page, 'Runs per day');
  // OMN-21166 AC86 (Lakshman 2026-10-25): Additional runtime metrics, Recent runs, its field table and Last run are deleted.
  await expect(page.locator('details.local-overview-secondary')).toHaveCount(0);
  await expect(page.locator('[data-component="overview-recent-runs"]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Filter runs by result', exact: true })).toHaveCount(0);
  await expect(page.locator('main table')).toHaveCount(0);
  // The drilldown that remains on Overview: a Runs per day bar opens Runs on that UTC day.
  const day = page.getByRole('figure', { name: 'Runs per day', exact: true }).locator('button.gdb-day').last();
  await day.click();
  await expect(page).toHaveURL(/\/runs\?day=\d{4}-\d{2}-\d{2}$/);
  await page.screenshot({ path: info.outputPath('summary-run-drilldown.png') });
});

test('Runs owns deep analysis and failure drilldown still filters exact records', async ({ page }, info) => {
  // Part 15 AC96: Overview has no "Explore run analysis" link; Runs is reached from the sidebar.
  await page.goto('/overview');
  await expect(page.getByRole('link', { name: 'Explore run analysis', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Runs', exact: true }).click();
  await expect(page).toHaveURL(/\/runs$/);
  // OMN-21166 part 13: the page-level "More analysis" replaces the "Show run analysis" fold on Runs.
  // OMN-21166 part 18 AC119/AC121: "Runs by model", "Runs by tier" and the "Run outcomes" donut are removed from Runs
  // (Overview's Model usage and Tier mix, and the Runs headline cards, show the same figures).
  for (const name of ['Runs by model', 'Runs by tier', 'Run outcomes']) {
    await expect(page.getByRole('figure', { name, exact: true })).toHaveCount(0);
  }
  // OMN-22168: Run analysis is a row of tabs; each chart is drawn when its tab (named as the chart) is chosen.
  for (const name of ['Tasks', 'Pass rate per day', 'Why runs failed', 'How long runs take', 'Model scoreboard', 'When runs happen']) {
    await chooseChartTab(page, name);
    await expect(page.getByRole('figure', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('figure', { name: 'Why runs failed', exact: true }).getByRole('button', { name: 'Show runs failed by Failure reason unavailable', exact: true }).click(); // an unmapped raw code reads as unavailable (daa30c81); the filter still carries SUMMARY_FAILURE
  // OMN-19919 AC7: a cause opens Runs on status=failed and that cause (the cause filter), not a free-text search.
  await expect(page).toHaveURL(/\/runs\?status=failed&cause=SUMMARY_FAILURE$/);
  await expectFilter(page, 'Cause', 'SUMMARY_FAILURE');
  await expect(page.getByRole('searchbox', { name: 'Search runs' })).toHaveValue('');
  await expect(page.locator('[data-component="recent-runs"] tbody tr')).toHaveCount(10);
  await expect(page.locator('[data-component="recent-runs"] tbody')).not.toContainText('summary-run-0');
  await expect(page.locator('[data-component="runs-tier-mix"]')).toContainText('Local'); // tier names are title-cased (tierLabel)
  await page.screenshot({ path: info.outputPath('runs-detail-owner.png') });
});

// OMN-21166 AC86 (Lakshman 2026-10-25): "Additional runtime metrics" (Run locally, Spend per day, Avg saving / call,
// Baseline spend, Compression, Cache hit rate) is deleted from Overview, so its keyboard and touch disclosure is retired.
// What remains of the property: at phone width Overview does not overflow, and the usage drilldown stays reachable and
// keyboard-operable (spend per day and baseline cost are on Usage).
test('Overview fits a phone and Usage detail stays reachable by keyboard', async ({ page }, info) => {
  await page.goto('/overview');
  await expect(page.locator('details.local-overview-secondary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('overview-phone.png'), fullPage: true });
  // Part 15 AC96: no "Explore usage" link on Overview; Usage is reached from the navigation.
  await expect(page.getByRole('link', { name: 'Explore usage', exact: true })).toHaveCount(0);
  await page.goto('/usage');
  // OMN-21166 Maple grid: the by-day table is under the closed "More usage" disclosure.
  await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toBeVisible();
});
