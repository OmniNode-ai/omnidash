import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Main Chrome showed solid blinking blocks where row disclosure chevrons belong:
// the global typing-cursor .caret style must not decorate Lucide SVGs.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });
test('row disclosure renders an unfilled stable chevron and rotates when expanded', async ({ page }, info) => {
  await page.goto('/event-bus');
  const button = page.locator('.row-disclosure').first();
  const icon = button.locator('svg.caret');
  await expect(icon).toBeVisible();
  await expect(icon.locator('path')).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    if (!(await page.locator('body').getAttribute('class'))?.includes('theme-' + theme)) await page.getByRole('button', { name: 'Toggle theme' }).click();
    expect(await icon.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await icon.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await icon.evaluate(el => el.getBoundingClientRect().width)).toBe(14);
  }
  await button.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await icon.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await page.screenshot({ path: info.outputPath('visible-disclosure-chevron.png') });
});
