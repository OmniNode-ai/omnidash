import { test, expect } from '@playwright/test';

/**
 * Agent Operations Dashboard Snapshot Tests
 *
 * These tests capture visual snapshots of the Agent Operations dashboard
 * to detect unintended UI changes and regressions.
 */
test.describe('Agent Operations Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');
    // Wait for any animations to complete
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot on desktop', async ({ page }) => {
    await expect(page).toHaveScreenshot('agent-operations-desktop.png', {
      fullPage: true,
    });
  });

  test('should match header section snapshot', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toHaveScreenshot('agent-operations-header.png');
  });

  test('should match metrics grid snapshot', async ({ page }) => {
    // Wait for metrics to load
    await page.waitForSelector('[data-testid="metric-card"]', {
      timeout: 5000,
    }).catch(() => {
      // Fallback: wait for any card-like containers
      return page.waitForSelector('.rounded-lg.border', { timeout: 5000 });
    });

    const metricsSection = page.locator('main');
    await expect(metricsSection).toHaveScreenshot('agent-operations-metrics.png');
  });

  test('should match sidebar navigation snapshot', async ({ page }) => {
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toHaveScreenshot('agent-operations-sidebar.png');
  });

  test('should match dark theme snapshot', async ({ page }) => {
    // Dashboard defaults to dark theme, but ensure it's set
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('agent-operations-dark-theme.png', {
      fullPage: true,
    });
  });

  test('should match light theme snapshot', async ({ page }) => {
    // Toggle to light theme
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('agent-operations-light-theme.png', {
      fullPage: true,
    });
  });
});
