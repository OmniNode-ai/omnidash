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

async function serve(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [{ topic: USAGE, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null }],
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    await route.fulfill(topic === USAGE
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ rows: usage, row_count: usage.length, data_freshness: 'fresh' }) }
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
