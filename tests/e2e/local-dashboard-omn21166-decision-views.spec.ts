import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';
import { withRev7, withSevenModels } from './omn21166-redesign-fixtures';

// OMN-21166 part 30, revision 7 (Lakshman 2026-10-27: all four decision views, "create as much as you can and make as much
// info as possible, toggle, tabs etc"; Codex ranking MSGs 2b7dcb95, 20677ef8). Journeys over one fixture (rev7Decisions,
// expected values worked by hand beside it). Failure modes declared before the code:
//   D1  a tabbed panel loses its tab on reload or a shared link, or an unknown tab value shows nothing (AC201);
//   D2  the tabs cannot be moved by keyboard, or more than one panel is drawn (AC201);
//   D3  a decision view drops the sample label, so a sample figure reads as an all-time total (AC202);
//   D4  a matrix cell turns no runs into 0%, or a cell under 5 verdicts carries no small-sample cue (AC203);
//   D5  a matrix cell opens Runs without its model and task filter, or the column and metric toggles change nothing (AC203);
//   D6  a day before the sample is drawn as 0, or a day with runs but no verdicts as 0% (AC204);
//   D7  a day opens nothing, by click or by Enter, or opens Runs without the day (AC204);
//   D8  more than five series and no Other, so small groups vanish or the chart overflows (AC204);
//   D9  a run with no recorded backend reads as a dispatch failure, or a reroute is hidden (AC206);
//   D10 the Routing columns toggle does not add the routing fields to the Runs table (AC206).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const SAMPLE = 'latest 10 served runs, covering Oct 14 to Oct 17';

async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
}

const analysisTabs = (page: Page) => page.getByRole('tablist', { name: 'Usage analysis views', exact: true });
const tab = (scope: Locator, name: string) => scope.getByRole('tab', { name, exact: true });

test('AC201 AC202 Usage analysis tabs keep their place in the address, move by keyboard and keep the sample label', async ({ page }, info) => {
  await serveCharts(page, withRev7);
  await settle(page, '/usage');
  const analysis = page.locator('[data-usage-analysis]');
  const tabs = analysisTabs(page);
  // D3, AC202: four views, each under the sample label.
  await expect(tabs.getByRole('tab')).toHaveText(['Groups', 'Model by task', 'Quality over time', 'Cost versus quality']);
  for (const name of ['Groups', 'Model by task', 'Quality over time', 'Cost versus quality']) {
    await tab(tabs, name).click();
    await expect(tab(tabs, name)).toHaveAttribute('aria-selected', 'true');
    await expect(analysis.getByRole('tabpanel')).toHaveCount(1);
    await expect(analysis).toContainText(SAMPLE);
  }
  // D1: the selected tab is in the address and survives a reload.
  await expect(page).toHaveURL(/[?&]analysis=quality\b/);
  await page.reload();
  await expect(tab(analysisTabs(page), 'Cost versus quality')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-quality-point]').first()).toBeVisible();
  // D1: the first tab is the default and leaves the address; an unknown value falls back to it.
  await settle(page, '/usage?analysis=no-such-view');
  await expect(tab(analysisTabs(page), 'Groups')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('table[data-analysis-table]')).toBeVisible();
  // D2: arrow keys, Home and End move and select; only the selected tab is in the tab order.
  await tab(analysisTabs(page), 'Groups').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(analysisTabs(page), 'Model by task')).toBeFocused();
  await expect(tab(analysisTabs(page), 'Model by task')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(analysisTabs(page), 'Groups')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(tab(analysisTabs(page), 'Cost versus quality')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab(analysisTabs(page), 'Groups')).toHaveAttribute('aria-selected', 'true');
  await expect(page).not.toHaveURL(/analysis=/);
  await page.keyboard.press('ArrowLeft');
  await expect(tab(analysisTabs(page), 'Cost versus quality')).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: info.outputPath('ac201-tabs.png') });
});

test('AC203 Model by task shows each cell with its own denominator, a small-sample cue, no runs as no runs, and links to Runs', async ({ page }, info) => {
  await serveCharts(page, withRev7);
  await settle(page, '/usage?analysis=matrix');
  const matrix = page.locator('table[data-decision-matrix]');
  await expect(matrix).toBeVisible();
  const cell = (row: string, col: string) => matrix.locator(`td[data-row="${row}"][data-col="${col}"]`);
  const columns = () => matrix.locator('thead th[data-col]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-col')));
  await expect.poll(columns).toEqual(['code_generation', 'summarization']);
  await expect(matrix.locator('tbody th[scope="row"]')).toHaveText(['model-a', 'model-b', 'Not recorded']);
  // D4: own denominators; under five verdicts is marked; a cell with no runs says so, never 0%.
  await expect(cell('model-a', 'summarization')).toContainText('83.3%');
  await expect(cell('model-a', 'summarization')).toContainText('5 of 6');
  await expect(cell('model-a', 'summarization')).not.toHaveAttribute('data-small', 'true');
  await expect(cell('model-a', 'code_generation')).toContainText('50.0%');
  await expect(cell('model-a', 'code_generation')).toHaveAttribute('data-small', 'true');
  await expect(cell('model-a', 'code_generation')).toContainText('small sample');
  await expect(cell('model-b', 'summarization')).toContainText('No verdicts');
  await expect(cell('model-b', 'code_generation')).toHaveAttribute('data-state', 'no-runs');
  await expect(cell('model-b', 'code_generation')).toHaveText('no runs');
  await expect(matrix.locator('td[data-state="no-runs"]')).toHaveCount(2);
  for (const empty of await matrix.locator('td[data-state="no-runs"]').all()) await expect(empty).not.toContainText('%');
  // A measured 0 of 1 is a real 0.0% (control: the guard above is about empty cells, not zero values).
  await expect(cell('Not recorded', 'summarization')).toContainText('0 of 1');
  // D5: the metric toggle changes the figure in each cell.
  await page.getByRole('radiogroup', { name: 'Matrix metric', exact: true }).getByRole('radio', { name: 'Runs', exact: true }).check();
  await expect(cell('model-a', 'summarization')).toContainText('6');
  await page.getByRole('radiogroup', { name: 'Matrix metric', exact: true }).getByRole('radio', { name: 'p95 latency', exact: true }).check();
  await expect(cell('model-a', 'summarization')).toContainText('900 ms');
  await page.getByRole('radiogroup', { name: 'Matrix metric', exact: true }).getByRole('radio', { name: 'Cost per measured run', exact: true }).check();
  await expect(cell('model-a', 'summarization')).toContainText('$0.00');
  await expect(cell('Not recorded', 'summarization')).toContainText('Not measured');
  // D5: the columns toggle switches tasks to tiers; a run with no tier falls in Not recorded.
  await page.getByRole('radiogroup', { name: 'Matrix columns', exact: true }).getByRole('radio', { name: 'Tier', exact: true }).check();
  await expect.poll(columns).toEqual(['local', 'Not recorded']);
  await page.screenshot({ path: info.outputPath('ac203-matrix-tier.png') });
  // D5: a cell opens Runs filtered to its model and task, and the filter holds.
  await page.getByRole('radiogroup', { name: 'Matrix columns', exact: true }).getByRole('radio', { name: 'Task type', exact: true }).check();
  await cell('model-a', 'code_generation').getByRole('link').click();
  await expect(page).toHaveURL(/\/runs\?/);
  await expect(page).toHaveURL(/model=model-a/);
  await expect(page).toHaveURL(/task=code_generation/);
  await expect(page.locator('[data-component="recent-runs"] [data-runs-totals] [data-total="runs"]')).toHaveText('2 runs');
});

test('AC204 Quality over time draws covered days only, says no verdicts, and each day opens its runs', async ({ page }, info) => {
  await serveCharts(page, withRev7);
  await settle(page, '/usage?analysis=trend');
  const trend = page.locator('[data-quality-trend]');
  await expect(trend).toBeVisible();
  const all = trend.locator('[data-series="All runs"]');
  const day = (date: string) => all.locator(`[data-day="${date}"]`);
  await expect(all.locator('[data-day]')).toHaveCount(14);
  // D6: days before the sample are not covered, never 0; a day with runs and no verdicts says so.
  await expect(all.locator('[data-day][data-state="not-covered"]')).toHaveCount(10);
  await expect(day('2026-10-13')).toHaveAttribute('data-state', 'not-covered');
  await expect(day('2026-10-14')).toHaveAttribute('data-state', 'no-verdicts');
  await expect(day('2026-10-15')).toHaveAttribute('aria-label', 'Oct 15: 33.3% passed (1 of 3), 3 runs');
  await expect(day('2026-10-16')).toHaveAttribute('aria-label', 'Oct 16: 100.0% passed (3 of 3), 3 runs');
  await expect(day('2026-10-17')).toHaveAttribute('aria-label', 'Oct 17: 66.7% passed (2 of 3), 3 runs');
  // The latency toggle draws p95 per day from recorded latencies.
  await page.getByRole('radiogroup', { name: 'Trend metric', exact: true }).getByRole('radio', { name: 'p95 latency', exact: true }).check();
  await expect(day('2026-10-15')).toHaveAttribute('aria-label', 'Oct 15: p95 900 ms, 3 runs');
  // By model: one row per model, in order of runs.
  await page.getByRole('radiogroup', { name: 'Trend series', exact: true }).getByRole('radio', { name: 'By model', exact: true }).check();
  await expect(trend.locator('[data-series]')).toHaveCount(3);
  await expect(trend.locator('[data-series]').first()).toHaveAttribute('data-series', 'model-a');
  await page.screenshot({ path: info.outputPath('ac204-trend-by-model.png') });
  // D7: Enter on a day opens Runs for that day (and that model).
  await page.getByRole('radiogroup', { name: 'Trend series', exact: true }).getByRole('radio', { name: 'All runs', exact: true }).check();
  await day('2026-10-16').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/runs\?day=2026-10-16/);
  await expect(page.locator('[data-component="recent-runs"] [data-runs-totals] [data-total="runs"]')).toHaveText('3 runs');
});

test('AC204 more than five series keeps the five largest by runs, Not recorded included, and an Other day opens that day', async ({ page }) => {
  await serveCharts(page, withSevenModels);
  await settle(page, '/usage?analysis=trend');
  await page.getByRole('radiogroup', { name: 'Trend series', exact: true }).getByRole('radio', { name: 'By model', exact: true }).check();
  const series = page.locator('[data-quality-trend] [data-series]');
  // D8: ranked by runs, so the three unrecorded-model runs are a named row, not folded into Other.
  await expect.poll(() => series.evaluateAll(rows => rows.map(row => row.getAttribute('data-series'))))
    .toEqual(['Not recorded', 'm1', 'm2', 'm3', 'm4', 'Other']);
  const other = series.last().locator('[data-day="2026-10-17"]');
  await expect(other).toHaveAttribute('aria-label', 'Oct 17: 100.0% passed (3 of 3), 3 runs');
  // A measured 0% is a failure mark (Not recorded passed 0 of 3).
  await expect(series.first().locator('[data-day="2026-10-17"] .usage-trend-bar')).toHaveAttribute('data-zero', 'true');
  // D7: an Other day opens Runs for that day (all of that day's runs, as its title says).
  await expect(other).toHaveAttribute('title', /Opens all runs of that day/);
  await other.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/runs\?day=2026-10-17$/);
  await expect(page.locator('[data-component="recent-runs"] [data-runs-totals] [data-total="runs"]')).toHaveText('10 runs');
});

test('AC206 Runs routing view groups requested to routed model with Not recorded stated as not recorded, and the table gains routing columns', async ({ page }, info) => {
  await serveCharts(page, withRev7);
  await settle(page, '/runs?analysis=routing');
  // D1: the Routing tab in the address opens More analysis on it.
  const more = page.locator('details.local-more--page');
  await expect(more).toHaveAttribute('open', '');
  const routing = page.locator('table[data-routing-table]');
  await expect(routing).toBeVisible();
  const route = (requested: string, routed: string) => routing.locator(`tbody tr[data-requested="${requested}"][data-routed="${routed}"]`);
  await expect(routing.locator('tbody tr')).toHaveCount(4);
  await expect(route('model-a', 'model-a').locator('[data-cell="runs"]')).toHaveText('7');
  await expect(route('model-a', 'model-a').locator('[data-cell="pass"]')).toHaveText('85.7% (6 of 7)');
  // D9: a reroute is named; the output-limit stop and the escalations are in its row.
  await expect(route('model-big', 'model-a')).toContainText('Rerouted');
  await expect(route('model-big', 'model-a').locator('[data-cell="finish"]')).toHaveText('length');
  await expect(route('model-big', 'model-a').locator('[data-cell="escalations"]')).toHaveText('2');
  await expect(route('model-b', 'model-b').locator('[data-cell="pass"]')).toHaveText('No verdicts');
  // D9: an unrecorded backend is not recorded, not a failure.
  await expect(route('Not recorded', 'Not recorded').locator('[data-cell="backend"]')).toHaveText('Not recorded');
  await expect(page.locator('[data-routing-note]')).toContainText('not a dispatch failure');
  await expect(routing).not.toContainText(/dispatch failed|failed to dispatch/i);
  await page.screenshot({ path: info.outputPath('ac206-routing.png') });
  // D10: the Routing columns toggle adds requested model, finish reason and escalations beside model, backend and tier.
  const table = page.locator('[data-component="recent-runs"] table').first();
  await expect(table.locator('thead')).not.toContainText('Requested model');
  await page.getByRole('checkbox', { name: 'Routing columns', exact: true }).check();
  for (const header of ['Requested model', 'Finish reason', 'Escalations', 'Backend', 'Route tier']) await expect(table.locator('thead')).toContainText(header);
  const rerouted = table.locator('tbody tr').filter({ hasText: 'model-big' });
  await expect(rerouted).toHaveCount(1);
  await expect(rerouted).toContainText('length');
  writeFileSync(info.outputPath('ac206-routing.json'), JSON.stringify({
    rows: await routing.locator('tbody tr').evaluateAll(rows => rows.map(row => row.textContent)),
  }, null, 2));
});
