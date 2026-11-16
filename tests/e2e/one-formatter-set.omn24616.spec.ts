// OMN-24616 AC6 (falsifier): one formatter set over the six pages. Fails on a second spelling of a missing value, a
// page without an Updated time, or a share written with a precision other than one decimal.
// "Not recorded" stays allowed: it is the label of a run's status and failure cause (quality never evaluated, no
// cause recorded), a value a filter offers, not a missing figure.
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const PAGES = ['/overview', '/runs', '/workflow', '/usage', '/settings', '/delegation-evidence'];
const OTHER_SPELLINGS = /\b(Not served|Unavailable|Not available)\b/;
// A percent with no decimal, or with two or more, outside "<0.1%".
const OTHER_PRECISION = /(?<![\d.<])\d+%|\d+\.\d{2,}%/;

for (const path of PAGES) {
  test(`${path} writes a missing value one way, shows its Updated time, and one precision per share`, async ({ page }) => {
    await serveCharts(page);
    await page.goto(path);
    await expect(page.getByText(/^Updated /)).toBeVisible();
    await expect(page.getByText('Loading data…')).toHaveCount(0);
    const text = await page.locator('main').innerText();
    expect(text.match(OTHER_SPELLINGS)?.[0] ?? null).toBeNull();
    expect(text.match(OTHER_PRECISION)?.[0] ?? null).toBeNull();
  });
}
