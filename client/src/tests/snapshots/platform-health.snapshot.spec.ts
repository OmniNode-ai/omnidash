import { test, expect } from '@playwright/test';

/**
 * Platform Health Dashboard Snapshot Tests
 *
 * Tests visual consistency of the Platform Health dashboard which displays
 * system health metrics, service status, and error tracking.
 */
test.describe('Platform Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('platform-health-desktop.png', {
      fullPage: true,
    });
  });

  test('should match health metrics grid', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toHaveScreenshot('platform-health-metrics.png');
  });

  test('should match service status indicators', async ({ page }) => {
    // Wait for status indicators to load
    await page.waitForSelector('.rounded-lg.border', { timeout: 5000 });

    const statusSection = page.locator('main');
    await expect(statusSection).toHaveScreenshot('platform-health-status.png');
  });

  test('should match error tracking section', async ({ page }) => {
    // Scroll to bottom to ensure all sections are visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('platform-health-errors.png', {
      fullPage: true,
    });
  });
});
