// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 AC38 (operator 2026-11-11: "verify whole dashboard all pages and improve it"). Measured live: after scrolling
// the content 800 px, Delegation Evidence's h1 stayed at 82 px (its header sat outside its scrolling element), while the
// Runs and Usage h1 moved from 78 px to -722 px.
// Failure mode:
//   F26  a page's title stays pinned while its content scrolls.
import { expect, test } from 'playwright/test';
import { keepRealClock, serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => { await keepRealClock(page); await serveCharts(page); });

for (const route of ['overview', 'runs', 'workflow', 'usage', 'settings', 'delegation-evidence']) {
  test(`${route}: the page title scrolls away with its content`, async ({ page }, info) => {
    await page.goto('/' + route);
    const title = page.locator('main h1').first();
    await expect(title).toBeVisible();
    // Measured once the page has its content, as the identity census waits (a loading page has nothing to scroll).
    await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.main')).not.toContainText(/Loading/);
    const moved = await page.evaluate(async () => {
      const h1 = document.querySelector('main h1')!;
      // The element that scrolls the page's content: the nearest ancestor-or-page box that overflows and scrolls.
      const scroller = [...document.querySelectorAll<HTMLElement>('main, main *')].find(el =>
        el.scrollHeight > el.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
      const boxes = [...document.querySelectorAll<HTMLElement>('main, main *')].filter(el => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
        .map(el => `${el.className.toString().slice(0, 40)} ${el.scrollHeight}/${el.clientHeight}`).slice(0, 6).join('; ');
      if (!scroller) return { scrolled: 0, delta: 0, boxes };
      scroller.scrollTop = 0;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const before = h1.getBoundingClientRect().top;
      scroller.scrollTop = 800;
      await new Promise(resolve => requestAnimationFrame(resolve));
      return { scrolled: scroller.scrollTop, delta: before - h1.getBoundingClientRect().top, boxes };
    });
    await page.screenshot({ path: info.outputPath(`${route}-scrolled.png`) });
    // A page whose content fits has nothing to scroll; Delegation Evidence must scroll, as it did in the measurement.
    if (route === 'delegation-evidence') expect(moved.scrolled, moved.boxes).toBeGreaterThan(100);
    if (moved.scrolled > 0) expect(Math.abs(moved.delta - moved.scrolled), moved.boxes).toBeLessThanOrEqual(2);
  });
}
