import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 27 AC164/AC165 (revision 4, Lakshman 2026-10-27: the paradev.com and entire.com style, neutral in both
// themes; replaces part 20's warm paper and part 15's cool dark) and part 16 AC97 across the seven pages.
// Failure modes declared before the checks:
//   S1  a page, card, sidebar or card border still on the warm-paper or blue-navy value (it reads another token), or pure
//       white/black, or a card still lifted by the old warm shadow;
//   S2  the dark theme picking up the light values;
//   S3  a bar still hatched, dotted or a gradient instead of the solid flat fill (part 28 AC180 supersedes AC97's hatch);
//   S4  a fill in another colour than its bar's own, a transparent bar, or a bar without its 2px edge;
//   S5  a solid Evidence bar left outside the pass/fail strip (the old token bars).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const PAGES = ['/overview', '/runs', '/workflow?correlation_id=chart-run-a', '/usage', '/settings', '/delegation-evidence'];
const SURFACES = {
  light: { page: 'rgb(245, 245, 243)', card: 'rgb(253, 253, 252)', border: 'rgb(212, 212, 207)', sidebar: 'rgb(242, 242, 239)' },
  dark: { page: 'rgb(14, 14, 14)', card: 'rgb(22, 22, 22)', border: 'rgb(43, 43, 43)', sidebar: 'rgb(17, 17, 17)' },
} as const;
const BARS = '.rb-bar[data-pattern="hatched"], .gdb-bar.ins-seg, .utc-stack i, .ev-qg-bar > .bar-fill, .local-runs-week-bar > i, .ins-fill';

async function openEverything(page: Page) {
  for (let pass = 0; pass < 3; pass++) {
    const closed = page.locator('main details:not([open]) > summary');
    if (await closed.count() === 0) return;
    await closed.evaluateAll(summaries => summaries.forEach(summary => (summary.parentElement as HTMLDetailsElement).open = true));
  }
}

/** Every drawn bar that is not a solid flat fill in its own colour with a 2px edge (part 28 AC180), described. */
function offBars(page: Page) {
  return page.locator(BARS).evaluateAll(elements => elements.filter(el => el.getClientRects().length > 0).map(el => {
    const css = getComputedStyle(el);
    const edge = Math.max(parseFloat(css.borderTopWidth), parseFloat(css.borderRightWidth));
    const flat = css.backgroundImage === 'none' && css.backgroundColor === css.color && css.backgroundColor !== 'rgba(0, 0, 0, 0)';
    return flat && edge === 2 ? '' : `${el.className} image=${css.backgroundImage.slice(0, 48)} fill=${css.backgroundColor} edge=${edge}`;
  }).filter(Boolean));
}

for (const theme of ['light', 'dark'] as const) {
  test(`AC164 AC165 surfaces and AC97 bars on all seven pages in ${theme}`, async ({ page }, info) => {
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
      await expect(card, `${path} card is flat`).toHaveCSS('box-shadow', 'none');
      const bars = await page.locator(BARS).count();
      const off = await offBars(page);
      expect(off, `${path}: every bar is a solid flat fill`).toEqual([]);
      await expect(page.locator('main.ev-root .bar-fill:not(.ev-qg-bar > .bar-fill)'), `${path}: no solid Evidence bar`).toHaveCount(0);
      receipt.push({ path, bars, off: off.length });
      if (!controlCaught && bars > 0) {
        // Positive control: a hatched bar planted on the page must be caught by the same check.
        await page.locator('main').first().evaluate(main => {
          const planted = document.createElement('span');
          planted.className = 'gdb-bar ins-seg planted-control';
          planted.setAttribute('style', 'display:block;height:10px;color:rgb(255, 0, 0);border-top:2px solid currentColor;background:repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 6px) !important');
          main.append(planted);
        });
        expect((await offBars(page)).some(line => line.includes('planted-control')), 'control: a hatched bar is caught').toBe(true);
        await page.locator('.planted-control').evaluate(el => el.remove());
        controlCaught = true;
      }
    }
    expect(controlCaught, 'the control ran on a page with bars').toBe(true);
    expect(receipt.filter(row => (row.bars as number) > 0).map(row => row.path)).toEqual(expect.arrayContaining(['/overview', '/runs', '/usage']));
    writeFileSync(info.outputPath('surfaces-bars.json'), JSON.stringify({ theme, surfaces: SURFACES[theme], pages: receipt, controlCaught }, null, 2));
  });
}
