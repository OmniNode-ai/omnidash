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

// OMN-21015 stage 5, U2: on Overview a tier's segment is as wide as its served share of the tier-routed runs. The
// shares are constructed at the extreme (1 run in 10,000 against the rest) because that is where a floor on a
// segment's width shows: a 2px minimum drew this pair as 2px against 1,096px, eighteen times the served share.
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const routing = [{
  captured_at: '2026-10-13T10:00:00+00:00',
  by_tier: {
    tiers: [
      { cost_tier_name: 'claude', count: 1, tier_routed: true, pct_of_tier_routed: 0.0001 },
      { cost_tier_name: 'local', count: 9999, tier_routed: true, pct_of_tier_routed: 0.9999 },
    ],
  },
}];

test('OMN-21015: on Overview a tier segment is as wide as its served share', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [ROUTING]: routing });
  await page.goto('/');

  const bar = page.getByRole('img', { name: /^Tier mix:/ });
  await expect(bar).toBeVisible();
  const drawn = await bar.evaluate((element) => ({
    bar: element.getBoundingClientRect().width,
    segments: [...element.children].map((child) => child.getBoundingClientRect().width),
  }));
  expect(drawn.segments).toHaveLength(2);
  // A bar wide enough that the comparison means something.
  expect(drawn.bar).toBeGreaterThan(300);
  // 1 : 9,999, as served, and each segment its own share of the whole bar.
  expect(drawn.segments[0]! / drawn.segments[1]!).toBeCloseTo(0.0001 / 0.9999, 4);
  expect(drawn.segments[0]! / drawn.bar).toBeCloseTo(0.0001, 4);
  expect(drawn.segments[1]! / drawn.bar).toBeCloseTo(0.9999, 4);

  // The sliver cannot be seen at that width, so the figure beside it must not read as none.
  await expect(bar.locator('xpath=following-sibling::ul[1]').getByRole('listitem')).toHaveText(['claude<0.1%', 'local>99.9%']);

  await bar.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-omn21015-overview-tier-mix-1440x900.png'), fullPage: false });
});

// OMN-21015 stage 5, U4: the spend chart's legend is worked from the keyboard. The chart library draws into SVG, so
// whether a series is really gone is read from the drawing: the lines stroked in that series' colour. The rows are
// constructed: two days, so each series is a line.
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

  /** How many lines the drawing holds in each legend swatch's colour, in legend order. */
  const drawn = () => figure.evaluate((element) => {
    const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
    const colours = [...element.querySelectorAll<HTMLElement>('[data-swatch]')].map((swatch) => hex(getComputedStyle(swatch).backgroundColor));
    const strokes = [...element.querySelectorAll('svg path')]
      .filter((path) => (path.getAttribute('fill') ?? 'none') === 'none')
      .map((path) => (path.getAttribute('stroke') ?? '').toLowerCase());
    return colours.map((colour) => strokes.filter((stroke) => stroke === colour).length);
  });

  const before = await drawn();
  expect(before.every((count) => count >= 1)).toBe(true);

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
