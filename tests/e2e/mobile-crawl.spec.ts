/**
 * WS6 — Mobile screenshot crawl.
 * Visits every key page at 320px (smallest mobile) and 768px (tablet breakpoint).
 * Screenshots saved to tests/e2e/screenshots/mobile-crawl/.
 * Run with: npx playwright test tests/e2e/mobile-crawl.spec.ts
 */

import { test, expect } from 'playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.join(__dirname, 'screenshots', 'mobile-crawl');

const VIEWPORTS = [
  { name: '320', width: 320, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
];

// Sidebar nav button selectors and the page they expose.
// Each entry: [sidebar button aria-label or text, activePage value, page slug for filename]
const PAGES = [
  { label: 'dashboard',          slug: 'dashboard',           nav: null },           // default
  { label: 'delegation-evidence', slug: 'delegation-evidence', nav: 'Delegation' },
  { label: 'event-bus',           slug: 'event-bus',           nav: 'Event Bus' },
  { label: 'experiments',         slug: 'experiments',         nav: 'Experiments' },
  { label: 'sea-control',         slug: 'sea-control',         nav: 'SEA' },
  { label: 'feature-flags',       slug: 'feature-flags',       nav: 'Flags' },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const page of PAGES) {
      test(`${page.slug}`, async ({ page: pw }) => {
        await pw.goto('/');
        await pw.waitForLoadState('networkidle');

        if (page.nav) {
          // On narrow screens the sidebar may be collapsed — open it first.
          if (vp.width < 768) {
            const toggle = pw.locator('button[aria-label="Toggle sidebar"], .sidebar-toggle').first();
            if (await toggle.isVisible()) await toggle.click();
            await pw.waitForTimeout(300);
          }
          // Click the nav item that matches this page.
          const navBtn = pw.getByText(page.nav, { exact: false }).first();
          if (await navBtn.isVisible()) {
            await navBtn.click();
            await pw.waitForTimeout(500);
          }
          // Close sidebar overlay on mobile after navigating — click the toggle button again.
          if (vp.width < 768) {
            const toggle = pw.locator('button[aria-label="Toggle sidebar"], .sidebar-toggle').first();
            if (await toggle.isVisible()) await toggle.click();
            await pw.waitForTimeout(200);
          }
        }

        await pw.waitForTimeout(800);

        await pw.screenshot({
          path: path.join(SCREENSHOTS, `${vp.name}-${page.slug}.png`),
          fullPage: true,
        });

        // Basic sanity: page must not be blank.
        await expect(pw.locator('body')).not.toBeEmpty();
      });
    }
  });
}
