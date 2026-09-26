import { expect, test } from 'playwright/test';

test('provisional execution graph renders projection, details, and cursor controls', async ({ page }) => {
  await page.goto('/iframe.html?id=delegation-execution-graph-view--provisional&viewMode=story');
  await expect(page.getByRole('group', { name: 'Recorded delegation execution graph' })).toBeVisible();
  await expect(page.getByText('2 recorded nodes, 1 recorded edges')).toBeVisible();
  await page.getByRole('button', { name: /root\.v1/ }).click();
  await expect(page.getByText('env-root')).toBeVisible();
  await page.getByRole('button', { name: 'Later bound' }).click();
  await expect(page.getByText('fold 1.0.0')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-provisional.png', fullPage: true });
});
