import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 20 AC137 (Lakshman 2026-10-26, "A: warm paper") and part 16 AC97 across the seven pages.
// Failure modes declared before the checks:
//   S1  a light page, card, sidebar or card border still on the old grey (it reads another token), or pure white/black;
//   S2  the dark theme picking up the light values;
//   S3  a bar drawn solid, dotted or as a plain gradient instead of the one 135deg hatch;
//   S4  a hatch in another colour than its bar's own, or a bar without its 2px edge;
//   S5  a solid Evidence bar left outside the pass/fail strip (the old token bars).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const PAGES = ['/overview', '/runs', '/workflow?correlation_id=chart-run-a', '/usage', '/settings', '/delegation-evidence'];
const SURFACES = {
  light: { page: 'rgb(246, 245, 241)', card: 'rgb(255, 254, 251)', border: 'rgb(231, 228, 220)', sidebar: 'rgb(250, 249, 246)' },
  dark: { page: 'rgb(15, 18, 24)', card: 'rgb(22, 26, 34)', border: 'rgb(38, 43, 53)', sidebar: 'rgb(18, 21, 28)' },
} as const;
const BARS = '.rb-bar[data-pattern="hatched"], .gdb-bar.ins-seg, .utc-stack i, .ev-qg-bar > .bar-fill, .local-runs-week-bar > i, .ins-fill';

async function openEverything(page: Page) {
  for (let pass = 0; pass < 3; pass++) {
    const closed = page.locator('main details:not([open]) > summary');
    if (await closed.count() === 0) return;
    await closed.evaluateAll(summaries => summaries.forEach(summary => (summary.parentElement as HTMLDetailsElement).open = true));
  }
}

/** Every drawn bar that is not the one hatch in its own colour under a 2px edge, described. */
function offBars(page: Page) {
  return page.locator(BARS).evaluateAll(elements => elements.filter(el => el.getClientRects().length > 0).map(el => {
    const css = getComputedStyle(el);
    const edge = Math.max(parseFloat(css.borderTopWidth), parseFloat(css.borderRightWidth));
    const hatch = css.backgroundImage.startsWith('repeating-linear-gradient(135deg')
      && (css.backgroundImage.includes(css.color) || /currentcolor/i.test(css.backgroundImage));
    const solid = css.backgroundColor !== 'rgba(0, 0, 0, 0)';
    return hatch && !solid && edge === 2 ? '' : `${el.className} image=${css.backgroundImage.slice(0, 48)} fill=${css.backgroundColor} edge=${edge}`;
  }).filter(Boolean));
}

for (const theme of ['light', 'dark'] as const) {
  test(`AC137 surfaces and AC97 bars on all seven pages in ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    await serveCharts(page);
    const receipt: Record<string, unknown>[] = [];
    let controlCaught = false;
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await openEverything(page);
      const want = SURFACES[theme];
      await expect(page.locator('main').first(), `${path} page`).toHaveCSS('background-color', want.page);
      await expect(page.locator('.sidebar').first(), `${path} sidebar`).toHaveCSS('background-color', want.sidebar);
      // OMN-21166 revision 3 (AC160): on Settings the card is the section; its embedded panels are flat inside it.
      const card = page.locator('main .local-dashboard-panel:not(.local-overview-summary > .local-dashboard-panel, .local-settings-section .local-dashboard-panel), main .local-settings-section, main.ev-root .panel').first();
      await expect(card, `${path} card`).toHaveCSS('background-color', want.card);
      await expect(card, `${path} card border`).toHaveCSS('border-top-color', want.border);
      if (theme === 'light') await expect(card, `${path} card shadow`).toHaveCSS('box-shadow', 'rgba(60, 50, 30, 0.05) 0px 1px 2px 0px');
      const bars = await page.locator(BARS).count();
      const off = await offBars(page);
      expect(off, `${path}: every bar is the hatch`).toEqual([]);
      await expect(page.locator('main.ev-root .bar-fill:not(.ev-qg-bar > .bar-fill)'), `${path}: no solid Evidence bar`).toHaveCount(0);
      receipt.push({ path, bars, off: off.length });
      if (!controlCaught && bars > 0) {
        // Positive control: a solid bar planted on the page must be caught by the same check.
        await page.locator('main').first().evaluate(main => {
          const planted = document.createElement('span');
          planted.className = 'gdb-bar ins-seg planted-control';
          planted.setAttribute('style', 'display:block;height:10px;background:rgb(255, 0, 0) !important');
          main.append(planted);
        });
        expect((await offBars(page)).some(line => line.includes('planted-control')), 'control: a solid bar is caught').toBe(true);
        await page.locator('.planted-control').evaluate(el => el.remove());
        controlCaught = true;
      }
    }
    expect(controlCaught, 'the control ran on a page with bars').toBe(true);
    expect(receipt.filter(row => (row.bars as number) > 0).map(row => row.path)).toEqual(expect.arrayContaining(['/overview', '/runs', '/usage']));
    writeFileSync(info.outputPath('surfaces-bars.json'), JSON.stringify({ theme, surfaces: SURFACES[theme], pages: receipt, controlCaught }, null, 2));
  });
}
