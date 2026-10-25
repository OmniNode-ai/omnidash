import { expect, test, type Locator } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Lakshman 2026-10-23: on Overview the "Figures for" label sat about 14px below its All time / Today switch and the
// Explore runs link (measured at 1440x900: label centre 111.9px, switch and link 98px), because the shared filters
// rule aligns that toolbar to the end of the row. Declared before the CSS change: the label sitting low, the label
// sitting high, Explore runs leaving the switch's centre line, and either theme changing the alignment.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); await page.emulateMedia({ reducedMotion: 'reduce' }); });

const centre = async (locator: Locator) => { const box = (await locator.boundingBox())!; return box.y + box.height / 2; };

// Live review 2026-10-25 ("unified"): one control (calendar, All, Today, 7/15/30 days); its "Figures for" name is kept
// for screen readers and the header no longer has "Explore runs". The property kept: the calendar and the options sit
// on one centre line, beside the page title, in both themes.
test('Overview window calendar and options share one centre line with the title in both themes', async ({ page }) => {
  await page.goto('/overview');
  const options = page.getByRole('radiogroup', { name: 'Figures for', exact: true });
  await expect(options).toBeVisible();
  const calendar = page.getByRole('button', { name: /Pick a UTC day/ });
  const title = page.locator('.local-dashboard-header h1');
  await expect(page.getByRole('link', { name: 'Explore runs' })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const line = await centre(options);
    expect(Math.abs(await centre(calendar) - line), `${theme}: calendar centre`).toBeLessThanOrEqual(1);
    expect(Math.abs(await centre(title) - line), `${theme}: title centre`).toBeLessThanOrEqual(4);
  }
});
