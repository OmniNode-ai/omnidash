import { expect, test, type Locator } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Lakshman 2026-10-23: on Overview the "Figures for" label sat about 14px below its All time / Today switch and the
// Explore runs link (measured at 1440x900: label centre 111.9px, switch and link 98px), because the shared filters
// rule aligns that toolbar to the end of the row. Declared before the CSS change: the label sitting low, the label
// sitting high, Explore runs leaving the switch's centre line, and either theme changing the alignment.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); await page.emulateMedia({ reducedMotion: 'reduce' }); });

const centre = async (locator: Locator) => { const box = (await locator.boundingBox())!; return box.y + box.height / 2; };

test('Overview window label, switch and Explore runs share one centre line in both themes', async ({ page }) => {
  await page.goto('/overview');
  const options = page.getByRole('radiogroup', { name: 'Figures for', exact: true });
  await expect(options).toBeVisible();
  const label = page.locator('.local-window-switch > span');
  await expect(label).toHaveText('Figures for');
  const explore = page.getByRole('link', { name: 'Explore runs' });
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const line = await centre(options);
    expect(Math.abs(await centre(label) - line), `${theme}: label centre`).toBeLessThanOrEqual(1);
    expect(Math.abs(await centre(explore) - line), `${theme}: Explore runs centre`).toBeLessThanOrEqual(1);
  }
});
