import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Part 24: the current page has visible info icons, a seven-model row chart, and no expand controls.
// These browser checks are the red-first proof for those observed failures and their keyboard/viewport risks.
const names = [
  'Qwen3.8-27B', 'gemini-3.5-flash-lite', 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'apodex/apodex-1.1-mini:free', 'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free', 'poolside/laguna-xs-2.1:free',
];
const rows = {
  ...chartRows,
  [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-26T10:00:00Z',
    total_cost_usd: 0.23, total_savings_usd: 4.23, run_count: 657, measured_run_count: 655,
    unknown_run_count: 2, estimated_run_count: 0, tokens_total: 963210 }],
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
      const icon = card.locator('.local-card-info svg');
      await expect(icon, `card ${index + 1} has no visible i`).not.toBeVisible();
      await card.locator('.local-card-info').focus();
      const tip = card.getByRole('tooltip');
      await expect(tip).toBeVisible();
      const bounds = await tip.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
      });
      expect(bounds.left, `card ${index + 1} tooltip left`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `card ${index + 1} tooltip right`).toBeLessThanOrEqual(bounds.width);
      expect(bounds.top, `card ${index + 1} tooltip top`).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom, `card ${index + 1} tooltip bottom`).toBeLessThanOrEqual(bounds.height);
      const overlapsControl = await tip.evaluate(el => {
        const tipBox = el.getBoundingClientRect();
        return [...document.querySelectorAll('.local-chart-expand')].some(control => {
          const controlBox = control.getBoundingClientRect();
          return tipBox.left < controlBox.right && tipBox.right > controlBox.left
            && tipBox.top < controlBox.bottom && tipBox.bottom > controlBox.top;
        });
      });
      expect(overlapsControl, `card ${index + 1} tooltip avoids chart controls`).toBe(false);
    }
    const model = page.locator('.maple-cell--half > [data-component="overview-model-usage"]');
    await expect(model.locator('.rb-chart--vertical [data-ranked-item]')).toHaveCount(7);
    for (const name of names) await expect(model.locator('.rb-name', { hasText: name })).toHaveCount(1);
    const plot = await model.locator('.rb-plot').evaluate(el => ({ display: getComputedStyle(el).display, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(plot.display).toBe('grid');
    if (width === 390) {
      const modelScroll = await model.locator('.local-model-usage').evaluate(el => ({ content: el.scrollWidth, viewport: el.clientWidth }));
      expect(modelScroll.content).toBeGreaterThan(modelScroll.viewport);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath(`overview-upright-${width}.png`), fullPage: true });
  });
}

test('a short phone viewport scrolls the full chart without scrolling the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await serveCharts(page, rows);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Expand Model usage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Model usage full view' });
  const size = await dialog.evaluate(el => ({ content: el.scrollHeight, viewport: el.clientHeight }));
  expect(size.content).toBeGreaterThan(size.viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

for (const [width, height, theme] of [[1440, 900, 'dark'], [1440, 900, 'light'], [390, 844, 'dark'], [390, 844, 'light']] as const) {
test(`each Overview graph opens a scrollable full view at ${width}px in ${theme} theme`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
  await serveCharts(page, rows);
  await page.goto('/overview');
  for (const title of ['Runs per day', 'Tokens per day', 'Model usage', 'Tier mix']) {
    const panel = page.locator('.maple-cell--half > .local-dashboard-panel', { has: page.getByRole('heading', { name: title, exact: true }) });
    const opener = panel.getByRole('button', { name: `Expand ${title}` });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: `${title} full view` });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.rb-chart--vertical')).toHaveCount(title === 'Model usage' || title === 'Tier mix' ? 1 : 0);
    if (title === 'Model usage') {
      await expect(dialog.locator('.local-model-usage .rb-chart--vertical [data-ranked-item]')).toHaveCount(7);
      expect(await dialog.locator('.local-model-usage .rb-plot').evaluate(el => getComputedStyle(el).display)).toBe('grid');
    }
    const content = await dialog.evaluate(el => ({ overflowY: getComputedStyle(el).overflowY, maxHeight: el.getBoundingClientRect().height, viewport: innerHeight }));
    expect(content.overflowY).toMatch(/auto|scroll/);
    expect(content.maxHeight).toBeLessThanOrEqual(content.viewport);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]')))).toBe(true);
    await page.screenshot({ path: info.outputPath(`overview-full-${title.replaceAll(' ', '-')}-${width}-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  }
});
}
