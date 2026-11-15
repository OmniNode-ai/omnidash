// OMN-24616 AC5 (falsifier): opening /overview?window=constructor must not blank the app. Before the fix the window
// lookup returned Object.prototype.constructor and the page threw with no error boundary, unmounting everything.
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

for (const name of ['constructor', 'toString', '__proto__']) {
  test(`/overview?window=${name} keeps the frame and the Overview page`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await serveCharts(page);
    await page.goto(`/overview?window=${name}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    // The malformed window is read as all time and the address is corrected.
    await expect.poll(() => new URL(page.url()).searchParams.get('window')).not.toBe(name);
    expect(errors).toEqual([]);
  });
}
