import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseChartTab } from './chart-tabs';

// OMN-21166 part 21 (Lakshman 2026-10-26: "overview page is very bad why?"): a grid of shorter charts and plain cards.
// Failure modes declared before code:
//   L1  the four charts stay stacked full width, or a pair does not share a top edge or a width (AC139);
//   L2  under 1100px a chart stays half width, or the page scrolls sideways at 390px (AC139);
//   L3  a chart panel or its plot stays tall (AC140);
//   L4  a headline card keeps a tinted fill or a coloured edge, in either theme (AC141, edge superseded by AC167);
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

// OMN-22168 (Lakshman 2026-11-04, "these 4 into one ... with tab and full size big one"): the four charts are one row of
// tabs and one chart is drawn at a time, so every check below runs on each chart's tab in turn.
function chartPanels(page: Page) {
  return page.locator('.local-overview-charts-panel .local-dashboard-tabpanel');
}

/** Each chart's tab chosen in turn: its title, the box it is drawn in, and the height of its plot. */
async function boxes(page: Page) {
  const placed = [];
  for (const title of TITLES) {
    await chooseChartTab(page, title);
    const box = await chartPanels(page).evaluate(panel => {
      const r = panel.getBoundingClientRect();
      const frame = panel.closest('.local-overview-charts-panel')!.getBoundingClientRect();
      const plot = panel.querySelector('.ins-bars.gdb-plot, .rb-chart--vertical .rb-track');
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), frameLeft: Math.round(frame.left),
        frameRight: Math.round(frame.right), right: Math.round(r.right), plot: plot ? Math.round(plot.getBoundingClientRect().height) : 0 };
    });
    placed.push({ title, ...box });
  }
  await chooseChartTab(page, TITLES[0]!);
  return placed;
}

/** For each day of a grouped chart, the share of the day's slot its bar columns span. */
async function daySpans(page: Page, title: string) {
  await chooseChartTab(page, title);
  return chartPanels(page).locator('.gdb-day').evaluateAll(days => days.map(day => {
    const slot = day.getBoundingClientRect();
    const cols = [...day.querySelectorAll('.gdb-col')].map(col => col.getBoundingClientRect());
    if (cols.length === 0) return 0;
    return (Math.max(...cols.map(col => col.right)) - Math.min(...cols.map(col => col.left))) / slot.width;
  }));
}

// AC139/AC140 laid the four charts two to a row with 200px plots; OMN-22168 makes them four tabs of one full-width panel
// ("full size big one"), every plot one height. The bars-fill-their-days rule (AC143) and its control are unchanged.
test('AC139 AC140 AC143: the four Overview charts are full-width tabs of one height, with bars that fill their days', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page);
  await page.goto('/overview');
  await expect(page.locator('.local-overview-charts-panel').getByRole('tab')).toHaveCount(4);
  const placed = await boxes(page);
  expect(placed.map(box => box.title)).toEqual(TITLES);
  for (const box of placed) {
    expect(Math.abs(box.top - placed[0]!.top), `${box.title} drawn in the same place`).toBeLessThanOrEqual(1);
    expect(box.left - box.frameLeft, `${box.title} starts inside its panel`).toBeGreaterThanOrEqual(0);
    expect(box.frameRight - box.right, `${box.title} ends inside its panel`).toBeGreaterThanOrEqual(0);
    expect(box.width, `${box.title} takes the panel's width`).toBe(placed[0]!.width);
    expect(box.plot, `${box.title} draws a plot`).toBeGreaterThan(0);
  }
  const plots = placed.map(box => box.plot);
  expect(new Set(plots).size, 'every chart plot is one height').toBe(1);
  for (const title of ['Runs per day', 'Tokens per day']) {
    const spans = await daySpans(page, title);
    expect(spans.length, `${title} draws its days`).toBeGreaterThan(0);
    expect(Math.min(...spans), `${title}: each day's bars span at least 60% of the slot`).toBeGreaterThanOrEqual(0.6);
  }
  // Positive control: squeezing the bar group must be caught by the same measure.
  await page.addStyleTag({ content: '.local-dashboard-page--overview .gdb-group { padding: 0 30% !important; }' });
  expect(Math.min(...await daySpans(page, 'Runs per day')), 'control: narrow bars are caught').toBeLessThan(0.6);
  await page.reload();
  await expect(page.locator('.local-overview-charts-panel').getByRole('tab')).toHaveCount(4);
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

test('AC143 AC139: thirty days of runs keep wide bars and labels inside the panel on every chart tab', async ({ page }) => {
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
  const overflow = [];
  for (const title of TITLES) {
    await chooseChartTab(page, title);
    overflow.push(await chartPanels(page).evaluate(panel => panel.scrollWidth - panel.clientWidth));
  }
  expect(overflow, 'nothing passes a panel edge').toEqual([0, 0, 0, 0]);
});

test('AC139: under 1100px each chart takes the full width, and 390px never scrolls sideways', async ({ page }, info) => {
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await serveCharts(page);
    await page.goto('/overview');
    await expect(page.locator('.local-overview-charts-panel').getByRole('tab')).toHaveCount(4);
    const placed = await boxes(page);
    expect(new Set(placed.map(box => box.width)).size, `${width}px: equal full widths`).toBe(1);
    for (const box of placed) expect(box.frameRight - box.right, `${width}px: ${box.title} inside its panel`).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px: no sideways scroll`).toBe(true);
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
  }
});

for (const theme of ['light', 'dark'] as const) {
  // OMN-22168 (Lakshman 2026-11-05, "make each cards different color and distinct") supersedes AC141's plain surface and
  // AC167's one neutral edge colour for the headline cards: each wears its own accent wash and edge; the 1px edge stays.
  test(`headline cards each wear their own accent, on a 1px edge, in ${theme}`, async ({ page }, info) => {
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
      // The edge is the card's top border (the cards spec reads the same property).
      const cards = await headline.evaluateAll(els => els.map(el => ({ wash: getComputedStyle(el).backgroundImage,
        edge: getComputedStyle(el).borderTopWidth, edgeColor: getComputedStyle(el).borderTopColor,
        accent: getComputedStyle(el).getPropertyValue('--panel-accent').trim() })));
      for (const card of cards) {
        expect(card.wash, `${path}: the card wears its accent wash`).toContain('gradient');
        expect(card.edge, `${path}: the 1px edge`).toBe('1px');
        expect(card.accent, `${path}: the card names its accent`).not.toBe('');
      }
      expect(new Set(cards.map(card => card.edgeColor)).size, `${path}: no two headline cards share an edge colour`).toBe(cards.length);
      if (path === '/overview') await page.screenshot({ path: info.outputPath(`overview-cards-${theme}.png`) });
    }
  });
}

test('AC142: the line under Runs per day appears only when the chart does not draw every run', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // OMN-22168: Runs per day is the tab Overview opens on; its chart is found by its component.
  const runsPanel = () => page.locator('[data-component="overview-insights"][data-slice="runs"]');
  // Three dated runs: every run is drawn, so no line.
  await serveCharts(page);
  await page.goto('/overview');
  await expect(runsPanel().locator('.gdb-day').first()).toBeVisible();
  await expect(runsPanel().getByTestId('insights-total')).toHaveCount(0);
  await expect(runsPanel()).not.toContainText(/served/i);
  // OMN-21970 AC3 (committed 801bf845) replaced "Showing the latest 500 runs": the page walks every page of runs, so a
  // complete read of 500 runs has no line (the walk that cannot finish is covered by the E5 case in overview-edges).
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: fullRead });
  await page.goto('/overview');
  await expect(runsPanel().locator('.gdb-day').first()).toBeVisible();
  await expect(runsPanel().getByTestId('insights-total')).toHaveCount(0);
  // One run with no date is not drawn, and says so.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: [...chartRows[prefix + 'delegation.decisions.v1'], undatedRow] });
  await page.goto('/overview');
  await expect(runsPanel().getByTestId('insights-total')).toHaveText('1 run has no date and is not drawn');
  await expect(runsPanel()).not.toContainText(/served/i);
});
