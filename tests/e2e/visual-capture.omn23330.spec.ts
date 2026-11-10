import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
import { chartRows, meteringAll, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-23330 AC32: the CSS consolidation (AC23, AC29 to AC31) changes nothing a reader sees beyond the approved fixes. This
// spec captures all seven pages in light and dark at 1440 px and 390 px into OMN23330_VISUAL_OUT; tests/visual/compare.mjs
// compares two captures pixel by pixel. It runs only when OMN23330_VISUAL_OUT is set, so the ordinary suite skips it.
// Each page scrolls inside its own column, so the viewport is made tall enough for the whole page instead of a
// full-page screenshot; motion is reduced and the fixture clock is frozen, so two captures of one commit match.
const OUT = process.env.OMN23330_VISUAL_OUT;
const PAGES = ['overview', 'runs', 'workflow', 'usage', 'settings', 'delegation-evidence', 'event-bus'];
const all = meteringAll({ total_cost_usd: '12.34', total_savings_usd: '45.67', total_baseline_cost_usd: '58.01', run_count: 2893,
  tokens_input_total: 586080, tokens_output_total: 344360 });
const rows = { ...chartRows, [prefix + 'metering-summary.v1']: [...(chartRows[prefix + 'metering-summary.v1'] as unknown[]), all] };

// One raster thread, no partial raster and one colour profile: with the defaults, two captures of one commit differed by
// 1 to 9 anti-aliased pixels on panel corners (measured 2026-11-10 on the lab), so a zero would prove nothing. Launch
// options apply to the whole file, so they are set here, outside the group.
test.use({ reducedMotion: 'reduce', launchOptions: { args: ['--num-raster-threads=1', '--disable-partial-raster',
  '--disable-gpu-rasterization', '--force-color-profile=srgb', '--disable-lcd-text'] } });

test.describe('OMN-23330 AC32 visual capture', () => {
  test.skip(!OUT, 'set OMN23330_VISUAL_OUT to capture');
  for (const [width, height] of [[1440, 5000], [390, 9000]] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const name of PAGES) {
        test(`${name} ${theme} ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await serveCharts(page, rows);
          await page.goto(`/${name}`);
          await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
          await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
          if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) {
            await page.getByRole('button', { name: 'Toggle theme' }).click();
          }
          await page.evaluate(() => document.fonts.ready);
          await page.waitForLoadState('networkidle');
          // A capture is kept only when the page has drawn its content and two screenshots half a second apart are the same
          // to the byte: a lab run under load once drew a blank page, and late paints differed by a few pixels.
          let shot: Buffer | null = null;
          for (let attempt = 0; attempt < 8 && shot === null; attempt += 1) {
            await expect(page.locator('main h1').first()).toBeVisible();
            expect((await page.locator('main').first().innerText()).length).toBeGreaterThan(80);
            const first = await page.screenshot({ animations: 'disabled', caret: 'hide' });
            await page.waitForTimeout(500);
            const second = await page.screenshot({ animations: 'disabled', caret: 'hide' });
            if (first.equals(second)) shot = second;
          }
          expect(shot, 'two screenshots in a row matched').not.toBeNull();
          mkdirSync(OUT!, { recursive: true });
          writeFileSync(path.join(OUT!, `${name}-${theme}-${width}.png`), shot!);
        });
      }
    }
  }
});
