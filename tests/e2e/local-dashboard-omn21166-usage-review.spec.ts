import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes before implementation: long tables bury records; filters hide
// unpriced rows or turn null into zero; phone cells lose labels; model legend
// controls do not identify the colors in the token bars.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const usage = Array.from({ length: 28 }, (_, index) => ({
  usage_day: index < 26 ? '2026-10-01' : '2026-10-02', model_id: index % 2 ? 'model-beta' : 'model-alpha',
  input_tokens: index, output_tokens: index === 1 ? null : index + 100,
  measured_cost_usd: index === 1 ? null : '0.00000000', unmeasured_call_count: index === 1 ? 1 : 0,
  call_count: 1, call_share: '0.5', cost_tier_name: index % 2 ? 'cloud' : 'local',
}));
// OMN-21166 part 13: the usage-by-model-day records, per-day token detail and model legend sit under the page-level
// "More usage" section.
async function openMoreUsage(page: Page) {
  await page.getByText('More usage', { exact: true }).press('Enter');
  await expect(page.locator('details.local-more').filter({ hasText: 'More usage' }).first()).toHaveAttribute('open', '');
}
test.beforeEach(async ({ page }) => { await serveCharts(page, { ...chartRows, [prefix + 'usage-by-model-day.v1']: usage }); });

test('Usage records can be paged and filtered without rewriting served figures', async ({ page }, info) => {
  await page.goto('/usage');
  await openMoreUsage(page);
  const panel = page.locator('[data-component="usage-by-model-day"]');
  const table = panel.getByRole('table', { name: 'Usage by model and day', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(panel.getByText('Showing 1–25 of 28 records', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Next usage records', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await panel.getByLabel('Filter usage model', { exact: true }).selectOption('model-beta');
  await expect(table.locator('tbody tr')).toHaveCount(14);
  await expect(table).toContainText('Not measured');
  await expect(table).toContainText('1 unmeasured');
  await panel.getByLabel('Filter usage UTC day', { exact: true }).selectOption('2026-10-02');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('model-beta');
  await panel.getByRole('button', { name: 'Clear usage filters', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table).toContainText('$0.00');
  await page.screenshot({ path: info.outputPath('usage-records-desktop.png'), fullPage: true, animations: 'disabled' });
});

test('phone Usage records retain every labelled value and model controls identify their bar colors', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/usage');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await openMoreUsage(page);
  const table = page.getByRole('table', { name: 'Usage by model and day', exact: true });
  const row = table.locator('tbody tr').first();
  await expect(row.locator('td[data-label]')).toHaveCount(9);
  expect(await row.locator('td').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const legend = page.getByRole('button', { name: 'Highlight model-alpha', exact: true });
  const series = await legend.getAttribute('data-series');
  expect(series).not.toBeNull();
  await expect(legend.locator('.usage-model-swatch')).toBeVisible();
  const swatch = await legend.locator('.usage-model-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  const bar = page.locator(`.usage-tokens-fill[data-series="${series}"]`).first();
  expect(await bar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(swatch);
  await legend.press('Enter');
  await expect(legend).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('usage-records-phone.png'), fullPage: true, animations: 'disabled' });
});

test('empty daily exposures remain explicit without fabricated totals', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'usage-by-model-day.v1']: [], [prefix + 'metering-summary.v1']: [] });
  await page.goto('/usage');
  await openMoreUsage(page);
  await expect(page.getByText('No usage rows yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Usage by model and day', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Filter usage model', { exact: true })).toHaveCount(0);
  await expect(page.getByText('$0.00', { exact: true })).toHaveCount(0);
});
