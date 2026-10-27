import { expect, test, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';
import { withAllTime } from './omn21166-redesign-fixtures';

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

const INK = { light: 'rgb(17, 17, 17)', dark: 'rgb(250, 250, 250)' } as const;
const INK2 = { light: 'rgb(61, 61, 61)', dark: 'rgb(194, 194, 194)' } as const;
const INK3 = { light: 'rgb(85, 85, 85)', dark: 'rgb(168, 168, 168)' } as const;
const RAISED = { light: 'rgb(239, 239, 236)', dark: 'rgb(30, 30, 30)' } as const;
const LINE = { light: 'rgb(212, 212, 207)', dark: 'rgb(43, 43, 43)' } as const;
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
        .filter(svg => !svg.closest('.local-run-pill, .badge, .chain-node, .live-pill, [role="alert"]') && !svg.matches('[data-field-icon^="tier-"], [data-semantic-concept^="model:"]') && (svg as SVGElement).getBoundingClientRect().width > 0)
        .map(svg => ({ color: getComputedStyle(svg).color, active: !!svg.closest('.mvp-nav-item.active') })));
      expect(icons.length, `${path} draws icons`).toBeGreaterThan(3);
      for (const icon of icons) expect(icon.color, `${path} icon`).toBe(INK3[theme]);
      // Hybrid: a model name under its bar keeps that bar's colour (OMN-21308 AC3).
      const named = await page.locator('main li[data-ranked-item]').evaluateAll(items => items.filter(item => item.querySelector('.rb-name') && item.querySelector('.rb-bar[data-pattern="hatched"]'))
        .map(item => ({ name: getComputedStyle(item.querySelector('.rb-name')!).color, bar: getComputedStyle(item.querySelector('.rb-bar')!).color })));
      for (const item of named) expect(item.name, `${path} model name keeps its bar colour`).toBe(item.bar);
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
    const selected = page.locator('.local-window-options button[aria-checked="true"]').first();
    const unselected = page.locator('.local-window-options button[aria-checked="false"]').first();
    await expect(selected).toHaveCSS('background-color', RAISED[theme]);
    await expect(selected).toHaveCSS('color', INK[theme]);
    // Control: the unselected option is told apart from the selected one.
    expect(await unselected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(RAISED[theme]);
    await expect(page.locator('main article.local-dashboard-panel').first()).toHaveCSS('border-radius', '8px');
    const expand = page.locator('.local-chart-expand').first();
    await expect(expand).toHaveCSS('border-radius', '6px');
    await expect(expand).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(expand).toHaveCSS('border-top-color', LINE[theme]);
    await expect(expand).toHaveCSS('color', INK2[theme]);

    await settle(page, '/settings');
    const choice = page.locator('.local-settings-choice label').filter({ has: page.locator('input:checked') });
    await expect(choice).toHaveCSS('background-color', RAISED[theme]);
    await expect(choice).toHaveCSS('color', INK[theme]);

    await settle(page, '/runs');
    for (const name of ['Export CSV', 'Export JSON']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('color', INK2[theme]);
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

test('AC183 Overview pairs share a baseline and every chart title has the panel divider', async ({ page }) => {
  await openTheme(page, 'dark');
  await settle(page, '/overview');
  const pair = page.locator('.local-dashboard-panel[data-component="overview-insights"]');
  await expect(pair).toHaveCount(2);
  const bottoms = await pair.locator('.ins-bars').evaluateAll(els => els.map(el => el.getBoundingClientRect().bottom));
  expect(Math.abs(bottoms[0]! - bottoms[1]!)).toBeLessThanOrEqual(1);
  for (const title of await page.locator('.local-dashboard-page--overview .local-dashboard-panel:not(.local-overview-summary > *) > h2').all()) {
    await expect(title).toHaveCSS('border-bottom-width', '1px');
    await expect(title).toHaveCSS('border-bottom-color', LINE.dark);
  }
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
  const savings = page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: 'Savings per day' }) });
  const labels = savings.locator('figure svg text');
  await expect(labels.first()).toBeVisible();
  const texts = (await labels.allTextContents()).map(text => text.trim()).filter(Boolean);
  expect(texts.filter(text => /^[A-Z][a-z]{2} \d{1,2}$/.test(text)).length, 'day labels like Oct 13').toBeGreaterThan(0);
  expect(texts.filter(text => /^\d{4}-\d{2}-\d{2}$/.test(text)), 'no ISO day labels').toEqual([]);
});
