import { revealRunFields } from './omn21166-chart-fixtures';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page, type Locator } from 'playwright/test';

// OMN-21015 AC4, series half: on the Usage page the drawn width of each model's segment is its served token count's
// share of the bar. jsdom lays nothing out, so this is measured in a real browser. The rows are constructed: one day,
// two models, with counts chosen so a label, padding or border on a segment would move the ratio far from the counts'
// (1 against 1,000 tokens in; 300 against 1,200 tokens out).
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';

const usage = [
  { usage_day: '2026-10-12', model_id: 'gemini-3.5-flash-lite', call_count: 1, input_tokens: 1, output_tokens: 300 },
  { usage_day: '2026-10-12', model_id: 'qwen3-coder', call_count: 4, input_tokens: 1000, output_tokens: 1200 },
];

async function serve(page: Page, served: Record<string, unknown[]> = { [USAGE]: usage }) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: Object.keys(served).map((topic) => ({ topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = served[topic];
    await route.fulfill(rows !== undefined
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }) }
      : { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) });
  });
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** The drawn widths, in pixels, of the bar that belongs to the list with this accessible name. */
async function drawnWidths(page: Page, name: string): Promise<number[]> {
  const list = page.getByRole('list', { name });
  await expect(list).toBeVisible();
  return list.evaluate((element) => {
    const bar = element.previousElementSibling;
    if (bar === null || !bar.classList.contains('usage-tokens-bar')) throw new Error('no drawn bar before the list');
    return [...bar.children].map((child) => child.getBoundingClientRect().width);
  });
}

test('OMN-21015: on Usage a segment is as wide as its share of the served tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page);
  await page.goto('/usage');
  // OMN-21166 Maple grid: the per-day, per-model token bars (the series this test measures) are the detail under the
  // page's closed "More usage"; the page itself shows the stacked "Tokens per day" chart.
  await page.locator('summary').filter({ hasText: /^More usage$/ }).click();

  const tokensIn = await drawnWidths(page, 'Tokens in on 2026-10-12, by model');
  const tokensOut = await drawnWidths(page, 'Tokens out on 2026-10-12, by model');
  expect(tokensIn).toHaveLength(2);
  expect(tokensOut).toHaveLength(2);
  // A bar wide enough that the comparison means something. OMN-21166: bars share one scale, so the day's tokens out
  // (1,500) is the widest bar and tokens in (1,001) is drawn against it.
  expect(tokensOut[1]!).toBeGreaterThan(300);
  expect(tokensIn[1]!).toBeGreaterThan(200);
  const drawn = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0);
  expect(drawn(tokensIn) / drawn(tokensOut)).toBeCloseTo(1001 / 1500, 1);
  // 1 : 1,000 and 300 : 1,200, as served. The tolerance is far below what any label or padding would add.
  expect(tokensIn[0]! / tokensIn[1]!).toBeCloseTo(1 / 1000, 3);
  expect(tokensOut[0]! / tokensOut[1]!).toBeCloseTo(300 / 1200, 3);

  // Every figure is still written out beside the bar, the small one included.
  const written = page.getByRole('list', { name: 'Tokens in on 2026-10-12, by model' }).getByRole('listitem');
  await expect(written).toHaveText(['gemini-3.5-flash-lite: 1', 'qwen3-coder: 1,000']);

  await page.getByRole('heading', { name: 'Tokens per day by model, in detail' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-usage-tokens-1440x900.png'), fullPage: false });
});

// OMN-21015 stage 5, U2: on Overview a tier's mark covers its served share. OMN-21166 AC64 / Maple grid: the donut is
// replaced by ranked bars (figure "Runs by tier"), so the drawing is measured as bar lengths: the largest share is the
// full track and every other bar is its served share against it. One share is constructed at the extreme (1 run in
// 10,000) because that is where anything added to a bar shows, and the figure beside it must not read as none.
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const routing = [{
  captured_at: '2026-10-13T10:00:00+00:00',
  by_tier: {
    tiers: [
      { cost_tier_name: 'claude', count: 1, tier_routed: true, pct_of_tier_routed: 0.0001 },
      { cost_tier_name: 'cheap_cloud', count: 2499, tier_routed: true, pct_of_tier_routed: 0.2499 },
      { cost_tier_name: 'local', count: 7500, tier_routed: true, pct_of_tier_routed: 0.75 },
    ],
  },
}];

test('OMN-21015: on Overview a tier slice covers its served share of the ring', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [ROUTING]: routing });
  await page.goto('/');

  // OMN-21166 AC64: ranked bars, not a ring.
  const chart = page.getByRole('figure', { name: 'Runs by tier', exact: true });
  await expect(chart).toBeVisible();
  await expect(page.locator('svg.local-donut')).toHaveCount(0);
  // The bars lie along the track when the panel is narrow (the 4-column cell) and stand on it when it is wide; the
  // drawn length is read along whichever axis the bar grows.
  // OMN-21166 live review 2026-10-25: Overview's tier mix is a vertical RankedBars chart (rb-chart--vertical): its bars
  // always stand on the track (the bar is 72% of the column wide), so the share is read along the height, never the width.
  const vertical = await chart.evaluate((element) => element.classList.contains('rb-chart--vertical'));
  const drawn = await chart.locator('.rb-plot > li').evaluateAll((items, vertical) => items.map((item) => {
    const track = item.querySelector('.rb-track')!.getBoundingClientRect();
    const bar = item.querySelector('.rb-bar')!.getBoundingClientRect();
    const along = vertical || track.width <= track.height ? 'height' : 'width';
    return { key: item.getAttribute('data-ranked-item'), length: bar[along], track: track[along], along };
  }), vertical);
  // Ranked by served share, the largest first.
  expect(drawn.map((item) => item.key.replace(/-\d+$/, ''))).toEqual(['local', 'cheap_cloud', 'claude']);
  // A track long enough that the comparison means something.
  expect(drawn[0]!.track).toBeGreaterThan(120);
  // The largest share fills its track; the next is 0.2499 / 0.75 of it (the drawing rounds to 0.1% of the track).
  expect(Math.abs(drawn[0]!.length - drawn[0]!.track)).toBeLessThan(1);
  expect(Math.abs(drawn[1]!.length / drawn[0]!.track - 0.2499 / 0.75)).toBeLessThan(0.005);
  // One run in 10,000 is a hair (the bar's 2px edge), never anything near a visible share.
  expect(drawn[2]!.length).toBeGreaterThan(0);
  expect(drawn[2]!.length).toBeLessThan(0.0001 / 0.75 * drawn[0]!.track + 3);

  // The sliver cannot be seen at that length, so the figure beside it must not read as none.
  await expect(chart.locator('[data-ranked-item^="claude-"] .rb-value')).toContainText('<0.1%');
  await expect(chart.locator('[data-ranked-item^="cheap_cloud-"] .rb-value')).toContainText('25.0%');
  await expect(chart.locator('[data-ranked-item^="local-"] .rb-value')).toContainText('75.0%');

  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-overview-tier-mix-1440x900.png'), fullPage: false });
});

// OMN-21015 stage 5, U4: a chart legend is worked from the keyboard, and whether a series is really gone is read from the
// drawing. OMN-21166 AC86 (Lakshman 2026-10-25): Spend per day (the money chart and its Actual spend / Baseline spend /
// Savings legend) is deleted from Overview. The same property (Tab reaches a legend toggle, Enter hides its series and
// the drawing loses exactly that series' bars, Space brings it back) is held on Overview's surviving legend, the
// Passed / Failed toggles of "Runs per day". The rows are constructed: one passed run on one day, one failed run on
// another, so each series is one bar.
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const meteringDay = (start: string, spend: string, baseline: string, savings: string) => ({
  window_kind: 'day', window_start: start, as_of: `${start}T23:00:00+00:00`, baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', spend_usd: spend, counterfactual_usd: baseline, savings_usd: savings, runs_total: 3,
});
const metering = [
  meteringDay('2026-10-11', '0.110000', '0.410000', '0.300000'),
  meteringDay('2026-10-12', '0.120000', '0.520000', '0.400000'),
];

test('OMN-21015: the Runs per day legend hides and shows a series from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: firstScreenRuns });
  await page.goto('/');

  const figure = page.getByRole('figure', { name: 'Runs per day', exact: true });
  await expect(figure).toBeVisible();
  const toggles = figure.getByRole('group', { name: 'Series' }).getByRole('button');
  await expect(toggles).toHaveText(['Passed', 'Failed']);

  /** How many bars the drawing holds for each series, in legend order. */
  const drawn = () => figure.evaluate((element) => ['passed', 'failed'].map(
    (key) => element.querySelectorAll(`.gdb-col[data-series="${key}"] .gdb-bar`).length));

  // One passed day and one failed day: one bar per series.
  await expect.poll(drawn).toEqual([1, 1]);

  // Reach the second toggle with Tab from the first, then press Enter.
  await toggles.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(toggles.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(drawn).toEqual([1, 0]);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-runs-legend-hidden-1440x900.png'), fullPage: false });

  // Space brings it back.
  await page.keyboard.press('Space');
  await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(drawn).toEqual([1, 1]);
});

// OMN-21015 stage 5: the charts are on the first screen. At 1440x900, with the page as it opens and nothing scrolled,
// each chart's drawing lies wholly inside the window. The rows are constructed.
const meteringAll = { ...meteringDay('', '0.230000', '0.930000', '0.700000'), window_kind: 'all' };

/** Where a drawing lies in the window, and how far the page has been scrolled (it must not have been). */
async function placed(page: Page, selector: string | Locator) {
  const target = (typeof selector === 'string' ? page.locator(selector) : selector).first();
  await expect(target).toBeVisible();
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scrolled = [...document.querySelectorAll('*')].reduce((most, node) => Math.max(most, node.scrollTop), 0);
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, scrolled, window: [window.innerWidth, window.innerHeight] };
  });
}

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
/** Two runs; the newer one failed, so its typed cause has to be on the first screen too. */
const firstScreenRuns = [
  { correlation_id: '9791105f-82da-4044-b6d1-b50d298ff650', written_at: '2026-10-12T10:07:00+00:00', created_at: '2026-10-12T10:07:00+00:00',
    model_name: 'gemini-3.5-flash-lite', backend_id: 'byok-gemini', host: 'generativelanguage.googleapis.com', quality_gate_passed: 0,
    quality_gate_detail: 'quality_gate_failed', terminal_ok: 0, latency_ms: 4925, tokens_input: 262, tokens_output: 7,
    task_type: 'document', cost_tier_name: 'cheap_frontier', actual_score: 0.4, required_bar: 0.8, data_source: 'real' },
  { correlation_id: 'a66aca8a-dd42-4ffa-9f68-89c1dba7e400', written_at: '2026-10-11T02:00:26+00:00', created_at: '2026-10-11T02:00:26+00:00',
    model_name: 'qwen3-coder', backend_id: 'local-coder', host: 'lab-host', quality_gate_passed: 1, quality_gate_detail: 'completed',
    terminal_ok: 1, latency_ms: 700, tokens_input: 250, tokens_output: 13, task_type: 'document', cost_tier_name: 'local',
    actual_score: 1, required_bar: 0.8, data_source: 'real' },
];

// D1/D2 explicitly replace the older spend-first composition. Keep the first-screen KPI limits and the charts' drawing
// limits. OMN-21166 AC86 (Lakshman 2026-10-25): the newest run (Q2 waived), Recent runs, Last run and the Spend per day
// chart with its table are deleted from Overview, so their first-screen and in-view checks are removed with them.
test('OMN-21166: the Overview first screen holds exact legacy tiles and the activity charts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, {
    [METERING]: [{ ...meteringAll, runs_measured: 2, runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 512, tokens_out: 20, pricing_manifest_version: '1.0.0' }, ...metering],
    ['onex.snapshot.projection.cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-12T10:07:00Z', total_cost_usd: '0.2300', total_savings_usd: '0.7000', run_count: 2, measured_run_count: 2, tokens_total: 532 }],
    [ROUTING]: routing, [DECISIONS]: firstScreenRuns,
  });
  await page.goto('/');
  const panel = (title: string) => page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const onFirstScreen = async (locator: ReturnType<Page['locator']>, what: string) => {
    await expect(locator, what).toBeVisible(); const box = await locator.boundingBox();
    expect(box, what).not.toBeNull(); expect(box!.y, what).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, what).toBeLessThanOrEqual(900);
  };
  for (const [title, value] of [['Actual spend', '$0.23'], ['Savings', '$0.70'], ['Agent calls', '2'], ['Tokens processed', '532']]) {
    await expect(panel(title).locator('.local-dashboard-metric')).toHaveText(value);
    await onFirstScreen(panel(title).locator('.local-dashboard-metric'), title);
  }
  await expect(panel('Savings')).toContainText('Modelled · vs cloud baseline');
  // The visible activity plots retain the original >120px, no-scroll drawing limits.
  await test.info().attach('first-screen-layout', { body: JSON.stringify(await page.locator('.local-dashboard-header, .local-overview-summary, .maple-cell, .ins-bars, .rb-chart').evaluateAll(nodes => nodes.map(el => { const r=el.getBoundingClientRect(); const css=getComputedStyle(el); return {element:el.className,field:el.getAttribute('data-field'),x:r.x,y:r.y,height:r.height,width:r.width,columns:css.gridTemplateColumns}; }))), contentType: 'application/json' });
  console.log('FIRST-SCREEN-GEOMETRY', JSON.stringify(await page.locator('.local-dashboard-header, .maple-cell, .ins-bars').evaluateAll(nodes => nodes.map(el => { const r=el.getBoundingClientRect();return {element:el.className,field:el.getAttribute('data-field'),y:r.y,height:r.height,width:r.width,columns:getComputedStyle(el).gridTemplateColumns}; }))));
  const activity = [];
  for (const title of ['Runs per day', 'Tokens per day']) {
    const drawing = await placed(page, page.getByRole('figure', { name: title, exact: true }).locator('.ins-bars'));
    expect(drawing.window).toEqual([1440, 900]);
    expect(drawing.scrolled).toBe(0);
    expect(drawing.height).toBeGreaterThan(120);
    expect(drawing.top).toBeGreaterThanOrEqual(0);
    expect(drawing.right).toBeLessThanOrEqual(1440);
    activity.push(drawing);
  }
  // OMN-21166 AC64 / Maple grid: the tier mix is ranked bars (figure "Runs by tier"), in the second row beside Tokens
  // per day, so it lies below the Runs per day drawing rather than below both activity plots.
  const tiers = await placed(page, page.getByRole('figure', { name: 'Runs by tier', exact: true }));
  expect(tiers.height).toBeGreaterThan(120);
  expect(tiers.top).toBeGreaterThan(activity[0]!.bottom);
  // The tables that remain on Overview (none are required) must not scroll sideways.
  const tables = await page.locator('.local-dashboard-table-wrap:visible').evaluateAll(elements => elements.map(el => el.scrollWidth - el.clientWidth));
  expect(tables.filter(over => over > 0)).toEqual([]);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-overview-first-screen-1440x900.png'), fullPage: false });
});

test('OMN-21015: on Usage the full-width token chart follows the Savings panes at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [METERING]: [meteringAll, ...metering], [USAGE]: usage });
  await page.goto('/usage');

  const savings = await placed(page, 'figure.local-chart .local-chart-canvas');
  // OMN-21166 Maple grid: the page's token chart is the stacked per-day chart (figure.utc-chart, 8 of 12 columns, the
  // same width as the Savings chart above it); the per-day list this test used to measure is the detail under "More usage".
  const tokens = await placed(page, 'figure.utc-chart');
  for (const drawing of [savings, tokens]) {
    expect(drawing.scrolled).toBe(0);
    expect(drawing.top).toBeGreaterThanOrEqual(0);
    expect(drawing.right).toBeLessThanOrEqual(1440);
  }
  expect(tokens.top).toBeGreaterThan(savings.bottom);
  expect(tokens.right-tokens.left).toBeGreaterThanOrEqual(savings.right-savings.left);
  await page.locator('figure.utc-chart').scrollIntoViewIfNeeded();
  await expect(page.locator('figure.utc-chart')).toBeInViewport();
  // Let the bars finish growing before the page is photographed (their animation is 250 ms).
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-usage-first-screen-1440x900.png'), fullPage: false });
});

// OMN-21015: where a run's time went, on Workflow. jsdom draws no chart, so the bars are measured in a real browser:
// one bar per served timing, as long as its served value against the others, with the served text at its end. The
// timings are chosen far apart (12, 4,788 and 743 ms) so a bar drawn from the wrong column would be seen.
const RUN_TRACE = 'onex.snapshot.projection.run-trace.v1';
const TIMED_RUN = 'a66aca8a-dd42-4ffa-9f68-89c1dba7e400';
const timedRun = {
  correlation_id: TIMED_RUN, written_at: '2026-10-11T02:00:26+00:00', created_at: '2026-10-11T02:00:26+00:00', model_name: 'qwen3-coder',
  backend_id: 'local-coder', host: 'lab-host', quality_gate_passed: 1, quality_gate_detail: 'completed', terminal_ok: 1, task_type: 'document',
  cost_tier_name: 'local', actual_score: 1, required_bar: 0.8, tokens_input: 262, tokens_output: 7, finish_reason: 'stop', truncated: 0,
  escalation_count: 0, data_source: 'real', requested_model: 'asked-model', queue_wait_ms: 12, execution_ms: 4788, latency_ms: 743,
};
const timedSteps = ['request', 'routing_decision', 'provider_call', 'quality_gate', 'terminal'].map((step_kind, index) => ({
  correlation_id: TIMED_RUN, step_sequence: index + 1, step_kind, started_at: `2026-10-11T02:00:2${index}+00:00`, duration_ms: null,
  outcome: 'succeeded', reason: null,
}));

test('OMN-21015: on Workflow a run\'s timings are drawn as bars of their served lengths, above the run\'s steps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: [timedRun], [RUN_TRACE]: timedSteps });
  await page.goto('/workflow');

  const figure = page.getByRole('figure', { name: 'Run timing' });
  await expect(figure).toBeVisible();
  // The served value is written at each bar's end and on its row. OMN-21166 AC55: as a readable duration (4788 ms
  // reads "4.8 s").
  for (const text of ['Queue wait', 'Execution', 'Duration', '12 ms', '4.8 s', '743 ms']) {
    await expect(figure.locator('.local-chart-canvas svg').getByText(text, { exact: true })).toBeVisible();
  }
  // The three bars: the drawn paths that carry one of the three series colours, top row first. The chart grows its
  // bars in over a quarter second, so they are read once two reads in a row agree.
  const read = () => figure.locator('.local-chart-canvas svg').evaluate((svg) => {
    const drawn = [...svg.querySelectorAll('path')]
      .map((path) => ({ fill: path.getAttribute('fill') ?? '', rect: path.getBoundingClientRect() }))
      .filter(({ fill, rect }) => /^(#|rgb)/.test(fill) && rect.height > 4 && rect.height < 30 && rect.width > 0.5);
    return drawn.sort((a, b) => a.rect.top - b.rect.top).map(({ fill, rect }) => ({ fill, width: rect.width, left: rect.left }));
  });
  let previous = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await read());
    const settled = now === previous;
    previous = now;
    return settled;
  }, { intervals: [200] }).toBe(true);
  const bars = await read();
  expect(bars).toHaveLength(3);
  expect(new Set(bars.map((bar) => bar.fill)).size).toBe(3);
  // All start at the same origin, and each is as long as its served value against the longest.
  expect(Math.abs(bars[0]!.left - bars[1]!.left)).toBeLessThan(1);
  expect(Math.abs(bars[2]!.left - bars[1]!.left)).toBeLessThan(1);
  expect(bars[0]!.width / bars[1]!.width).toBeCloseTo(12 / 4788, 2);
  expect(bars[2]!.width / bars[1]!.width).toBeCloseTo(743 / 4788, 2);

  // The tiles carry the same three as text, and the requested model beside the answering one.
  const summary = page.getByRole('region', { name: 'Run summary' });
  // OMN-21166 AC55: the tiles read durations the same way.
  for (const [label, value] of [['Queue wait', '12 ms'], ['Execution', '4.8 s'], ['Duration', '743 ms'], ['Requested model', 'asked-model'], ['Model', 'qwen3-coder']]) {
    await expect(summary.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')).toHaveText(value!);
  }

  // The run's steps still start on the first screen, under the chart, and nothing scrolls sideways.
  const chart = await placed(page, 'figure.local-chart--timing');
  const steps = await placed(page, 'nav.local-run-diagram');
  expect(chart.scrolled).toBe(0);
  expect(steps.top).toBeGreaterThanOrEqual(chart.bottom);
  await page.locator('nav.local-run-diagram').scrollIntoViewIfNeeded();
  await expect(page.locator('nav.local-run-diagram')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-workflow-run-timing-1440x900.png') });
});

test('OMN-21015: on Workflow a timing the run does not carry has no bar, and a served zero keeps its row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: [{ ...timedRun, queue_wait_ms: 0, execution_ms: null }], [RUN_TRACE]: timedSteps });
  await page.goto('/workflow');
  const figure = page.getByRole('figure', { name: 'Run timing' });
  await expect(figure).toBeVisible();
  await expect(figure.locator('.local-chart-canvas svg').getByText('0 ms', { exact: true })).toBeVisible();
  await expect(figure.locator('.local-chart-canvas svg').getByText('Execution', { exact: true })).toHaveCount(0);
  await expect(figure).toContainText('No measured value to draw for: Execution');
  const summary = page.getByRole('region', { name: 'Run summary' });
  await expect(summary.locator('dt', { hasText: /^Execution$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not recorded');
  await expect(summary.locator('dt', { hasText: /^Queue wait$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('0 ms');
});

// OMN-21015: the Runs page draws the runs it lists. In a real browser: both charts are on the first screen above the
// list, a bar is as tall as its run's served duration against the others, a failed run's bar is another colour than
// a passed run's, and a click on a bar opens that run on Workflow.
const listedRuns = [
  { ...timedRun, correlation_id: 'cccccccc-0000-4000-8000-000000000003', written_at: '2026-10-11T02:30:00+00:00', created_at: '2026-10-11T02:30:00+00:00', latency_ms: 1200, tokens_input: 90, tokens_output: 400 },
  { ...timedRun, correlation_id: 'bbbbbbbb-0000-4000-8000-000000000002', written_at: '2026-10-11T02:20:00+00:00', created_at: '2026-10-11T02:20:00+00:00', latency_ms: 4800, tokens_input: 262, tokens_output: 7,
    quality_gate_passed: 0, quality_gate_detail: 'quality_gate_failed', terminal_ok: 0 },
  { ...timedRun, correlation_id: 'aaaaaaaa-0000-4000-8000-000000000001', written_at: '2026-10-11T02:10:00+00:00', created_at: '2026-10-11T02:10:00+00:00', latency_ms: 600, tokens_input: 250, tokens_output: 13 },
];

/** The bars of one figure, left to right, once two reads in a row agree (the chart grows its bars in). */
async function settledBars(page: Page, name: string) {
  // OMN-21166 part 13: Runs keeps its run charts under a closed "More run charts"; open it before reading them.
  const more = page.locator('summary').filter({ hasText: /^More run charts$/ });
  await more.waitFor();
  if (await more.locator('xpath=..').getAttribute('open') === null) await more.click();
  const figure = page.getByRole('figure', { name });
  await expect(figure).toBeVisible();
  await figure.scrollIntoViewIfNeeded();
  const read = () => figure.locator('.local-chart-canvas svg').evaluate((svg) => [...svg.querySelectorAll('path')]
    .map((path) => ({ fill: path.getAttribute('fill') ?? '', rect: path.getBoundingClientRect() }))
    .filter(({ fill, rect }) => /^(#|rgb)/.test(fill) && rect.width > 6 && rect.width < 40 && rect.height > 0.5)
    .sort((a, b) => a.rect.left - b.rect.left)
    .map(({ fill, rect }) => ({ fill, height: rect.height, bottom: rect.bottom, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })));
  let previous = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await read());
    const settled = now === previous;
    previous = now;
    return settled;
  }, { intervals: [200] }).toBe(true);
  return read();
}

test('OMN-21015: on Runs the listed runs are drawn below the list, and a bar opens its run', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: listedRuns, [RUN_TRACE]: timedSteps });
  await page.goto('/runs');

  const durations = await settledBars(page, 'Duration per run');
  expect(durations).toHaveLength(3);
  // Heights in the ratio of the served durations (1200, 4800, 600), all standing on one baseline.
  expect(durations[0]!.height / durations[1]!.height).toBeCloseTo(1200 / 4800, 2);
  expect(durations[2]!.height / durations[1]!.height).toBeCloseTo(600 / 4800, 2);
  expect(Math.abs(durations[0]!.bottom - durations[1]!.bottom)).toBeLessThan(1);
  // Passed, failed, passed.
  expect(durations[0]!.fill).toBe(durations[2]!.fill);
  expect(durations[1]!.fill).not.toBe(durations[0]!.fill);

  const tokens = await settledBars(page, 'Tokens per run');
  expect(tokens).toHaveLength(6);
  // In and out of the first listed run (90, 400), side by side on one baseline, not one on top of the other.
  expect(tokens[0]!.height / tokens[1]!.height).toBeCloseTo(90 / 400, 2);
  expect(Math.abs(tokens[0]!.bottom - tokens[1]!.bottom)).toBeLessThan(1);
  expect(tokens[0]!.fill).not.toBe(tokens[1]!.fill);

  // Runs is list first; inspect chart positions after returning to the top.
  await page.locator('.local-dashboard-page').evaluate(el => { el.scrollTop = 0; });
  const left = await placed(page, 'figure[aria-label="Duration per run"]');
  const right = await placed(page, 'figure[aria-label="Tokens per run"]');
  const list = await placed(page, '.local-dashboard-table-wrap thead');
  expect(left.scrolled).toBe(0);
  expect(right.top).toBeGreaterThanOrEqual(left.bottom);
  expect(Math.abs(right.left-left.left)).toBeLessThan(2);
  expect(left.top).toBeGreaterThanOrEqual(list.bottom);
  expect(list.bottom).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-runs-charts-1440x900.png') });

  // A click on the failed run's bar opens that run, the address its row's link carries.
  const href = await page.getByRole('link', { name: /^bbbbbbbb/ }).getAttribute('href');
  const clickable = await settledBars(page, 'Duration per run');
  await page.mouse.click(clickable[1]!.x, clickable[1]!.y);
  await expect(page).toHaveURL(new URL(href!, page.url()).href);
  await expect(page.locator('.local-run-title code')).toHaveText('bbbbbbbb-0000-4000-8000-000000000002');
});

test('OMN-21015: on Runs the status key hides a status from the drawing and not from the list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: listedRuns });
  await page.goto('/runs');
  expect(await settledBars(page, 'Duration per run')).toHaveLength(3);
  const key = page.getByRole('figure', { name: 'Duration per run' }).getByRole('group', { name: 'Statuses shown' });
  await key.getByRole('button', { name: 'failed' }).focus();
  await page.keyboard.press('Enter');
  await expect(key.getByRole('button', { name: 'failed' })).toHaveAttribute('aria-pressed', 'false');
  const fewer = await settledBars(page, 'Duration per run');
  expect(fewer).toHaveLength(2);
  expect(new Set(fewer.map((bar) => bar.fill)).size).toBe(1);
  await expect(page.locator('.local-dashboard-table-wrap tbody tr')).toHaveCount(3);
});

test('OMN-21015: on Runs a backend in a row filters the list, the charts and the address, and Clear filters undoes it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: [listedRuns[0]!, { ...listedRuns[1]!, backend_id: 'byok-gemini' }, listedRuns[2]!] });
  await page.goto('/runs');
  expect(await settledBars(page, 'Duration per run')).toHaveLength(3);
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  // Reached and pressed from the keyboard, as any button.
  await revealRunFields(page);
  await page.getByRole('button', { name: 'Show only runs of backend byok-gemini' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.local-dashboard-table-wrap tbody tr')).toHaveCount(1);
  await expect(page.getByLabel('Backend', { exact: true })).toHaveValue('byok-gemini');
  await expect(page).toHaveURL(/[?&]backend=byok-gemini/);
  expect(await settledBars(page, 'Duration per run')).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.local-dashboard-table-wrap tbody tr')).toHaveCount(3);
  await expect(page).not.toHaveURL(/backend=/);
  expect(await settledBars(page, 'Duration per run')).toHaveLength(3);
});

test('OMN-21015: on Workflow the older and newer run links walk the served runs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [DECISIONS]: listedRuns, [RUN_TRACE]: [] });
  await page.goto('/workflow');
  const shown = page.locator('.local-run-title code');
  const nav = page.getByRole('navigation', { name: 'Neighbouring runs' });
  // The newest run opens first: it has an older run and no newer one.
  await expect(shown).toHaveText('cccccccc-0000-4000-8000-000000000003');
  await expect(nav.getByRole('link', { name: 'Newer run' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Older run' }).click();
  await expect(shown).toHaveText('bbbbbbbb-0000-4000-8000-000000000002');
  await nav.getByRole('link', { name: 'Older run' }).click();
  await expect(shown).toHaveText('aaaaaaaa-0000-4000-8000-000000000001');
  await expect(nav.getByRole('link', { name: 'Older run' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Newer run' }).click();
  await expect(shown).toHaveText('bbbbbbbb-0000-4000-8000-000000000002');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('OMN-21015: a tooltip shows markup in a served model name as text, in the real tooltip element', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const planted = 'qwen<b class="planted-model">bold</b>&co';
  await serve(page, { [DECISIONS]: [{ ...listedRuns[0]!, model_name: planted }, listedRuns[2]!] });
  await page.goto('/runs');
  const bars = await settledBars(page, 'Duration per run');
  expect(bars).toHaveLength(2);
  await page.mouse.move(bars[0]!.x, bars[0]!.y);
  const figure = page.getByRole('figure', { name: 'Duration per run' });
  // The library's tooltip element, found by the text only it carries (the run's full id and its duration line).
  const tooltip = figure.locator('div', { hasText: 'Duration: 1200 ms' }).last();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(`passed · ${planted}`);
  await expect(page.locator('.planted-model')).toHaveCount(0);
  await expect(figure.locator('b')).toHaveCount(0);
});
