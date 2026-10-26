import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes before edits: chart numbers use unrelated/neutral colors,
// daily/run token charts disagree, and missing measurements look measured.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
// OMN-21166 part 18 AC118: Runs keeps its analysis and its run charts under the page's one closed "More analysis".
async function openRunsDetail(page: Page) {
  await page.locator('summary').filter({ hasText: /^More analysis$/ }).click();
}

test('Overview chart values retain field identities and token legends agree', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs');
  await openRunsDetail(page);
  const tasks = page.getByRole('figure', { name: 'Tasks', exact: true });
  await expect(tasks.locator('[data-field-tone="count"]')).toHaveText('3');
  const tokens = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.goto('/overview');
    // OMN-21166 Maple grid: each legend item now also carries its concept icon (an svg with the same tone), so the
    // items are read from the list entries, tokens in first and tokens out second.
    await page.locator('.ins-token-legend li[data-field-tone]').first().waitFor({ state: 'visible' });
    const dailyColors = await page.locator('.ins-token-legend li[data-field-tone]').evaluateAll(es => es.map(el => getComputedStyle(el).color));
    await page.goto('/runs');
    await openRunsDetail(page);
    for (const [label, tone] of [['Tokens in', 'tokens-in'], ['Tokens out', 'tokens-out']]) {
      const expected = dailyColors[tone === 'tokens-in' ? 0 : 1];
      const legend = tokens.getByRole('button', { name: label, exact: true });
      await expect(legend).toHaveCSS('color', expected);
      await expect(legend.locator('[data-swatch]')).toHaveCSS('background-color', expected);
    }
    // OMN-21166 part 18 AC121: the "Run outcomes" donut is removed; the Runs headline cards hold its figures.
    await expect(page.getByRole('figure', { name: 'Run outcomes', exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`overview-colors-${theme}.png`) });
  }
});

test('Overview expanded cards preserve missing values and fit a phone', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // OMN-21166 AC86 (Lakshman 2026-10-25): the Quality panel and its "View delegation evidence" link are deleted from
  // Overview (Quality is a headline card); the page still fits the phone and Evidence stays in the sidebar navigation.
  await expect(page.locator('[data-component="overview-quality"][data-slice="card"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('[data-component="overview-spend"]')).toContainText('Not measured');
  await page.goto('/runs');
  // OMN-21166 part 13: the routing breakdown is inside Runs' closed "More analysis"; part 18 AC120: its table is shown
  // directly, with no nested "Full routing breakdown" disclosure.
  await page.locator('summary').filter({ hasText: /^More analysis$/ }).click();
  await expect(page.getByText('Full routing breakdown', { exact: true })).toHaveCount(0);
  const tier = page.getByRole('region', { name: 'Tier mix', exact: true });
  await expect(tier.locator('dl > [data-field-tone]')).toHaveCount(3);
  await expect(tier.locator('dl')).toContainText('10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('overview-expanded-phone.png') });
});
