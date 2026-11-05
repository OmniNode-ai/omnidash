import { expect, test, type Page } from 'playwright/test';
import { chooseChartTab } from './chart-tabs';
import { filterTrigger, pickFilter } from './filter-dropdowns';
import { chartRows, prefix, serveCharts, recentDay } from './omn21166-chart-fixtures';

// Failure modes before implementation: long tables bury records; filters hide
// unpriced rows or turn null into zero; phone cells lose labels; model legend
// controls do not identify the colors in the token bars.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const usage = Array.from({ length: 28 }, (_, index) => ({
  usage_day: index < 26 ? recentDay(2) : recentDay(1), model_id: index % 2 ? 'model-beta' : 'model-alpha',
  input_tokens: index, output_tokens: index === 1 ? null : index + 100,
  measured_cost_usd: index === 1 ? null : '0.00000000', unmeasured_call_count: index === 1 ? 1 : 0,
  call_count: 1, call_share: '0.5', cost_tier_name: index % 2 ? 'cloud' : 'local',
}));
// OMN-22168 (Lakshman 2026-11-05, "don't use this instead open all, no hide the contents"): the usage-by-model-day
// records and the per-model token bars are in view; no "More usage" fold hides them.
async function openMoreUsage(page: Page) {
  await expect(page.locator('details.local-more')).toHaveCount(0);
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
  // OMN-22168 (Lakshman 2026-11-05, "modern like runs"): the filters are the Runs toolbar's kit Dropdowns.
  await pickFilter(page, 'Usage model', 'model-beta');
  await expect(table.locator('tbody tr')).toHaveCount(14);
  await expect(table).toContainText('Not measured');
  await expect(table).toContainText('1 unmeasured');
  await pickFilter(page, 'UTC day', recentDay(1));
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('model-beta');
  await panel.getByRole('button', { name: 'Clear usage filters', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(25);
  // A measured zero is shown as a zero: the short "$0", with the served "$0.00" as its title (Lakshman 2026-11-05).
  await expect(table.getByTitle('$0.00').first()).toHaveText('$0');
  await page.screenshot({ path: info.outputPath('usage-records-desktop.png'), fullPage: true, animations: 'disabled' });
});

test('phone Usage records retain every labelled value and the model legend identifies its bar colors', async ({ page }, info) => {
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
  // OMN-21166 part 17 AC116: the "Tokens per day by model, in detail" panel and its "Highlight model" buttons are removed.
  // The model's colour is identified by the Tokens per day legend swatch, the stacked bar segment, and the model's name
  // under its pair in "Tokens by model" (a bar's colour is its CSS color, not background-color: every bar is hatched).
  await expect(page.getByRole('button', { name: 'Highlight model-alpha', exact: true })).toHaveCount(0);
  const swatch = await page.locator('.utc-legend li').filter({ hasText: 'model-alpha' }).locator('i').evaluate(element => getComputedStyle(element).backgroundColor);
  const segment = page.locator('.utc-stack i[data-token-model="model-alpha"]').first();
  expect(await segment.evaluate(element => getComputedStyle(element).color)).toBe(swatch);
  // OMN-22168: Tokens per day and Tokens by model are tabs of Usage's "Tokens" panel; the legend above is read on the
  // first, the pair's name on the second.
  await chooseChartTab(page, 'Tokens by model');
  const name = page.getByRole('figure', { name: 'Tokens in vs out by model', exact: true }).locator('li.gdb-day[aria-label^="model-alpha:"] .gdb-day-label');
  // OMN-21970 option a (Lakshman 2026-11-03): the name reads in ink; the swatch beside it carries the model's colour.
  expect(await name.locator('.gdb-swatch').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(swatch);
  await page.screenshot({ path: info.outputPath('usage-records-phone.png'), fullPage: true, animations: 'disabled' });
});

test('empty daily exposures remain explicit without fabricated totals', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'usage-by-model-day.v1']: [], [prefix + 'metering-summary.v1']: [] });
  await page.goto('/usage');
  await openMoreUsage(page);
  await expect(page.getByText('No usage rows yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Usage by model and day', exact: true })).toHaveCount(0);
  await expect(filterTrigger(page, 'Usage model')).toHaveCount(0);
  await expect(page.getByText('$0.00', { exact: true })).toHaveCount(0);
});
