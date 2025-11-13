import { test, expect } from '@playwright/test';

/**
 * Pattern Learning Dashboard Snapshot Tests
 *
 * Tests visual consistency of the Pattern Learning dashboard which displays
 * code patterns, learning metrics, and pattern evolution over time.
 */
test.describe('Pattern Learning Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('pattern-learning-desktop.png', {
      fullPage: true,
    });
  });

  test('should match patterns overview section', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toHaveScreenshot('pattern-learning-overview.png');
  });

  test('should match pattern cards grid', async ({ page }) => {
    // Wait for pattern cards to render
    await page.waitForSelector('.rounded-lg.border', { timeout: 5000 });

    const mainContent = page.locator('main');
    await expect(mainContent).toHaveScreenshot('pattern-learning-cards.png');
  });

  test('should match with collapsed sidebar', async ({ page }) => {
    // Click sidebar toggle if available
    const sidebarToggle = page.locator('[data-testid="sidebar-toggle"]').or(
      page.locator('button[aria-label*="toggle"]').first()
    );

    if (await sidebarToggle.isVisible().catch(() => false)) {
      await sidebarToggle.click();
      await page.waitForTimeout(500);
    }

    await expect(page).toHaveScreenshot('pattern-learning-sidebar-collapsed.png', {
      fullPage: true,
    });
  });
});
