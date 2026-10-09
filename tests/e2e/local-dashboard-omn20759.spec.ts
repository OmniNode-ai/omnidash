import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-20759: at 1440x900 the Runs table (17 columns) and the Overview's Recent runs table (16 columns) fit inside
// their panels, with no clipped cell, no sideways scroll and no column dropped. The rows are the OMN-20223 re-walk's
// own shape (2026-10-09): UUID run ids, microsecond timestamps and the Gemini host, the values that clipped.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

const RUNS_HEADERS = [
  'Run', 'Created', 'Status', 'Cause', 'Model', 'Backend', 'Host', 'Tokens in', 'Tokens out', 'Local cost',
  'Baseline model', 'Basis', 'Task type', 'Duration', 'Tokens to compliance', 'Route tier', 'Quality score',
];
const RECENT_HEADERS = [
  'Time', 'Age', 'Status', 'Cause', 'Task type', 'Model', 'Backend', 'Host', 'Tokens in', 'Tokens out', 'Cost',
  'Basis', 'Duration', 'Route tier', 'Quality score', 'Run',
];

const decisions = Array.from({ length: 23 }, (_, index) => {
  const minute = String(index).padStart(2, '0');
  return {
    correlation_id: `a66aca8a-dd42-4ffa-9f68-89c1dba7e4${minute}`,
    written_at: `2026-10-09T02:${minute}:26.781249+00:00`,
    created_at: `2026-10-09T02:${minute}:26.781249+00:00`,
    model_name: 'gemini-3.5-flash-lite',
    backend_id: 'byok-gemini',
    host: 'generativelanguage.googleapis.com',
    quality_gate_passed: 1,
    quality_gate_detail: 'completed',
    terminal_ok: 1,
    cost_usd: 0.0,
    latency_ms: 700,
    tokens_input: 250,
    tokens_output: 13,
    tokens_to_compliance: 263,
    task_type: 'document',
    cost_tier_name: 'cheap_frontier',
    actual_score: 1,
    data_source: 'real',
  };
});

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
        topics: [{ topic: DECISIONS, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null }],
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    await route.fulfill(topic === DECISIONS
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ rows: decisions, row_count: decisions.length, data_freshness: 'fresh' }) }
      : { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) });
  });
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** The run table on the page: the wrapper whose header row is exactly `headers`. */
async function runTable(page: Page, headers: string[]) {
  const wraps = page.locator('.local-dashboard-table-wrap');
  await expect(wraps.first()).toBeVisible();
  for (const wrap of await wraps.all()) {
    const shown = await wrap.locator('thead th').allTextContents();
    if (shown.length === headers.length && shown.every((text, index) => text.trim() === headers[index])) return wrap;
  }
  const seen = await Promise.all((await wraps.all()).map((wrap) => wrap.locator('thead th').allTextContents()));
  throw new Error(`no run table with headers ${headers.join(', ')}; saw ${JSON.stringify(seen)}`);
}

for (const [name, path, headers] of [
  ['Runs', '/runs', RUNS_HEADERS],
  ['Overview Recent runs', '/', RECENT_HEADERS],
] as const) {
  test(`OMN-20759: the ${name} table fits its panel at 1440x900 with every column`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serve(page);
    await page.goto(path);
    // AC2: every column header present before this change is still there, in order.
    const table = await runTable(page, [...headers]);
    await expect(table.getByText('generativelanguage.googleapis.com').first()).toBeVisible();
    await table.evaluate((element) => element.scrollIntoView({ block: 'start' }));

    // AC1: nothing to scroll sideways inside the wrapper, and the table ends inside the viewport.
    expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    const bounds = await table.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    // No single cell is clipped by its own column either.
    const clipped = await table.evaluate((element) =>
      [...element.querySelectorAll('td')].filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length);
    expect(clipped).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);

    await page.screenshot({
      path: screenshotPath(`local-dashboard-omn20759-${name.toLowerCase().replace(/\s+/g, '-')}-1440x900.png`),
      fullPage: false,
    });
  });
}
