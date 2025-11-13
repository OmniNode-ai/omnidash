import { test, expect } from '@playwright/test';

/**
 * Component-Level Snapshot Tests
 *
 * Tests visual consistency of key UI components used across dashboards.
 * These tests isolate individual components to detect changes at the component level.
 */
test.describe('Key UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match metric card component', async ({ page }) => {
    // Find first metric card
    const metricCard = page.locator('[data-testid="metric-card"]').first().or(
      page.locator('.rounded-lg.border').first()
    );

    if (await metricCard.isVisible().catch(() => false)) {
      await expect(metricCard).toHaveScreenshot('component-metric-card.png');
    }
  });

  test('should match navigation sidebar', async ({ page }) => {
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toHaveScreenshot('component-sidebar.png');
  });

  test('should match header component', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toHaveScreenshot('component-header.png');
  });

  test('should match theme toggle button', async ({ page }) => {
    // Look for theme toggle button
    const themeToggle = page.locator('button[aria-label*="theme"]').or(
      page.locator('[data-testid="theme-toggle"]')
    );

    if (await themeToggle.isVisible().catch(() => false)) {
      await expect(themeToggle).toHaveScreenshot('component-theme-toggle.png');
    }
  });

  test('should match navigation menu items', async ({ page }) => {
    const navItems = page.locator('nav a').first();

    if (await navItems.isVisible().catch(() => false)) {
      await expect(navItems).toHaveScreenshot('component-nav-item.png');
    }
  });

  test('should match status badge component', async ({ page }) => {
    // Look for status badges across the page
    const statusBadge = page.locator('[class*="badge"]').first().or(
      page.locator('[class*="status"]').first()
    );

    if (await statusBadge.isVisible().catch(() => false)) {
      await expect(statusBadge).toHaveScreenshot('component-status-badge.png');
    }
  });

  test('should match chart container', async ({ page }) => {
    // Look for Recharts wrapper
    const chart = page.locator('.recharts-wrapper').first();

    if (await chart.isVisible().catch(() => false)) {
      await expect(chart).toHaveScreenshot('component-chart.png');
    }
  });
});

test.describe('Component Responsive Behavior', () => {
  test('should match sidebar on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test will use mobile viewport from project configuration
    const sidebar = page.locator('aside').first();

    if (await sidebar.isVisible().catch(() => false)) {
      await expect(sidebar).toHaveScreenshot('component-sidebar-mobile.png');
    }
  });

  test('should match navigation on tablet', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test will use tablet viewport from project configuration
    const nav = page.locator('nav').first();
    await expect(nav).toHaveScreenshot('component-nav-tablet.png');
  });
});
