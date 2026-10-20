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

test('Overview is a compact summary with exact run links and no detailed tables', async ({ page }, info) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Quality', exact: true })).toBeVisible();
  await expect(page.locator('.local-overview-summary article')).toHaveCount(4);
  await expect(page.locator('main figure:visible')).toHaveCount(2);
  await expect(page.getByRole('figure', { name: 'Runs per day', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Tokens per day', exact: true })).toBeVisible();
  await expect(page.locator('details.local-run-more')).not.toHaveAttribute('open', '');
  await expect(page.getByText('Execution details', { exact: true })).toBeVisible();
  await expect(page.locator('details.local-overview-secondary > summary')).toHaveText('Additional runtime metrics');
  await expect(page.locator('details.local-overview-secondary')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('group', { name: 'Filter runs by result', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-component="overview-recent-runs"] .local-run-preview > li')).toHaveCount(5);
  await expect(page.locator('[data-component="overview-recent-runs"] .local-run-preview')).not.toContainText('summary-run-5');
  const recent = page.locator('[data-component="overview-recent-runs"]');
  await recent.getByText('Show recent run fields', { exact: true }).press('Enter');
  await recent.getByRole('checkbox', { name: 'Show all run fields', exact: true }).check();
  await expect(recent.getByRole('table').getByRole('columnheader')).toHaveCount(16);
  await expect(recent.getByRole('table').locator('tbody tr').first()).toContainText('162');
  await recent.getByText('Show recent run fields', { exact: true }).press('Enter');
  await page.locator('[data-component="overview-recent-runs"]').getByRole('link', { name: 'summary-run-0', exact: true }).click();
  await expect(page).toHaveURL(/workflow\?correlation_id=summary-run-0$/);
  await expect(page.getByRole('region', { name: 'Run summary', exact: true })).toContainText('model-a');
  await page.screenshot({ path: info.outputPath('summary-run-drilldown.png') });
});

test('Runs owns deep analysis and failure drilldown still filters exact records', async ({ page }, info) => {
  await page.goto('/overview');
  await page.getByRole('link', { name: 'Explore run analysis', exact: true }).click();
  await expect(page).toHaveURL(/\/runs$/);
  await page.getByText('Show run analysis', { exact: true }).click();
  for (const name of ['Runs by model', 'Tasks', 'Run outcomes', 'Pass rate per day', 'Why runs failed', 'How long runs take', 'Model scoreboard', 'When runs happen']) {
    await expect(page.getByRole('figure', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('figure', { name: 'Why runs failed', exact: true }).getByRole('button', { name: 'Show runs failed by SUMMARY_FAILURE', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search runs' })).toHaveValue('SUMMARY_FAILURE');
  await expect(page.locator('[data-component="recent-runs"] tbody tr')).toHaveCount(10);
  await expect(page.locator('[data-component="recent-runs"] tbody')).not.toContainText('summary-run-0');
  await expect(page.locator('[data-component="runs-tier-mix"]')).toContainText('local');
  await page.screenshot({ path: info.outputPath('runs-detail-owner.png') });
});

// D2, confirmed before restoration: all six panels stay on Overview, reachable
// with keyboard and touch, retaining the exact served table and typed states.
test('Overview retains secondary metrics in a keyboard and touch disclosure', async ({ page }, info) => {
  await page.goto('/overview');
  const disclosure = page.locator('details.local-overview-secondary');
  const summary = disclosure.locator('summary');
  await expect(summary).toHaveText('Additional runtime metrics');
  await summary.focus();
  await summary.press('Enter');
  const names = ['Run locally', 'Spend per day', 'Avg saving / call', 'Baseline spend', 'Compression', 'Cache hit rate'];
  for (const name of names) await expect(disclosure.getByRole('heading', { name, exact: true })).toBeVisible();
  const spend = disclosure.locator('[data-component="overview-spend-by-day"]');
  await expect(spend.getByRole('table').locator('tbody tr').first()).toContainText('2026-10-01');
  await expect(spend.getByRole('table').locator('tbody tr').first()).toContainText('$0.01');
  await expect(spend.getByRole('table').locator('tbody tr').first()).toContainText('$0.02');
  await expect(disclosure.locator('[data-component="overview-baseline-spend"]')).toContainText('Not measured');
  await summary.press('Enter');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.click();
  for (const name of names) await expect(disclosure.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('overview-secondary-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'Explore usage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toBeVisible();
});
