import { expect, test } from 'playwright/test';
import { chartRows, narrowTo, prefix, serveCharts } from './omn21166-chart-fixtures';
// OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the window radios sit in one dropdown; chooseWindow opens it and proves it closed.
import { chooseWindow } from './overview-window-menu';

// OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): the four headline cards read metering-summary.v1's
// all-time row, not the old cost.savings-overview.v1 aggregate this spec was written for. The same real-sized totals
// and the same controls carry over; the aggregate is still served, with other figures, and must never show.
const topic = prefix + 'metering-summary.v1';
const aggregate = prefix + 'cost.savings-overview.v1';
const allRow = { window_kind: 'all', window_start: '', as_of: '2026-10-19T16:00:00Z', baseline_model: 'baseline-a',
  pricing_manifest_version: 'fixture-1', baseline_state: 'resolved', spend_usd: 3.392282, counterfactual_usd: 1011.863195,
  savings_usd: 1008.470913, runs_total: 49148, runs_measured: 44489, runs_unknown_tokens: 4659, runs_unknown_spend: 0,
  tokens_in: 183000000, tokens_out: 692893 };
const legacy = { window: 'all', captured_at: '2026-10-19T16:01:00Z', total_cost_usd: 999, total_savings_usd: 999,
  run_count: 999, measured_run_count: 999, tokens_total: 999 };
const card = (page: import('playwright/test').Page, id: string) => page.locator(`[data-component="${id}"]`);
const figure = (page: import('playwright/test').Page, id: string) => card(page, id).locator('.local-dashboard-metric');
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test('shows the four exact metering totals, never the old aggregate beside them', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [topic]: [allRow], [aggregate]: [legacy] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('$3.39');
  await expect(figure(page, 'overview-savings')).toHaveText('$1,008.47');
  await expect(figure(page, 'overview-measured')).toHaveText('44.48K');
  await expect(figure(page, 'overview-tokens')).toHaveText('183.69M');
  await expect(card(page, 'overview-savings')).toContainText('Modelled');
  await expect(card(page, 'overview-measured')).not.toContainText('All calls');
  await expect(page.locator('.local-overview-summary')).not.toContainText('999');
  for (const width of [1440, 390, 320]) {
    await narrowTo(page, width, 900);
    expect(await page.locator('.local-overview-summary').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('.local-overview-summary').screenshot({ path: info.outputPath(`metering-overview-${width}.png`) });
  }
});

test('retains measured zero rather than treating it as absent', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...allRow, spend_usd: 0, savings_usd: 0, runs_measured: 0, runs_total: 1, runs_unknown_tokens: 0, tokens_in: 0, tokens_out: 0 }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('$0.00');
  await expect(figure(page, 'overview-savings')).toHaveText('$0.00');
  await expect(figure(page, 'overview-measured')).toHaveText('0');
  await expect(figure(page, 'overview-tokens')).toHaveText('0');
});

test('one absent or malformed total does not erase the other cards or borrow another source', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...allRow, spend_usd: null, tokens_out: 'invalid' }], [aggregate]: [legacy] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('Not measured');
  await expect(figure(page, 'overview-tokens')).toHaveText('Not measured');
  await expect(figure(page, 'overview-savings')).toHaveText('$1,008.47');
  await expect(figure(page, 'overview-measured')).toHaveText('44.48K');
});

// Lakshman 2026-10-25: a chosen day with no served row is a day with no runs; it never shows the all-time totals.
test('never presents all-time totals as today', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [allRow] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-measured')).toHaveText('44.48K');
  await chooseWindow(page, 'Today (UTC)');
  for (const id of ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'])
    await expect(figure(page, id)).not.toHaveText(/3\.39|1,008\.47|44\.48K|183\.69M/);
  await expect(figure(page, 'overview-spend')).toHaveText('$0.00');
  await chooseWindow(page, 'All time');
  await expect(figure(page, 'overview-measured')).toHaveText('44.48K');
});

test('a day row cannot impersonate an all-time row', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...allRow, window_kind: 'day', window_start: '2026-10-19' }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-spend')).toHaveText('Not measured: no all-time row');
});

// OMN-20009 C3 (unit test B4 in LocalDashboardPage.omn19980.test.tsx): metering rows never hide a no-runs-yet page, so
// with no run served the page says so once, and no headline invents a figure from the metering row beside it.
test('with no run served the page says no runs yet, and shows no headline figure', async ({ page }, info) => {
  const empty = Object.fromEntries(Object.keys(chartRows).map(name => [name, []]));
  await serveCharts(page, { ...empty, [topic]: [allRow] });
  await page.goto('/overview');
  await expect(page.getByText('No runs yet').first()).toBeVisible();
  await expect(page.locator('.local-overview-summary')).not.toContainText(/3\.39|1,008\.47|44\.48K|183\.69M/);
  await page.screenshot({ path: info.outputPath('no-runs-overview.png'), fullPage: true });
});

// Live Chrome failure: real-sized money/token totals broke across digit groups.
for (const savings_usd of [allRow.savings_usd, -allRow.savings_usd]) test(`narrow ${savings_usd < 0 ? 'negative' : 'positive'} measured totals remain whole on one line without clipping a digit`, async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [topic]: [{ ...allRow, savings_usd }] });
  await page.goto('/overview');
  await expect(figure(page, 'overview-tokens')).toHaveText('183.69M');
  await expect(figure(page, 'overview-savings')).toHaveText(savings_usd < 0 ? '-$1,008.47' : '$1,008.47');
  for (const width of [390, 320]) {
    await narrowTo(page, width, 844);
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
