import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: no model/tier volume bars or outcome composition;
// unknown verdicts disappear; latest run is buried below every insight chart.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const now = new Date().toISOString();
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: [
  { ...chartRows[prefix + 'delegation.decisions.v1'][0] as object, written_at: now, created_at: now, cost_tier_name: 'local' },
  { ...chartRows[prefix + 'delegation.decisions.v1'][1] as object, written_at: now, created_at: now, cost_tier_name: 'cloud' },
  { ...chartRows[prefix + 'delegation.decisions.v1'][2] as object, written_at: now, created_at: now, cost_tier_name: null, quality_gate_passed: null },
] };
test('Overview groups activity, routing and quality charts and keeps latest execution near the summary', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  await page.getByText('Detailed activity analysis', { exact: true }).press('Enter');
  const models = page.getByRole('figure', { name: 'Runs by model', exact: true });
  const tiers = page.getByRole('figure', { name: 'Runs by tier', exact: true });
  await expect(models).toBeVisible();
  await expect(tiers).toBeVisible();
  await expect(models).toContainText('model-a');
  await expect(tiers).toContainText('Not recorded');
  const outcomes = page.getByRole('figure', { name: 'Run outcomes', exact: true });
  for (const label of ['Passed: 1 run', 'Failed: 1 run', 'Not recorded: 1 run']) await expect(outcomes.getByRole('button', { name: label, exact: true })).toBeVisible();
  await outcomes.getByRole('button', { name: 'Not recorded: 1 run', exact: true }).press('Enter');
  await expect(outcomes.getByRole('status')).toContainText('Not recorded: 1 run');
  await expect(page.getByRole('region', { name: 'Activity over time', exact: true })).toBeVisible();
  const latest = page.locator('[data-component="overview-last-run"]');
  expect(await latest.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(await models.evaluate(element => element.getBoundingClientRect().top));
  const row = page.locator('.overview-chart-row').first();
  const heights = await row.locator(':scope > figure').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('overview-reorganized-desktop.png'), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('Overview has no invented composition when decision rows are empty', async ({ page }) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [] });
  await page.goto('/overview');
  await expect(page.locator('[data-component="overview-insights"]')).toContainText('No runs yet');
  await expect(page.getByRole('figure', { name: 'Run outcomes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Runs by model', exact: true })).toHaveCount(0);
});
