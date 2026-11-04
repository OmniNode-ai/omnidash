import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// OMN-21970 AC9 (Lakshman 2026-11-02, "Hover lift and glow"): a headline card lifts and glows in its own colour on hover,
// and under prefers-reduced-motion it does neither. Rendered, because the unit tests read the stylesheet's rules and
// cannot see one rule cancelling another (Codex review of 34cfb67b1: the flat-card rule's box-shadow: none !important
// hid the glow while every unit test passed). Failure modes:
//   H1 the card lifts but does not glow (a later or stronger rule flattens the shadow);
//   H2 the card neither lifts nor glows under normal motion;
//   H3 under reduced motion the card still moves or glows;
//   H4 under reduced motion the page column still slides to its new width when the window narrows (the shell grid's
//      column transition was unguarded, so a phone-width layout was measured mid-slide; the counts spec failed on it).
test.use({ viewport: { width: 1440, height: 900 } });

async function hovered(page: Page) {
  const card = page.locator('.local-overview-summary > .local-dashboard-panel').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.hover();
  // The lift and glow ease in over 180ms; read them once they have finished.
  await page.waitForTimeout(400);
  return card.evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, transform: getComputedStyle(el).transform }));
}

test('H1 H2: under normal motion a headline card lifts and glows on hover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await serveCharts(page);
  await page.goto('/overview');
  const state = await hovered(page);
  expect(state.transform, 'the card lifts').not.toBe('none');
  expect(state.shadow, 'the card glows').not.toBe('none');
});

test('H3: under reduced motion a headline card neither moves nor glows on hover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serveCharts(page);
  await page.goto('/overview');
  const state = await hovered(page);
  expect(state.transform).toBe('none');
  expect(state.shadow).toBe('none');
});

test('H4: under reduced motion the page column takes its phone width at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serveCharts(page);
  await page.goto('/overview');
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  // Read in the same frame the resize lands in: no wait, so a running transition shows as a narrower column.
  const widths = await page.evaluate(() => new Promise<number[]>(done => requestAnimationFrame(() => {
    const now = document.querySelector('main')!.getBoundingClientRect().width;
    setTimeout(() => done([now, document.querySelector('main')!.getBoundingClientRect().width]), 500);
  })));
  expect(widths[0], 'the column width right after the resize equals its settled width').toBeCloseTo(widths[1]!, 0);
});
