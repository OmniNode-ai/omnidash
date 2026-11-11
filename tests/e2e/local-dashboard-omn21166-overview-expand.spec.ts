import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts, meteringAll } from './omn21166-chart-fixtures';
import { chooseChartTab } from './chart-tabs';

// Part 24: the current page has visible info icons, a seven-model row chart, and no expand controls.
// OMN-22168: the charts are tabs and the Expand control is removed; the checks below hold on the tabs.
// These browser checks are the red-first proof for those observed failures and their keyboard/viewport risks.
const names = [
  'Qwen3.8-27B', 'gemini-3.5-flash-lite', 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'apodex/apodex-1.1-mini:free', 'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free', 'poolside/laguna-xs-2.1:free',
];
const rows = {
  ...chartRows,
  [prefix + 'metering-summary.v1']: [meteringAll({ window: 'all', captured_at: '2026-10-26T10:00:00Z',
    total_cost_usd: 0.23, total_savings_usd: 4.23, run_count: 657, measured_run_count: 655,
    unknown_run_count: 2, estimated_run_count: 0, tokens_total: 963210 })],
  [prefix + 'delegation.model-routing.v1']: [{
    total_delegations: 657,
    by_model: names.map((model_name, index) => ({ model_name, total_count: [583, 39, 24, 5, 3, 2, 1][index], pct_of_total: [0.887, 0.059, 0.037, 0.008, 0.005, 0.003, 0.002][index] })),
    by_tier: { total_tasks: 657, tier_routed_total: 655, not_tier_routed_count: 2,
      tiers: [{ cost_tier_name: 'local', count: 581, tier_routed: true, pct_of_tier_routed: .887 }] },
  }],
};

for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`Overview cards and seven upright models fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await serveCharts(page, rows);
    await page.goto('/overview');
    const cards = page.locator('.local-overview-summary > .local-dashboard-panel');
    await expect(cards).toHaveCount(5);
    for (let index = 0; index < 5; index++) {
      const card = cards.nth(index);
      // Part 29 AC191 (supersedes the AC147 tooltip checks): no info control and no popover; the basis is the card's
      // caption, inside the card and inside the viewport at this width.
      await expect(card.locator('.local-card-info'), `card ${index + 1} has no info control`).toHaveCount(0);
      await expect(card.getByRole('tooltip'), `card ${index + 1} opens no popover`).toHaveCount(0);
      const caption = card.locator('.local-card-caption > :first-child');
      if (await caption.count()) {
        const bounds = await caption.evaluate(el => {
          const rect = el.getBoundingClientRect(); const cardRect = el.closest('.local-dashboard-panel')!.getBoundingClientRect();
          return { inCard: rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1 && rect.bottom <= cardRect.bottom + 1, right: rect.right, width: innerWidth };
        });
        expect(bounds.inCard, `card ${index + 1} caption inside its card`).toBe(true);
        expect(bounds.right, `card ${index + 1} caption inside the viewport`).toBeLessThanOrEqual(bounds.width);
      }
    }
    // OMN-22168: Overview's four charts are a row of tabs; Model usage is chosen first.
    await chooseChartTab(page, 'Model usage');
    const model = page.locator('[data-component="overview-model-usage"]');
    await expect(model.locator('.rb-chart--vertical [data-ranked-item]')).toHaveCount(7);
    for (const name of names) await expect(model.locator('.rb-name', { hasText: name })).toHaveCount(1);
    const plot = await model.locator('.rb-plot').evaluate(el => ({ display: getComputedStyle(el).display, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(plot.display).toBe('grid');
    if (width === 390) {
      // OMN-23330 AC4: the plot scrolls in the chart kit's container, its scrollbar always drawn.
      const modelScroll = await model.locator('.local-model-usage .ds-chart-scroll').evaluate(el => ({ content: el.scrollWidth, viewport: el.clientWidth }));
      expect(modelScroll.content).toBeGreaterThan(modelScroll.viewport);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath(`overview-upright-${width}.png`), fullPage: true });
  });
}

// OMN-22168 (Lakshman 2026-11-04, "remove that" on the Expand control; "these 4 into one ... with tab and full size"):
// there is no full-view dialog any more. Each chart is its own full-width tab, so the properties the dialog was there for
// are held on the tab itself: the whole chart is reachable without the page scrolling sideways, the ranked charts keep
// their upright bars, and keyboard focus reaches the tab.
test('a short phone viewport reaches the whole chart without scrolling the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await serveCharts(page, rows);
  await page.goto('/overview');
  await expect(page.locator('.local-chart-expand')).toHaveCount(0);
  await chooseChartTab(page, 'Model usage');
  const model = page.locator('[data-component="overview-model-usage"] .local-model-usage');
  await expect(model).toBeVisible();
  const scroll = await model.evaluate(el => ({ content: el.scrollWidth, viewport: el.clientWidth }));
  expect(scroll.content).toBeGreaterThanOrEqual(scroll.viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

for (const [width, height, theme] of [[1440, 900, 'dark'], [1440, 900, 'light'], [390, 844, 'dark'], [390, 844, 'light']] as const) {
test(`each Overview chart tab draws its whole chart at ${width}px in ${theme} theme`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
  await serveCharts(page, rows);
  await page.goto('/overview');
  await expect(page.locator('.local-chart-expand')).toHaveCount(0);
  const frame = page.locator('.local-overview-charts-panel');
  for (const title of ['Runs per day', 'Tokens per day', 'Model usage', 'Tier mix']) {
    await chooseChartTab(page, title);
    const drawn = frame.locator('.local-dashboard-tabpanel');
    await expect(drawn).toHaveCount(1);
    await expect(drawn.locator('.rb-chart--vertical')).toHaveCount(title === 'Model usage' || title === 'Tier mix' ? 1 : 0);
    if (title === 'Model usage') {
      await expect(drawn.locator('.local-model-usage .rb-chart--vertical [data-ranked-item]')).toHaveCount(7);
      expect(await drawn.locator('.local-model-usage .rb-plot').evaluate(el => getComputedStyle(el).display)).toBe('grid');
    }
    const fit = await drawn.evaluate(el => {
      const box = el.getBoundingClientRect(); const outer = el.closest('.local-overview-charts-panel')!.getBoundingClientRect();
      return { inside: box.left >= outer.left - 1 && box.right <= outer.right + 1, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(fit.inside, `${title} inside its panel`).toBe(true);
    expect(fit.sideways, `${title}: no sideways page scroll`).toBeLessThanOrEqual(0);
    const tab = frame.getByRole('tab', { name: title, exact: true });
    await tab.focus();
    await expect(tab).toBeFocused();
    await page.screenshot({ path: info.outputPath(`overview-tab-${title.replaceAll(' ', '-')}-${width}-${theme}.png`) });
  }
});
}
