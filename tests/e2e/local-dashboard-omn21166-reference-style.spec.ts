import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 27, revision 4 (Lakshman 2026-10-27: follow paradev.com and entire.com's style, fonts and colours;
// he chose mono labels and figures, neutral headline cards and a neutral light theme after a live preview).
// Failure modes declared before the code:
//   R1  a label or headline figure keeps Inter, or other text leaves Inter (AC166);
//   R2  a headline card keeps a coloured edge, or a metric loses its identity colour on its icon when the edge goes (AC167);
//   R3  the page title, figure, radius or active navigation item keeps its old size or blue (AC168);
//   R4  mono figures widen the cards so a page scrolls sideways at 390 or 320 (AC168);
//   R5  Settings still shows an Appearance choice, or the header toggle stops switching or keeping the theme (AC169a);
//   R6  text under 4.5 contrast on its real background on the new surfaces, and a check that would not see it (AC170).
// Found by Codex's review of the revision-4 build against both references (codex-01a17a8b, 2026-10-27):
//   R7  a long full count (Usage tokens) wraps onto two lines inside its card at 1440;
//   R8  Workflow's four subject cards keep a tinted fill and a 3px coloured edge (louder than every other card);
//   R9  narrowing the window from desktop to phone without a reload leaves the sidebar open over a 56px page;
//   R10 chart titles stay 600 and section labels stay Inter;
//   R11 Settings stretches across the whole page and its section titles stay 600 (the references keep a narrow column).
// Found in the Chrome rounds on Lakshman's local data:
//   R12 focus or scrollIntoView scrolls the document itself, lifting the app frame and leaving a blank band under it.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const PAGES = ['/overview', '/runs', '/workflow?correlation_id=chart-run-a', '/usage', '/settings', '/delegation-evidence'];
const MONO = /JetBrains Mono/;
const INK = { light: 'rgb(17, 17, 17)', dark: 'rgb(250, 250, 250)' } as const;
const LINE = { light: 'rgb(212, 212, 207)', dark: 'rgb(43, 43, 43)' } as const;

async function openTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  // Seeded once per tab, so a reload keeps whatever the page chose (AC169 reads that).
  await page.addInitScript(value => { if (!sessionStorage.getItem('theme-seeded')) { localStorage.setItem('omnidash.theme.v1', value); sessionStorage.setItem('theme-seeded', '1'); } }, theme);
  await serveCharts(page);
}

for (const theme of ['light', 'dark'] as const) {
  test(`AC166 AC167 AC168 labels, figures, neutral headline cards and navigation in ${theme}`, async ({ page }, info) => {
    await openTheme(page, theme);
    await page.goto('/overview');
    const cards = page.locator('.local-overview-summary > .local-dashboard-panel');
    await expect(cards.first()).toBeVisible();
    const read = await cards.evaluateAll(els => els.map(el => {
      const label = el.querySelector(':scope > h2')!;
      const icon = label.querySelector('svg')!;
      // A measured figure; "Not measured" (data-measured=false) is a typed state in text, not a figure.
      const figure = el.querySelector('.local-dashboard-metric:not([data-measured="false"])');
      const css = getComputedStyle(el);
      return {
        labelFont: getComputedStyle(label).fontFamily, labelSize: getComputedStyle(label).fontSize,
        labelCase: getComputedStyle(label).textTransform, labelColor: getComputedStyle(label).color,
        iconColor: getComputedStyle(icon).color, figureFont: figure ? getComputedStyle(figure).fontFamily : null,
        figureSize: figure ? getComputedStyle(figure).fontSize : null, edge: css.borderTopWidth, edgeColor: css.borderTopColor,
        radius: css.borderRadius,
      };
    }));
    expect(read.length).toBeGreaterThanOrEqual(5);
    expect(read.filter(card => card.figureFont !== null).length, 'the fixture serves measured figures').toBeGreaterThanOrEqual(1);
    for (const card of read) {
      expect(card.labelFont, 'AC166 label in JetBrains Mono').toMatch(MONO);
      expect([card.labelSize, card.labelCase], 'AC166 label 12px uppercase').toEqual(['12px', 'uppercase']);
      if (card.figureFont !== null) {
        expect(card.figureFont, 'AC166 figure in JetBrains Mono').toMatch(MONO);
        expect(card.figureSize, 'AC168 figure 32px').toBe('32px');
      }
      expect([card.edge, card.edgeColor], 'AC167 neutral 1px edge').toEqual(['1px', LINE[theme]]);
      expect(card.radius, 'part 28 AC181 8px radius (was AC168 12px)').toBe('8px');
    }
    // Part 28 AC177 supersedes AC167's icon colour: every headline icon is the same grey, still not the label's colour.
    expect(new Set(read.map(card => card.iconColor)).size, 'every headline icon is one grey').toBe(1);
    expect(read.every(card => card.iconColor !== card.labelColor), 'the icon is not the label colour').toBe(true);
    // AC166: every other panel title and body text stays Inter.
    const title = page.locator('.local-dashboard-panel:not(.local-overview-summary > .local-dashboard-panel) > h2').first();
    await expect(title).toHaveCSS('font-family', /^Inter/);
    await expect(title).toHaveCSS('font-weight', '500');
    await expect(page.locator('.sidebar .sidebar-bottom-title > *').first()).toHaveCSS('font-family', MONO);
    // AC168: page title and the active navigation item.
    await expect(page.locator('.local-dashboard-header h1')).toHaveCSS('font-size', '28px');
    await expect(page.locator('.local-dashboard-header h1')).toHaveCSS('font-weight', '500');
    // Part 28 AC186: the current page is a lifted, bordered item (card surface in light, #262626 in dark), not the raised
    // surface that nearly matched the sidebar.
    const active = page.locator('.sidebar .mvp-nav-item.active');
    await expect(active).toHaveCSS('background-color', theme === 'dark' ? 'rgb(38, 38, 38)' : 'rgb(253, 253, 252)');
    await expect(active.locator('.dash-name')).toHaveCSS('color', INK[theme]);
    // Lakshman 2026-10-27: "an omninode product - keep this in one line", at the 12px floor and not cut off.
    const tagline = await page.locator('.brand-name .parent').evaluate(el => ({ lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '13')),
      height: el.getBoundingClientRect().height, size: getComputedStyle(el).fontSize, clipped: el.scrollWidth - el.clientWidth, overRow: el.getBoundingClientRect().right - el.closest('.brand')!.querySelector('.sidebar-toggle')!.getBoundingClientRect().left }));
    expect(tagline.height, 'the tagline is one line').toBeLessThan(18);
    expect([tagline.size, tagline.clipped <= 0, tagline.overRow <= 0], 'at 12px, whole, clear of the toggle').toEqual(['12px', true, true]);
    await page.screenshot({ path: info.outputPath(`reference-overview-${theme}-1440.png`) });
    // AC168 phone sizes and R4: nothing scrolls sideways at 390 or 320.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('.local-dashboard-header h1')).toHaveCSS('font-size', '24px');
      await expect(page.locator('.local-overview-summary .local-dashboard-metric:not([data-measured="false"])').first()).toHaveCSS('font-size', '24px');
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 15000 });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(over, `${path} at ${width}: no sideways scroll`).toBeLessThanOrEqual(1);
      }
      await page.goto('/overview');
      if (width === 390) await page.screenshot({ path: info.outputPath(`reference-overview-${theme}-390.png`), fullPage: true });
    }
  });
}

// Amendment 30c, criterion AC208 (spec label AC169a; the contract schema takes only plain numbered labels) (Lakshman 2026-10-27, "remove Appearance from settings as we already have toggle theme"): Settings has
// no Appearance section or theme choice; the header toggle is the one theme control and still switches and keeps it.
test('AC208 Settings has no Appearance section; the header toggle switches the theme and keeps it on reload', async ({ page }, info) => {
  await openTheme(page, 'light');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  expect(await page.locator('main section.local-settings-section > h2').allTextContents()).toEqual(['Model providers', 'Access', 'System status']);
  await expect(page.getByRole('heading', { name: 'Appearance' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toHaveCount(0);
  // Positive control: the header toggle still switches the theme, both ways, and the choice survives a reload.
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  await page.screenshot({ path: info.outputPath('settings-no-appearance-1440.png'), fullPage: true });
});

/** Every visible text element whose colour, composited over its first opaque ancestor background, is under 4.5:1. */
function lowContrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const paint = (base: number[], colour: string) => {
      ctx.globalCompositeOperation = 'copy'; ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const background = (el: Element | null): number[] => {
      const chain: string[] = [];
      for (let at = el; at; at = at.parentElement) {
        const css = getComputedStyle(at);
        if (css.backgroundColor !== 'rgba(0, 0, 0, 0)') chain.push(css.backgroundColor);
        if (/^(rgb\(|color\(srgb [^/]*\)$)/.test(css.backgroundColor) && !css.backgroundColor.includes('/')) break;
      }
      return chain.reverse().reduce((base, colour) => paint(base, colour), [255, 255, 255]);
    };
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !(node.textContent ?? '').trim()) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"], [hidden], .sr-only, svg') || el.getClientRects().length === 0) continue;
      const css = getComputedStyle(el);
      if (css.visibility !== 'visible' || Number(css.opacity) === 0 || css.clip === 'rect(0px, 0px, 0px, 0px)') continue;
      if (el.closest('button:disabled, [aria-disabled="true"]')) continue;
      const back = background(el);
      const fore = paint(back, css.color);
      const [hi, lo] = [lum(fore), lum(back)].sort((a, b) => b - a);
      const ratio = (hi! + 0.05) / (lo! + 0.05);
      if (ratio < 4.5) found.push(`${ratio.toFixed(2)} "${(node.textContent ?? '').trim().slice(0, 30)}" <${el.tagName.toLowerCase()} class="${el.className}"> ${css.color} on rgb(${back.join(', ')})`);
    }
    return found;
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`AC170 every text on the seven pages and Settings reads at 4.5 or more in ${theme}`, async ({ page }, info) => {
    await openTheme(page, theme);
    const walk: Record<string, unknown>[] = [];
    let controlCaught = false;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 15000 });
        if (!controlCaught) {
          // Positive control: a grey-on-grey line planted on the page must be caught by the same check.
          await page.locator('main').first().evaluate(main => {
            const planted = document.createElement('p');
            planted.className = 'contrast-control'; planted.textContent = 'planted low contrast line';
            planted.setAttribute('style', 'color: rgb(128, 128, 128); background: rgb(140, 140, 140)');
            main.prepend(planted);
          });
          controlCaught = (await lowContrast(page)).some(line => line.includes('planted low contrast line'));
          await page.locator('.contrast-control').evaluate(el => el.remove());
        }
        const surfaces = await page.evaluate(() => ({
          page: getComputedStyle(document.querySelector('main')!).backgroundColor,
          sidebar: getComputedStyle(document.querySelector('.sidebar')!).backgroundColor,
        }));
        // Measure the resting colours: no pointer over the page and every transition (theme, hover) finished.
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
        const low = await lowContrast(page);
        walk.push({ path, width, theme, surfaces, low });
        expect(low, `${path} at ${width} in ${theme}: text under 4.5`).toEqual([]);
      }
    }
    expect(controlCaught, 'control: the planted low-contrast line is caught').toBe(true);
    writeFileSync(info.outputPath(`contrast-walk-${theme}.json`), JSON.stringify({ theme, controlCaught, walk }, null, 2));
  });
}

test('R7 a long full count stays on one line inside its headline card, and short figures keep 32px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const metering = chartRows[prefix + 'metering-summary.v1'] as Record<string, unknown>[];
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [...metering,
    { ...metering[0], window_kind: 'all', window_start: '', spend_usd: '1344.190000', counterfactual_usd: '1400.000000', savings_usd: '55.810000',
      runs_total: 74100, tokens_in: 409870123, tokens_out: 123456789 }] });
  await page.goto('/usage');
  const figures = page.locator('.local-overview-summary .local-dashboard-metric:not([data-measured="false"])');
  await expect(figures.first()).toBeVisible();
  const read = await figures.evaluateAll(els => els.map(el => {
    const css = getComputedStyle(el);
    return { text: el.textContent, size: parseFloat(css.fontSize), lines: Math.round(el.getBoundingClientRect().height / parseFloat(css.lineHeight)),
      over: el.scrollWidth - el.clientWidth };
  }));
  expect(read.some(figure => figure.text === '409,870,123'), 'the long count is drawn in full').toBe(true);
  for (const figure of read) {
    expect([figure.text, figure.lines, figure.over <= 0], 'one line, nothing cut').toEqual([figure.text, 1, true]);
    expect(figure.size, figure.text ?? '').toBeLessThanOrEqual(32);
  }
  // A short figure on the same strip keeps the full 32px (the step-down is only for what does not fit).
  const short = read.find(figure => (figure.text ?? '').length <= 9);
  expect(short?.size, `short figure ${short?.text}`).toBe(32);
});

for (const theme of ['light', 'dark'] as const) {
  test(`R8 R10 Workflow subject cards are neutral with their colour on the title, chart titles 500 and section labels mono, in ${theme}`, async ({ page }) => {
    await openTheme(page, theme);
    await page.goto('/workflow?correlation_id=chart-run-a');
    const groups = page.locator('.local-run-summary-groups > .local-run-summary-group');
    await expect(groups).toHaveCount(4);
    const panel = await page.locator('main .local-dashboard-panel').first().evaluate(el => getComputedStyle(el).backgroundColor);
    const read = await groups.evaluateAll(els => els.map(el => ({ top: getComputedStyle(el).borderTopWidth, edge: getComputedStyle(el).borderTopColor,
      fill: getComputedStyle(el).backgroundColor, title: getComputedStyle(el.querySelector('h3')!).color })));
    for (const group of read) expect([group.top, group.edge, group.fill], 'neutral card').toEqual(['1px', LINE[theme], panel]);
    // Part 28 AC177 supersedes AC150/AC172's subject colours: the four titles are one grey.
    expect(new Set(read.map(group => group.title)).size, 'the four subject titles are one grey (AC177)').toBe(1);
    await page.goto('/runs');
    const week = page.locator('.local-runs-week .local-section-heading');
    if (await week.count()) await expect(week.first()).toHaveCSS('font-family', MONO);
    for (const heading of await page.locator('.local-chart-heading h3').all()) await expect(heading).toHaveCSS('font-weight', '500');
  });
}

test('R9 narrowing to phone width without a reload folds the sidebar so the page keeps its width', async ({ page }) => {
  await openTheme(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/overview');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 15000 });
  expect(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(72);
  expect(await page.locator('main').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
});

test('R11 Settings is a readable column and its section titles weigh 500', async ({ page }) => {
  await openTheme(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  const sections = page.locator('main section.local-settings-section');
  // Amendment 30c: Appearance is gone, so Model providers, Access and System status.
  await expect(sections).toHaveCount(3);
  for (const width of await sections.evaluateAll(els => els.map(el => el.getBoundingClientRect().width))) expect(width).toBeLessThanOrEqual(960);
  await expect(sections.first().locator(':scope > h2')).toHaveCSS('font-weight', '500');
});

test('R12 bringing a low element into view scrolls the page region, never the document under the app frame', async ({ page }) => {
  await openTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 632 });
  await page.goto('/runs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 15000 });
  await page.locator('main details').evaluateAll(all => all.forEach(el => { (el as HTMLDetailsElement).open = true; }));
  await page.locator('main').first().evaluate(main => { const last = main.querySelector('section, article, figure:last-of-type'); main.lastElementChild?.scrollIntoView({ block: 'end' }); last?.scrollIntoView({ block: 'end' }); });
  const after = await page.evaluate(() => ({ y: window.scrollY, top: Math.round(document.querySelector('.app')!.getBoundingClientRect().top) }));
  expect(after, 'the document stays put and the frame stays at the top').toEqual({ y: 0, top: 0 });
});
