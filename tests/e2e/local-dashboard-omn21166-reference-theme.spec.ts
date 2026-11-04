import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Reference targets declared before CSS: readable ordinary text, matching dark hierarchy, all routes and controls
// retained.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); await page.emulateMedia({ reducedMotion: 'reduce' }); });

// OMN-22168 (Lakshman 2026-11-04, retired): "reference theme separates warm cards and inset plots" checked the warm
// canvas, card and inset tokens (--bg #fafaf9, --panel, --panel-2) the old palette defined on the root. The pages already
// painted the 01+20 paper over them, and the one design system removed those tokens, so nothing drawn changed; the
// readable-text and theme checks below still cover the routes.

test('shared reference theme keeps all seven routes usable in light and dark', async ({ page }, info) => {
  // OMN-21166 part 26: credentials and api-keys are sections of Settings.
  for (const route of ['overview','runs','workflow','usage','settings','delegation-evidence']) {
    await page.goto('/'+route);
    await expect(page.locator('h1')).toBeVisible();
    for (const theme of ['light','dark']) {
      if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name:'Toggle theme' }).click();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.screenshot({path:info.outputPath(`${route}-${theme}.png`)});
    }
  }
});

// Closer image match: filled ochre navigation and a shared muted plot/legend palette.
test('the active navigation item is neutral and outcome plots match their semantic legend', async ({ page }, info) => {
  await page.goto('/overview');
  if (await page.locator('html').getAttribute('data-theme') === 'dark') await page.getByRole('button', { name:'Toggle theme' }).click();
  const nav=page.getByRole('link', { name:'Overview', exact:true });
  // OMN-21166 part 28a AC186 (after part 27 AC168 replaced AC69's blue): a lifted neutral item with primary ink (light here).
  // the 01+20 look (Lakshman 2026-11-03, "01 + 20 do it"): the active item is the soft fill #f0f0f0 (was the card surface).
  await expect(nav).toHaveCSS('background-color','rgb(240, 240, 240)');
  await expect(nav.locator('.dash-name')).toHaveCSS('color','rgb(10, 10, 10)'); // the 01+20 ink (was #111111)
  const chart=page.getByRole('figure', { name:'Runs per day', exact:true });
  const passed=chart.getByRole('button', { name:'Passed', exact:true });
  await expect(passed).toHaveAttribute('aria-pressed','true');
  // OMN-21166 live review 2026-10-25: the dotted grouped bars are painted in currentColor (their colour property); their
  // background is no longer a solid fill, so the mark colour is read from `color`.
  const marks=()=>chart.locator('.gdb-col[data-series="passed"] .ins-seg').evaluateAll(els=>els.map(el=>getComputedStyle(el).color));
  const before=await marks();
  const passColor = await passed.evaluate(el => getComputedStyle(el, '::before').backgroundColor);
  expect(before.length).toBeGreaterThan(0);
  expect(before).toContain(passColor);
  await passed.click();
  expect(await marks()).toEqual([]);
  await passed.click();
  await expect(passed).toHaveAttribute('aria-pressed','true');
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('nanomon-palette-light.png')});
});
