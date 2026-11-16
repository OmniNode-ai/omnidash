import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// OMN-24616 AC7: a run opened from a filtered Runs view leads back to that same view, by the Runs breadcrumb and by
// the back link, and stepping to a neighbouring run keeps the way back. Fails if either link is missing, drops the
// filter, or a neighbour link loses it.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const VIEW = '/runs?model=model-a';

test('a run opened from Runs returns to the same filtered view by the breadcrumb and by the back link', async ({ page }) => {
  await serveCharts(page);
  await page.goto(VIEW);
  await page.locator('.local-runs-wrap a[href*="correlation_id=chart-run-a"]').first().click();
  await expect(page).toHaveURL(/\/workflow\?correlation_id=chart-run-a&from=%2Fruns%3Fmodel%3Dmodel-a$/);

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Runs' }).click();
  await expect(page).toHaveURL(new RegExp(`${VIEW.replace('?', '\\?')}$`));

  await page.goBack();
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  await expect(page).toHaveURL(new RegExp(`${VIEW.replace('?', '\\?')}$`));
});

test('a neighbouring run keeps the way back to the Runs view', async ({ page }) => {
  await serveCharts(page);
  await page.goto(`/workflow?correlation_id=chart-run-a&from=${encodeURIComponent(VIEW)}`);
  const older = page.getByRole('navigation', { name: 'Neighbouring runs' }).getByRole('link', { name: 'Older run' });
  await expect(older).toHaveAttribute('href', /&from=%2Fruns%3Fmodel%3Dmodel-a$/);
});
