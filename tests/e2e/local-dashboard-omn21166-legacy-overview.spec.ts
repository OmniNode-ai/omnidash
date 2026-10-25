import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

const topic = prefix + 'cost.savings-overview.v1';
const legacy = { window: 'all', captured_at: '2026-10-19T16:00:00Z', total_cost_usd: 3.392282,
  total_savings_usd: 1008.470913, run_count: 49148, measured_run_count: 44489, tokens_total: 183692893,
  unknown_run_count: 4659, estimated_run_count: 0 };
const card = (page: import('playwright/test').Page, id: string) => page.locator(`[data-component="${id}"]`);
const figure = (page: import('playwright/test').Page, id: string) => card(page, id).locator('.local-dashboard-metric');
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test('restores four exact legacy totals instead of unrelated metering values', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [topic]: [legacy], [prefix + 'metering-summary.v1']: [{
    window_kind: 'all', as_of: '2026-10-19T16:01:00Z', spend_usd: 999, savings_usd: 999, runs_measured: 999, tokens_in: 999, tokens_out: 999,
  }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('$3.39');
  await expect(figure(page, 'overview-savings')).toHaveText('$1,008.47');
  await expect(figure(page, 'overview-measured')).toHaveText('49.14K');
  await expect(figure(page, 'overview-tokens')).toHaveText('183.69M');
  await expect(card(page, 'overview-savings')).toContainText('Modelled');
  // OMN-21166 AC37: every call (49,148 = 44,489 measured + 4,659 unknown) with the served classes beside it; part 9
  // AC45 drops the All calls caption, since the window switch names the window.
  await expect(card(page, 'overview-measured')).not.toContainText('All calls');
  await expect(card(page, 'overview-measured')).toContainText('44.48K measured');
  await expect(card(page, 'overview-measured')).toContainText('4.65K unknown');
  await expect(page.locator('.local-overview-summary')).not.toContainText('999');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (width < 768 && await collapse.isVisible()) await collapse.click();
    expect(await page.locator('.local-overview-summary').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('.local-overview-summary').screenshot({ path: info.outputPath(`legacy-overview-${width}.png`) });
  }
});

test('retains measured zero rather than treating it as absent', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...legacy, total_cost_usd: 0, total_savings_usd: 0, run_count: 0, measured_run_count: 0, unknown_run_count: 0, tokens_total: 0 }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('$0.00');
  await expect(figure(page, 'overview-savings')).toHaveText('$0.00');
  await expect(figure(page, 'overview-measured')).toHaveText('0');
  await expect(figure(page, 'overview-tokens')).toHaveText('0');
});

test('one absent or malformed total does not erase the other cards or borrow another source', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...legacy, total_cost_usd: null, tokens_total: 'invalid' }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('Not measured');
  await expect(figure(page, 'overview-tokens')).toHaveText('Not measured');
  await expect(figure(page, 'overview-savings')).toHaveText('$1,008.47');
  await expect(figure(page, 'overview-measured')).toHaveText('49.14K');
});

test('never presents all-time legacy totals as today', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [legacy] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-measured')).toHaveText('49.14K');
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  for (const id of ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'])
    await expect(figure(page, id)).toHaveText('Not measured: daily totals unavailable (UTC)');
  await page.getByRole('radio', { name: 'All time', exact: true }).click();
  await expect(figure(page, 'overview-measured')).toHaveText('49.14K');
});

test('a day row cannot impersonate an all-time row', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...legacy, window: 'day' }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('Not measured: overview totals unavailable');
});

// Review control: empty decisions must not hide a served legacy overview row.
test('served legacy totals remain visible when every other exposure is empty', async ({ page }, info) => {
  const empty = Object.fromEntries(Object.keys(chartRows).map(name => [name, []]));
  await serveCharts(page, { ...empty, [topic]: [legacy] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('$3.39');
  await expect(figure(page, 'overview-savings')).toHaveText('$1,008.47');
  await expect(figure(page, 'overview-measured')).toHaveText('49.14K');
  await expect(figure(page, 'overview-tokens')).toHaveText('183.69M');
  await expect(page.locator('.local-dashboard-empty-state')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('legacy-only-overview.png'), fullPage: true });
});

// Live Chrome failure: real-sized money/token totals broke across digit groups.
for (const total_savings_usd of [legacy.total_savings_usd, -legacy.total_savings_usd]) test(`narrow ${total_savings_usd < 0 ? 'negative' : 'positive'} measured totals remain whole on one line without clipping a digit`, async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...legacy, total_savings_usd }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-tokens')).toHaveText('183.69M');
  await expect(figure(page, 'overview-savings')).toHaveText(total_savings_usd < 0 ? '-$1,008.47' : '$1,008.47');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    const geometry = await page.locator('.local-overview-summary .local-dashboard-metric[data-measured="true"]').evaluateAll(nodes => nodes.map(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return { text: el.textContent, lines: range.getClientRects().length, overflow: el.scrollWidth-el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize) };
    }));
    // OMN-21166 live review 2026-10-25: the fifth headline card (Delegation Quality, 75.0% on this fixture) is measured too.
    expect(geometry).toHaveLength(5);
    await info.attach(`totals-${width}`, { body: JSON.stringify(geometry), contentType: 'application/json' });
    expect(geometry.map(metric => metric.lines), geometry.map(metric => metric.text).join(' / ')).toEqual([1, 1, 1, 1, 1]);
    for (const metric of geometry) { expect(metric.overflow, metric.text!).toBeLessThanOrEqual(1); expect(metric.font).toBeGreaterThanOrEqual(18); }
    await page.screenshot({ path: info.outputPath(`whole-totals-${width}.png`), fullPage: true });
  }
});
