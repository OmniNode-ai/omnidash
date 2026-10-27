import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

// The owner removed the redundant section menu on every destination.
// Keep the real page heading and sections while checking the menu stays absent.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page, chartRows); });

for (const route of ['overview', 'runs', 'workflow', 'usage', 'settings', 'delegation-evidence']) {
  test(`${route} keeps content without On this page navigation`, async ({ page }, info) => {
    await page.goto('/' + route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${route}-without-section-menu.png`) });
  });
}
