import { test, expect } from '@playwright/test';

/**
 * Intelligence Operations Dashboard Snapshot Tests
 *
 * Tests visual consistency of the Intelligence Operations dashboard which
 * displays AI operations, LLM calls, and intelligence gathering metrics.
 */
test.describe('Intelligence Operations Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/intelligence');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('intelligence-operations-desktop.png', {
      fullPage: true,
    });
  });

  test('should match operations metrics section', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toHaveScreenshot('intelligence-operations-metrics.png');
  });

  test('should match operations grid layout', async ({ page }) => {
    // Wait for grid items to load
    await page.waitForSelector('.grid', { timeout: 5000 });

    const grid = page.locator('main .grid').first();
    await expect(grid).toHaveScreenshot('intelligence-operations-grid.png');
  });

  test('should handle responsive layout on tablet', async ({ page }) => {
    // This will be captured by the tablet project configuration
    await expect(page).toHaveScreenshot('intelligence-operations-tablet.png', {
      fullPage: true,
    });
  });
});
