import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 21 (Lakshman 2026-10-26: "overview page is very bad why?"): a grid of shorter charts and plain cards.
// Failure modes declared before code:
//   L1  the four charts stay stacked full width, or a pair does not share a top edge or a width (AC139);
//   L2  under 1100px a chart stays half width, or the page scrolls sideways at 390px (AC139);
//   L3  a chart panel or its plot stays tall (AC140);
//   L4  a headline card keeps a tinted fill, or loses its 3px identity edge, in either theme (AC141);
//   L5  the line under Runs per day shows when every run is drawn, is missing when the 500-row read limit or an undated
//       run cuts runs off, or says "served" (AC142);
//   L6  a day's bars span less than 60% of their day's slot (AC143).
test.use({ reducedMotion: 'reduce', trace: 'on' });

const TITLES = ['Runs per day', 'Tokens per day', 'Model usage', 'Tier mix'];
const decision = chartRows[prefix + 'delegation.decisions.v1'][0] as Record<string, unknown>;
/** 500 dated runs over 14 days: the read returned as many rows as its limit. */
const fullRead = Array.from({ length: 500 }, (_, index) => {
  const at = `2026-10-${String(13 + (index % 14)).padStart(2, '0')}T0${index % 10}:00:00Z`;
  return { ...decision, correlation_id: `full-read-${index}`, created_at: at, written_at: at, quality_gate_passed: index % 5 !== 0 };
});
const undatedRow = { ...decision, correlation_id: 'undated-run', created_at: null, written_at: null };

function chartPanels(page: Page) {
  return page.locator('.maple-cell--half > .local-dashboard-panel');
}

async function boxes(page: Page) {
  return chartPanels(page).evaluateAll(panels => panels.map(panel => {
    const box = panel.getBoundingClientRect();
    return { title: panel.querySelector('h2')?.textContent?.trim() ?? '', top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
  }));
}

/** For each day of a grouped chart, the share of the day's slot its bar columns span. */
function daySpans(page: Page, title: string) {
  return chartPanels(page).filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('.gdb-day').evaluateAll(days => days.map(day => {
    const slot = day.getBoundingClientRect();
    const cols = [...day.querySelectorAll('.gdb-col')].map(col => col.getBoundingClientRect());
    if (cols.length === 0) return 0;
    return (Math.max(...cols.map(col => col.right)) - Math.min(...cols.map(col => col.left))) / slot.width;
  }));
}

test('AC139 AC140 AC143: the four Overview charts sit two to a row, short, with bars that fill their days', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page);
  await page.goto('/overview');
  await expect(chartPanels(page)).toHaveCount(4);
  const placed = await boxes(page);
  expect(placed.map(box => box.title)).toEqual(TITLES);
  for (const [a, b] of [[0, 1], [2, 3]]) {
    expect(placed[a]!.top, `${TITLES[a]} and ${TITLES[b]} share a row`).toBe(placed[b]!.top);
    expect(Math.abs(placed[a]!.width - placed[b]!.width), 'equal widths').toBeLessThanOrEqual(1);
    expect(placed[b]!.left).toBeGreaterThan(placed[a]!.left);
  }
  expect(placed[2]!.top).toBeGreaterThan(placed[0]!.top);
  for (const box of placed) expect(box.height, `${box.title} panel height`).toBeLessThanOrEqual(340);
  const plots = await chartPanels(page).locator('.ins-bars.gdb-plot, .rb-chart--vertical .rb-track').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  expect(plots.length).toBeGreaterThanOrEqual(4);
  for (const height of plots) expect(height, 'plot height').toBeLessThanOrEqual(200);
  for (const title of ['Runs per day', 'Tokens per day']) {
    const spans = await daySpans(page, title);
    expect(spans.length, `${title} draws its days`).toBeGreaterThan(0);
    expect(Math.min(...spans), `${title}: each day's bars span at least 60% of the slot`).toBeGreaterThanOrEqual(0.6);
  }
  // Positive control: squeezing the bar group must be caught by the same measure.
  await page.addStyleTag({ content: '.local-dashboard-page--overview .gdb-group { padding: 0 30% !important; }' });
  expect(Math.min(...await daySpans(page, 'Runs per day')), 'control: narrow bars are caught').toBeLessThan(0.6);
  await page.reload();
  await expect(chartPanels(page)).toHaveCount(4);
  // Values stay behind hover and focus, and focus shows them (onex review run 30fe3cac: check both halves). On Overview
  // the numbers show in the readout on the legend row, not above each bar (a 30-day bar is too narrow for them).
  const readout = page.getByTestId('runs-per-day-readout');
  await expect(page.locator('.local-dashboard-page--overview .gdb-val:visible')).toHaveCount(0);
  await expect(readout).toHaveText('');
  const lastDay = chartPanels(page).first().locator('.gdb-day').last();
  await lastDay.focus();
  await expect(readout).toContainText(/runs/);
  await lastDay.blur();
  // Focus leaving the chart clears the readout and the dimming (part 21 AC143: values only on hover or focus).
  await expect(readout).toHaveText('');
  await expect(chartPanels(page).first().locator('.gdb-day[data-dim="true"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-1440.png'), fullPage: true });
  writeFileSync(info.outputPath('overview-layout.json'), JSON.stringify({ placed, plots }, null, 2));
});

test('AC143 AC139: thirty days of runs in a half-width chart keep wide bars and labels inside the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const month = Array.from({ length: 300 }, (_, index) => {
    const at = new Date(Date.UTC(2026, 9, 26) - (index % 30) * 86_400_000 + 3_600_000).toISOString();
    return { ...decision, correlation_id: `month-${index}`, created_at: at, written_at: at, tokens_input: 123_456 + index, tokens_output: 65_432 };
  });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: month });
  await page.goto('/overview');
  await expect(chartPanels(page).first().locator('.gdb-day')).toHaveCount(30);
  for (const title of ['Runs per day', 'Tokens per day']) {
    expect(Math.min(...await daySpans(page, title)), `${title}: bars span at least 60% of a day`).toBeGreaterThanOrEqual(0.6);
  }
  const overflow = await chartPanels(page).evaluateAll(panels => panels.map(panel => panel.scrollWidth - panel.clientWidth));
  expect(overflow, 'nothing passes a panel edge').toEqual([0, 0, 0, 0]);
});

test('AC139: under 1100px each chart takes the full width, and 390px never scrolls sideways', async ({ page }, info) => {
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await serveCharts(page);
    await page.goto('/overview');
    await expect(chartPanels(page)).toHaveCount(4);
    const placed = await boxes(page);
    for (let index = 1; index < placed.length; index++) expect(placed[index]!.top, `${width}px: one chart per row`).toBeGreaterThan(placed[index - 1]!.top);
    expect(new Set(placed.map(box => box.width)).size, `${width}px: equal full widths`).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px: no sideways scroll`).toBe(true);
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`AC141: headline cards use the plain card surface and keep their 3px edge in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    // Usage draws its headline cards from the metering "all" row, which the shared fixture leaves out.
    const metering = chartRows[prefix + 'metering-summary.v1'] as Record<string, unknown>[];
    await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [...metering,
      { ...metering[0], window_kind: 'all', window_start: '', spend_usd: '0.010000', counterfactual_usd: '0.090000', savings_usd: '0.040000', runs_total: 3, tokens_in: 252, tokens_out: 72 }] });
    for (const path of ['/overview', '/runs', '/usage', '/delegation-evidence']) {
      await page.goto(path);
      const headline = page.locator('.local-overview-summary > .local-dashboard-panel');
      await expect(headline.first()).toBeVisible();
      const plain = await page.locator('main .local-dashboard-panel:not(.local-overview-summary > .local-dashboard-panel), main.ev-root .panel').first()
        .evaluate(el => getComputedStyle(el).backgroundColor);
      // The 3px edge is the card's top border (the cards spec reads the same property).
      const cards = await headline.evaluateAll(els => els.map(el => ({ fill: getComputedStyle(el).backgroundColor,
        edge: getComputedStyle(el).borderTopWidth, edgeColor: getComputedStyle(el).borderTopColor })));
      for (const card of cards) {
        expect(card.fill, `${path}: no tinted fill`).toBe(plain);
        expect(card.edge, `${path}: the 3px identity edge`).toBe('3px');
      }
      expect(new Set(cards.map(card => card.edgeColor)).size, `${path}: each card's edge has its own colour`).toBe(cards.length);
      if (path === '/overview') await page.screenshot({ path: info.outputPath(`overview-cards-${theme}.png`) });
    }
  });
}

test('AC142: the line under Runs per day appears only when the chart does not draw every run', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const runsPanel = () => chartPanels(page).filter({ has: page.getByRole('heading', { name: 'Runs per day', exact: true }) });
  // Three dated runs: every run is drawn, so no line.
  await serveCharts(page);
  await page.goto('/overview');
  await expect(runsPanel().locator('.gdb-day').first()).toBeVisible();
  await expect(runsPanel().getByTestId('insights-total')).toHaveCount(0);
  await expect(runsPanel()).not.toContainText(/served/i);
  // The read returned its limit: older runs may be left out.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: fullRead });
  await page.goto('/overview');
  await expect(runsPanel().getByTestId('insights-total')).toHaveText('Showing the latest 500 runs');
  // One run with no date is not drawn, and says so.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: [...chartRows[prefix + 'delegation.decisions.v1'], undatedRow] });
  await page.goto('/overview');
  await expect(runsPanel().getByTestId('insights-total')).toHaveText('1 run has no date and is not drawn');
  await expect(runsPanel()).not.toContainText(/served/i);
});
