import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes before edits: chart numbers use unrelated/neutral colors,
// daily/run token charts disagree, and missing measurements look measured.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test('Overview chart values retain field identities and token legends agree', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs');
  await page.getByText('Show run analysis', { exact: true }).click();
  const tasks = page.getByRole('figure', { name: 'Tasks', exact: true });
  await expect(tasks.locator('[data-field-tone="count"]')).toHaveText('3');
  const tokens = page.getByRole('figure', { name: 'Tokens per run', exact: true });
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.goto('/overview');
    await page.locator('.ins-token-legend [data-field-tone]').first().waitFor({ state: 'visible' });
    const dailyColors = await page.locator('.ins-token-legend [data-field-tone]').evaluateAll(es => es.map(el => getComputedStyle(el).color));
    await page.goto('/runs');
    await page.getByText('Show run analysis', { exact: true }).click();
    for (const [label, tone] of [['Tokens in', 'tokens-in'], ['Tokens out', 'tokens-out']]) {
      const expected = dailyColors[tone === 'tokens-in' ? 0 : 1];
      const legend = tokens.getByRole('button', { name: label, exact: true });
      await expect(legend).toHaveCSS('color', expected);
      await expect(legend.locator('[data-swatch]')).toHaveCSS('background-color', expected);
    }
    const outcomes = page.getByRole('figure', { name: 'Run outcomes', exact: true });
    const pass = outcomes.getByRole('button', { name: 'Passed: 2 runs', exact: true });
    const fail = outcomes.getByRole('button', { name: 'Failed: 1 run', exact: true });
    expect(await pass.evaluate(el => getComputedStyle(el).color)).not.toBe(await fail.evaluate(el => getComputedStyle(el).color));
    await outcomes.getByRole('button', { name: 'Failed: 1 run', exact: true }).click();
    await expect(outcomes.getByRole('status')).toHaveText('Failed: 1 run');
    await page.screenshot({ path: info.outputPath(`overview-colors-${theme}.png`) });
  }
});

test('Overview expanded cards preserve missing values and fit a phone', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Quality', exact: true }).getByRole('link', { name: 'View delegation evidence' })).toHaveAttribute('href', '/delegation-evidence');
  await expect(page.locator('[data-component="overview-spend"]')).toContainText('Not measured');
  await page.goto('/runs');
  await page.getByText('Full routing breakdown', { exact: true }).click();
  const tier = page.getByRole('region', { name: 'Tier mix', exact: true });
  await expect(tier.locator('dl > [data-field-tone]')).toHaveCount(3);
  await expect(tier.locator('dl')).toContainText('10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('overview-expanded-phone.png') });
});
