import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

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
  await expect(page.locator('main figure:visible')).toHaveCount(3);
  await expect(page.getByRole('figure', { name: 'Runs per day', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Why runs failed', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Tokens per day', exact: true })).toBeVisible();
  await expect(page.locator('[data-component="overview-model-usage"]')).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Runs by tier', exact: true })).toBeVisible();
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
  await page.goto('/overview');
  await page.getByRole('link', { name: 'Explore run analysis', exact: true }).click();
  await expect(page).toHaveURL(/\/runs$/);
  // OMN-21166 part 13: the page-level "More analysis" replaces the "Show run analysis" fold on Runs.
  await page.getByText('More analysis', { exact: true }).click();
  for (const name of ['Runs by model', 'Tasks', 'Run outcomes', 'Pass rate per day', 'Why runs failed', 'How long runs take', 'Model scoreboard', 'When runs happen']) {
    await expect(page.getByRole('figure', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('figure', { name: 'Why runs failed', exact: true }).getByRole('button', { name: 'Show runs failed by Failure reason unavailable', exact: true }).click(); // an unmapped raw code reads as unavailable (daa30c81); the filter still carries SUMMARY_FAILURE
  // OMN-19919 AC7: a cause opens Runs on status=failed and that cause (the cause filter), not a free-text search.
  await expect(page).toHaveURL(/\/runs\?status=failed&cause=SUMMARY_FAILURE$/);
  await expect(page.getByLabel('Cause', { exact: true })).toHaveValue('SUMMARY_FAILURE');
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
  await page.getByRole('link', { name: 'Explore usage', exact: true }).click();
  // OMN-21166 Maple grid: the by-day table is under the closed "More usage" disclosure.
  await page.getByText('More usage', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toBeVisible();
});
