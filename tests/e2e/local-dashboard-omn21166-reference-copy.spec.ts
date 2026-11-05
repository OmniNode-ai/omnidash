import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';
import { withAllTime } from './omn21166-redesign-fixtures';
import { chartTabPanel, chooseChartTab } from './chart-tabs';

// OMN-21166 part 28, revision 5 (Lakshman 2026-10-27: "take help of codex and paradev and entire style copy it"; he chose
// a monochrome interface, solid flat bars and 8px corners). Failure modes declared before the code:
//   C1  an interface icon keeps a series colour, or the data and what names it (model names, tier icons) lose theirs
//       (AC177 as amended by part 28a, Lakshman's hybrid, which keeps OMN-21308's identities);
//   C2  a selected option keeps an accent tint, or looks the same as an unselected one (AC178);
//   C3  the card details open beside the card, keep an arrow or tint, or cover the card's own figure (AC179);
//   C4  a bar keeps its hatch, or becomes transparent (AC180);
//   C5  a card or button keeps its old radius (AC181);
//   C6  a secondary button is filled or blue (AC182);
//   C7  Overview's paired charts sit on different baselines, or a chart title has no divider (AC183);
//   C8  Delegation Evidence's content is inset from its title (AC184);
//   C9  Usage Savings per day names its days as ISO dates (AC185).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

// The 01+20 ink (Lakshman 2026-11-03): #0a0a0a / #f5f5f5 (was #111111 / #fafafa).
const INK = { light: 'rgb(10, 10, 10)', dark: 'rgb(245, 245, 245)' } as const;
const INK2 = { light: 'rgb(38, 38, 38)', dark: 'rgb(212, 212, 212)' } as const; // 01+20 ink-2 #262626 / #d4d4d4 (was #3d3d3d / #c2c2c2)
// the 01+20 look (Lakshman 2026-11-03, "01 + 20 do it"): ink-3 #525252 / #a3a3a3 and the soft fill #f0f0f0 / #1f1f1f for a chosen item.
const INK3 = { light: 'rgb(82, 82, 82)', dark: 'rgb(163, 163, 163)' } as const;
const RAISED = { light: 'rgb(240, 240, 240)', dark: 'rgb(31, 31, 31)' } as const;
// The 01+20 hairline (Lakshman 2026-11-03): #e5e5e5 / #262626 (was #d4d4cf / #2b2b2b).
const LINE = { light: 'rgb(229, 229, 229)', dark: 'rgb(38, 38, 38)' } as const;
const PAGES = ['/overview', '/runs', '/workflow?correlation_id=chart-run-a', '/usage', '/settings', '/delegation-evidence'];

async function openTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
  await serveCharts(page);
}

async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
}

for (const theme of ['light', 'dark'] as const) {
  test(`AC177 interface icons are grey and colour stays on the data and its names in ${theme}`, async ({ page }) => {
    await openTheme(page, theme);
    for (const path of PAGES) {
      await settle(page, path);
      const icons = await page.evaluate(() => [...document.querySelectorAll('.sidebar .dash-marker svg, main svg.lucide')]
        // OMN-21970 (Lakshman 2026-11-03, one colour per concept): an icon that names a concept draws its own colour on
        // every page (checked below); every icon that names none is the interface grey.
        .filter(svg => !svg.closest('.local-run-pill, .badge, .chain-node, .live-pill, [role="alert"]') && !svg.matches('[data-field-icon], [data-semantic-concept]') && (svg as SVGElement).getBoundingClientRect().width > 0)
        // OMN-22168 (Lakshman 2026-11-04/05, "make colourful"; "each unique thing has different and unique colors"): an icon
        // that names a concept (data-semantic-concept: a window, a header status) draws its own colour, and each chart tab's
        // glyph draws its chart's tone; they are not interface icons.
        // OMN-22168 (Lakshman 2026-11-04, chosen over this grey for these controls only): each Runs filter's glyph and the
        // CSV and JSON export glyphs carry their own colour; design-system-dashboard-polish L8 checks them.
        // OMN-22168 (Lakshman 2026-11-04): the Runs filter and export glyphs, and each page's sidebar and title icon, draw
        // their own colour (design-system-dashboard-polish L8 and L11 check them); they still count as drawn icons.
        .map(svg => ({ color: getComputedStyle(svg).color, active: !!svg.closest('.mvp-nav-item.active'),
          exempt: !!svg.closest('.local-dashboard-filters .ds-dropdown-mark, .local-runs-export button[data-export], .local-dashboard-tablist [role="tab"][data-toned]') || svg.matches('svg.destination-icon') })));
      expect(icons.length, `${path} draws icons`).toBeGreaterThan(3);
      for (const icon of icons.filter(item => !item.exempt)) expect(icon.color, `${path} icon`).toBe(INK3[theme]);
      const concepts = await page.evaluate(() => [...document.querySelectorAll('main svg.field-icon[data-field-icon]:not([data-field-icon^="tier-"]):not([data-semantic-concept^="model:"])')]
        .filter(svg => (svg as SVGElement).getBoundingClientRect().width > 0 && !svg.closest('[data-field-unavailable="true"]'))
        .map(svg => { const concept = svg.getAttribute('data-field-icon')!; const probe = document.createElement('i');
          probe.style.color = `var(--ds-field-${concept})`; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove();
          return { concept, color: getComputedStyle(svg).color, want }; }));
      for (const icon of concepts) expect(icon.color, `${path} ${icon.concept} icon draws its concept colour`).toBe(icon.want);
      // Hybrid: a model under its bar keeps that bar's colour (OMN-21308 AC3), on the swatch beside its ink name since
      // OMN-21970 option a (Lakshman 2026-11-03).
      const named = await page.locator('main li[data-ranked-item]').evaluateAll(items => items.filter(item => item.querySelector('.rb-name .rb-swatch') && item.querySelector('.rb-bar[data-pattern="hatched"]'))
        .map(item => ({ name: getComputedStyle(item.querySelector('.rb-name .rb-swatch')!).backgroundColor, bar: getComputedStyle(item.querySelector('.rb-bar')!).color })));
      for (const item of named) expect(item.name, `${path} model swatch keeps its bar colour`).toBe(item.bar);
    }
    // Control: the data keeps its colour, so a check that turned everything grey would fail here.
    await settle(page, '/overview');
    const swatches = await page.locator('.ins-token-legend li i, .gdb-bar.ins-seg').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) expect([INK[theme], INK2[theme], INK3[theme], 'rgba(0, 0, 0, 0)']).not.toContain(swatch);
  });

  test(`AC178 AC181 AC182 selected states, corners and secondary buttons are neutral in ${theme}`, async ({ page }) => {
    await openTheme(page, theme);
    await settle(page, '/overview');
    // OMN-21970 AC9: the window is one menu; its chosen option is the soft fill with ink text and a tick (Lakshman
    // 2026-11-03: one chosen state in every list).
    await page.locator('.local-window-trigger').click();
    const selected = page.locator('.local-window-list [role="radio"][aria-checked="true"]').first();
    const unselected = page.locator('.local-window-list [role="radio"][aria-checked="false"]').first();
    // OMN-22168 (Lakshman 2026-11-04, "make colourful"; supersedes the neutral chosen option): each option shows its own
    // window icon and the chosen one is tinted in its window's tone with a tick; its text stays in ink.
    await expect(selected.locator('svg.local-window-icon')).toHaveCount(1);
    await expect(selected.locator('svg.lucide-check')).toHaveCount(1);
    await expect(unselected.locator('svg.lucide-check')).toHaveCount(0);
    await expect(selected).toHaveCSS('color', INK[theme]);
    const selectedFill = await selected.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(selectedFill).not.toBe('rgba(0, 0, 0, 0)');
    // Control: the unselected option is told apart from the selected one.
    expect(await unselected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(selectedFill);
    await page.keyboard.press('Escape');
    await expect(page.locator('main article.local-dashboard-panel').first()).toHaveCSS('border-radius', '12px');
    const expand = page.locator('.local-chart-expand').first();
    await expect(expand).toHaveCSS('border-radius', '8px');
    await expect(expand).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(expand).toHaveCSS('border-top-color', LINE[theme]);
    await expect(expand).toHaveCSS('color', INK2[theme]);

    await settle(page, '/settings');
    // AC208 removed Settings' Appearance choice; the chosen Settings section tab carries the one chosen state now.
    const choice = page.locator('.local-settings-menu a[aria-current="page"]');
    await expect(choice).toHaveCount(1);
    await expect(choice).toHaveCSS('background-color', RAISED[theme]);
    await expect(choice).toHaveCSS('color', INK[theme]);
    expect(await page.locator('.local-settings-menu a:not([aria-current])').first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(RAISED[theme]);

    await settle(page, '/runs');
    // OMN-22168 (Lakshman 2026-11-04): the exports carry their own colour, and stay secondary: a light tint (alpha 0.25 or
    // less), never a solid fill.
    for (const name of ['Export CSV', 'Export JSON']) {
      const button = page.getByRole('button', { name, exact: true });
      const fill = await button.evaluate(el => getComputedStyle(el).backgroundColor);
      const alpha = Number(/\/\s*([\d.]+)\)$/.exec(fill)?.[1] ?? /rgba\([^)]*,\s*([\d.]+)\)$/.exec(fill)?.[1] ?? 1);
      expect(alpha, `${name} fill ${fill}`).toBeLessThanOrEqual(0.25);
    }
  });
}

test('AC179 as superseded by AC191: the card basis is a caption inside its own card, under the figure, with no popover', async ({ page }) => {
  // Part 29 AC191 replaced AC179's popover (it covered the next chart's title, Codex MSG 9def29ce): the basis now sits
  // in the card under its figure, so nothing opens over the page and no help cursor appears in the card's corner.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('omnidash.theme.v1', 'dark'));
  await serveCharts(page, withAllTime);
  await settle(page, '/overview');
  // The first and last cards that carry a basis (a card with nothing to say, like Tokens here, draws no caption).
  const cards = page.locator('.local-overview-summary > .local-dashboard-panel').filter({ has: page.locator('.local-card-caption') });
  const count = await cards.count();
  expect(count, 'cards with a caption').toBeGreaterThanOrEqual(1);
  for (const index of [...new Set([0, count - 1])]) {
    const card = cards.nth(index);
    await card.hover();
    await expect(page.locator('.local-overview-summary [role="tooltip"]')).toHaveCount(0);
    const caption = card.locator('.local-card-caption > :first-child');
    await expect(caption).toBeVisible();
    const [box, captionBox, figure] = await Promise.all([card.boundingBox(), caption.boundingBox(), card.locator('.local-dashboard-metric').boundingBox()]);
    expect(captionBox!.y, 'under the figure').toBeGreaterThanOrEqual(figure!.y + figure!.height - 1);
    expect(captionBox!.y + captionBox!.height, 'inside its card').toBeLessThanOrEqual(box!.y + box!.height + 1);
    expect(captionBox!.x, 'inside its card').toBeGreaterThanOrEqual(box!.x);
    expect(await card.evaluate(el => [el, ...el.querySelectorAll('*')].some(node => getComputedStyle(node).cursor === 'help')), 'no help cursor').toBe(false);
  }
});

test('AC180 every bar is a solid flat fill, never a hatch', async ({ page }) => {
  await openTheme(page, 'dark');
  for (const path of ['/overview', '/runs', '/usage', '/delegation-evidence']) {
    await settle(page, path);
    const bars = await page.locator('main :is(.rb-bar[data-pattern="hatched"], .gdb-bar.ins-seg, .utc-stack i, .ev-qg-bar > .bar-fill, .local-runs-week-bar > i, .ins-fill)')
      .evaluateAll(els => els.filter(el => el.getBoundingClientRect().height > 0 || el.getBoundingClientRect().width > 0)
        .map(el => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).backgroundColor })));
    expect(bars.length, `${path} draws bars`).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.image, `${path} no hatch`).toBe('none');
      expect(bar.color, `${path} filled`).not.toBe('rgba(0, 0, 0, 0)');
    }
  }
});

// OMN-22168: the pair is two tabs of one panel now, so "share a baseline" means the two day charts put their bars on the
// same baseline when each is chosen: switching tabs does not move the chart.
test('AC183 the two day charts share a baseline and every chart title has the panel divider', async ({ page }) => {
  await openTheme(page, 'dark');
  await settle(page, '/overview');
  const bottoms: number[] = [];
  for (const tab of ['Runs per day', 'Tokens per day']) {
    await chooseChartTab(page, tab);
    const panel = page.locator('.local-dashboard-panel[data-component="overview-insights"]');
    await expect(panel).toHaveCount(1);
    // Page coordinates: choosing a tab can scroll it into view.
    bottoms.push(await panel.locator('.ins-bars').first().evaluate(el => el.getBoundingClientRect().bottom + window.scrollY));
  }
  expect(Math.abs(bottoms[0]! - bottoms[1]!)).toBeLessThanOrEqual(1);
  // The 01+20 look (Lakshman 2026-11-03): a panel title is a small mono label with no rule under it (was a 1px divider).
  const titles = await page.locator('.local-dashboard-page--overview .local-dashboard-panel:not(.local-overview-summary > *) > h2').all();
  expect(titles.length, 'positive control: titles exist').toBeGreaterThan(0);
  for (const title of titles) await expect(title).toHaveCSS('border-bottom-width', '0px');
});

test('AC184 Delegation Evidence content lines up with its title on desktop and phone', async ({ page }) => {
  await openTheme(page, 'dark');
  await settle(page, '/delegation-evidence');
  const left = async () => page.evaluate(() => ({
    title: document.querySelector('.ev-page-head')!.getBoundingClientRect().left + parseFloat(getComputedStyle(document.querySelector('.ev-page-head')!).paddingLeft),
    content: document.querySelector('.ev-scroll > *')!.getBoundingClientRect().left,
  }));
  const desktop = await left();
  expect(Math.abs(desktop.content - desktop.title)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ev-scroll')).toHaveCSS('padding-left', '16px');
});

test('AC185 Usage Savings per day names its days like every other day axis', async ({ page }) => {
  await openTheme(page, 'dark');
  await settle(page, '/usage');
  // OMN-22168: Savings per day is a tab of "Savings and spend"; its own heading is hidden inside the tab, which names it.
  const savings = await chartTabPanel(page, 'Savings per day');
  const labels = savings.locator('figure svg text');
  await expect(labels.first()).toBeVisible();
  const texts = (await labels.allTextContents()).map(text => text.trim()).filter(Boolean);
  expect(texts.filter(text => /^[A-Z][a-z]{2} \d{1,2}$/.test(text)).length, 'day labels like Oct 13').toBeGreaterThan(0);
  expect(texts.filter(text => /^\d{4}-\d{2}-\d{2}$/.test(text)), 'no ISO day labels').toEqual([]);
});
