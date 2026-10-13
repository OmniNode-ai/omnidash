import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

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

  const tokensIn = await drawnWidths(page, 'Tokens in on 2026-10-12, by model');
  const tokensOut = await drawnWidths(page, 'Tokens out on 2026-10-12, by model');
  expect(tokensIn).toHaveLength(2);
  expect(tokensOut).toHaveLength(2);
  // A bar wide enough that the comparison means something.
  expect(tokensIn[1]!).toBeGreaterThan(300);
  expect(tokensOut[1]!).toBeGreaterThan(300);
  // 1 : 1,000 and 300 : 1,200, as served. The tolerance is far below what any label or padding would add.
  expect(tokensIn[0]! / tokensIn[1]!).toBeCloseTo(1 / 1000, 3);
  expect(tokensOut[0]! / tokensOut[1]!).toBeCloseTo(300 / 1200, 3);

  // Every figure is still written out beside the bar, the small one included.
  const written = page.getByRole('list', { name: 'Tokens in on 2026-10-12, by model' }).getByRole('listitem');
  await expect(written).toHaveText(['gemini-3.5-flash-lite: 1', 'qwen3-coder: 1,000']);

  await page.getByRole('heading', { name: 'Tokens per day' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-usage-tokens-1440x900.png'), fullPage: false });
});

// OMN-21015 stage 5, U2: on Overview a tier's slice of the donut covers its served share of the ring. Nothing about
// the drawing is taken from the markup: the browser is asked, at 36,000 points round the ring, which slice's stroke
// each point lies in. One share is constructed at the extreme (1 run in 10,000) because that is where anything added
// to a slice shows: a 2px floor on the bar this donut replaced drew such a tier eighteen times too large.
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

  const ring = page.getByRole('img', { name: /^Tier mix:/ });
  await expect(ring).toBeVisible();
  const SAMPLES = 36000;
  const drawn = await ring.evaluate((element, samples) => {
    const svg = element as unknown as SVGSVGElement;
    const slices = [...svg.querySelectorAll<SVGGeometryElement>('[data-testid="tier-segment"]')];
    // The ring the slices are drawn on, read from the track under them.
    const track = svg.querySelector<SVGCircleElement>('.local-donut-track')!;
    const radius = track.r.baseVal.value;
    const [cx, cy] = [track.cx.baseVal.value, track.cy.baseVal.value];
    const inside = slices.map(() => [] as boolean[]);
    let twice = 0;
    let none = 0;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * 2 * Math.PI - Math.PI / 2;
      const point = svg.createSVGPoint();
      point.x = cx + radius * Math.cos(angle);
      point.y = cy + radius * Math.sin(angle);
      const hit = slices.map((slice) => slice.isPointInStroke(point));
      const count = hit.filter(Boolean).length;
      if (count > 1) twice += 1;
      if (count === 0) none += 1;
      hit.forEach((isIn, index) => inside[index]!.push(isIn));
    }
    const covered = inside.map((list) => list.filter(Boolean).length);
    // Where each slice begins, going clockwise from twelve o'clock, as a fraction of the turn: the sample it is in
    // whose neighbour before it is not. (A slice that ends at twelve o'clock touches sample 0 with its last point,
    // so "the first sample it is in" would be wrong for it.)
    const first = inside.map((list) => {
      const begins = list.map((isIn, i) => isIn && !list[(i - 1 + samples) % samples]).flatMap((begin, i) => (begin ? [i / samples] : []));
      return begins.length === 1 ? begins[0]! : -1;
    });
    return {
      size: svg.getBoundingClientRect().width,
      covered: covered.map((count) => count / samples),
      first, twice: twice / samples, none: none / samples,
    };
  }, SAMPLES);

  // A ring large enough to read.
  expect(drawn.size).toBeGreaterThan(120);
  // Each slice covers its served share of the turn. One sample is 1/36,000 of it; the tolerance is ten samples.
  expect(drawn.covered[0]!).toBeGreaterThan(0);
  expect(drawn.covered[0]!).toBeLessThan(0.0001 + 10 / SAMPLES);
  expect(Math.abs(drawn.covered[1]! - 0.2499)).toBeLessThan(10 / SAMPLES);
  expect(Math.abs(drawn.covered[2]! - 0.75)).toBeLessThan(10 / SAMPLES);
  // No point of the ring belongs to two slices, and the shares add up to the whole, so none is left bare.
  expect(drawn.twice).toBeLessThan(10 / SAMPLES);
  expect(drawn.none).toBeLessThan(10 / SAMPLES);
  // Clockwise from twelve o'clock in served order: each slice starts where the one before it ended.
  expect(drawn.first[0]!).toBeLessThan(10 / SAMPLES);
  expect(Math.abs(drawn.first[1]! - 0.0001)).toBeLessThan(10 / SAMPLES);
  expect(Math.abs(drawn.first[2]! - 0.25)).toBeLessThan(10 / SAMPLES);

  // The sliver cannot be seen at that length, so the figure beside it must not read as none.
  await expect(page.locator('.local-share-legend').getByRole('listitem')).toHaveText(['claude<0.1%', 'cheap_cloud25.0%', 'local75.0%']);

  // Pointing at a tier in the list names it in the middle of the ring.
  await page.locator('.local-share-legend').getByRole('listitem').nth(2).hover();
  await expect(ring.getByTestId('tier-focus')).toHaveText('local75.0%');

  await ring.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-overview-tier-mix-1440x900.png'), fullPage: false });
});

// OMN-21015 stage 5, U4: the spend chart's legend is worked from the keyboard. The chart library draws into SVG, so
// whether a series is really gone is read from the drawing: the bars filled in that series' colour. The rows are
// constructed: two days, so each series is two bars.
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const meteringDay = (start: string, spend: string, baseline: string, savings: string) => ({
  window_kind: 'day', window_start: start, as_of: `${start}T23:00:00+00:00`, baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', spend_usd: spend, counterfactual_usd: baseline, savings_usd: savings, runs_total: 3,
});
const metering = [
  meteringDay('2026-10-11', '0.110000', '0.410000', '0.300000'),
  meteringDay('2026-10-12', '0.120000', '0.520000', '0.400000'),
];

test('OMN-21015: the spend chart legend hides and shows a series from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [METERING]: metering });
  await page.goto('/');

  const figure = page.getByRole('figure', { name: /^Spend per day vs claude-sonnet-5-5$/ });
  await expect(figure).toBeVisible();
  await expect(figure.locator('svg')).toBeVisible();
  const toggles = figure.getByRole('group', { name: 'Series shown' }).getByRole('button');
  await expect(toggles).toHaveText(['Actual spend', 'Baseline spend', 'Savings']);

  /** How many bars the drawing holds in each legend swatch's colour, in legend order. */
  const drawn = () => figure.evaluate((element) => {
    const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
    const colours = [...element.querySelectorAll<HTMLElement>('[data-swatch]')].map((swatch) => hex(getComputedStyle(swatch).backgroundColor));
    const fills = [...element.querySelectorAll('svg path')].map((path) => (path.getAttribute('fill') ?? '').toLowerCase());
    return colours.map((colour) => fills.filter((fill) => fill === colour).length);
  });

  const before = await drawn();
  // Two served days: two bars per series.
  expect(before).toEqual([2, 2, 2]);

  // Reach the second toggle with Tab from the first, then press Enter.
  await toggles.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(toggles.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(drawn).toEqual([before[0], 0, before[2]]);
  // Let the chart finish moving before it is photographed (its animation is 250 ms).
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-spend-legend-hidden-1440x900.png'), fullPage: false });

  // Space brings it back.
  await page.keyboard.press('Space');
  await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(drawn).toEqual(before);
});

// OMN-21015 stage 5: the charts are on the first screen. At 1440x900, with the page as it opens and nothing scrolled,
// each chart's drawing lies wholly inside the window. The rows are constructed.
const meteringAll = { ...meteringDay('', '0.230000', '0.930000', '0.700000'), window_kind: 'all' };

/** Where a drawing lies in the window, and how far the page has been scrolled (it must not have been). */
async function placed(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scrolled = [...document.querySelectorAll('*')].reduce((most, node) => Math.max(most, node.scrollTop), 0);
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, scrolled, window: [window.innerWidth, window.innerHeight] };
  });
}

test('OMN-21015: on Overview the spend chart and the tier donut are on the first screen at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [METERING]: [meteringAll, ...metering], [ROUTING]: routing });
  await page.goto('/');

  const bars = await placed(page, 'figure.local-chart .local-chart-canvas');
  const donut = await placed(page, 'svg.local-donut');
  for (const drawing of [bars, donut]) {
    expect(drawing.window).toEqual([1440, 900]);
    expect(drawing.scrolled).toBe(0);
    expect(drawing.height).toBeGreaterThan(120);
    expect(drawing.top).toBeGreaterThanOrEqual(0);
    expect(drawing.bottom).toBeLessThanOrEqual(900);
  }
  // Side by side in one row: the donut starts to the right of where the bars end, and their tops are level.
  expect(donut.left).toBeGreaterThan(bars.right);
  expect(Math.abs(donut.top - bars.top)).toBeLessThan(80);
  // Let the bars finish growing before the page is photographed (their animation is 250 ms).
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-overview-first-screen-1440x900.png'), fullPage: false });
});

test('OMN-21015: on Usage both charts are on the first screen at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [METERING]: [meteringAll, ...metering], [USAGE]: usage });
  await page.goto('/usage');

  const savings = await placed(page, 'figure.local-chart .local-chart-canvas');
  const tokens = await placed(page, '.usage-tokens-day');
  for (const drawing of [savings, tokens]) {
    expect(drawing.scrolled).toBe(0);
    expect(drawing.top).toBeGreaterThanOrEqual(0);
    expect(drawing.bottom).toBeLessThanOrEqual(900);
  }
  expect(tokens.left).toBeGreaterThan(savings.right);
  // Let the bars finish growing before the page is photographed (their animation is 250 ms).
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-usage-first-screen-1440x900.png'), fullPage: false });
});
