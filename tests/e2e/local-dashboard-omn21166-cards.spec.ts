import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes: flat disconnected card styles, missing content/header separation,
// and standalone-card decoration leaking into compact grouped summary cells.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });
for (const route of ['overview', 'event-bus']) {
  test(`${route} cards keep clear headers and the requested neutral surfaces`, async ({ page }, info) => {
    await page.goto('/' + route);
    await expect(page.locator('h1')).toBeVisible();
    const card = page.locator(route === 'overview' ? '.local-overview-focus [data-component="overview-quality"]' : '.ev-root .panel').first();
    await expect(card).toBeVisible();
    expect(await card.evaluate(el => getComputedStyle(el).borderRadius)).toBe(route === 'overview' ? '10px' : '12px');
    if (route === 'overview') expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    else expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
    const header = page.locator(route === 'overview' ? '.local-overview-focus h2' : '.ev-root .panel-h').first();
    expect(await header.evaluate(el => getComputedStyle(el).borderBottomWidth)).toBe('1px');
    if (route === 'overview') {
      expect(await page.locator('.local-overview-summary').evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(160);
      expect(await page.locator('.local-overview-summary .local-dashboard-panel').first().evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    }
    await page.screenshot({ path: info.outputPath(`${route}-cards-light.png`), fullPage: true });
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    if (route === 'overview') expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    else expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${route}-cards-dark-mobile.png`), fullPage: true });
  });
}
