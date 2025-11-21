import { test, expect } from '@playwright/test';

/**
 * Event Flow Dashboard Snapshot Tests
 *
 * Tests visual consistency of the Event Flow dashboard which displays
 * real-time Kafka event processing, consumer lag, and event metrics.
 */
test.describe('Event Flow Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('event-flow-desktop.png', {
      fullPage: true,
    });
  });

  test('should match event metrics section', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toHaveScreenshot('event-flow-metrics.png');
  });

  test('should match event stream visualization', async ({ page }) => {
    // Wait for any chart or visualization elements
    await page.waitForSelector('.recharts-wrapper', { timeout: 5000 }).catch(() => {
      // Fallback to any container
      return page.waitForSelector('main > div', { timeout: 5000 });
    });

    const mainContent = page.locator('main');
    await expect(mainContent).toHaveScreenshot('event-flow-visualization.png');
  });

  test('should match real-time updates indicator', async ({ page }) => {
    // Look for status indicators or badges
    const statusElements = page.locator('[class*="badge"], [class*="status"]');

    if ((await statusElements.count()) > 0) {
      const firstStatus = statusElements.first();
      await expect(firstStatus).toHaveScreenshot('event-flow-status.png');
    }
  });
});
