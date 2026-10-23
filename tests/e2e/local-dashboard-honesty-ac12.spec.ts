import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21304 AC1 and AC2. Both were met on dev f466f2eb before #431, so these pin the behaviour: each fails when it is
// removed, and each failure case has a positive control beside it.
const RUN_TRACE = prefix + 'run-trace.v1';
const OVERVIEW_MONEY = prefix + 'cost.savings-overview.v1';
const DECISIONS = prefix + 'delegation.decisions.v1';
const STEPS_A = [
  { correlation_id: 'chart-run-a', step_sequence: 1, step_kind: 'request', outcome: 'succeeded', duration_ms: 10 },
  { correlation_id: 'chart-run-a', step_sequence: 2, step_kind: 'provider_call', outcome: 'succeeded', duration_ms: 20 },
];
// Two runs that differ in every field a run drilldown shows; run B has no queue wait or execution time recorded, and a
// measured duration of 0, which must stay a value.
const RUNS = [
  { correlation_id: 'chart-run-a', created_at: '2026-10-12T10:00:00Z', written_at: '2026-10-12T10:00:00Z', model_name: 'model-alpha',
    quality_gate_passed: 1, actual_score: 0.91, required_bar: 0.8, queue_wait_ms: 40, execution_ms: 900, latency_ms: 950, task_type: 'summarization' },
  { correlation_id: 'chart-run-b', created_at: '2026-10-12T09:00:00Z', written_at: '2026-10-12T09:00:00Z', model_name: 'model-beta',
    quality_gate_passed: 0, actual_score: 0.42, required_bar: 0.8, queue_wait_ms: null, execution_ms: null, latency_ms: 0, task_type: 'document' },
];
const MONEY = [{ window: 'all', captured_at: '2026-10-12T10:07:00Z', total_cost_usd: '0.2300', total_savings_usd: '0.7000',
  run_count: 2, measured_run_count: 2, unknown_run_count: 0, estimated_run_count: 0, tokens_total: 532 }];

const savingsFigure = (page: Page) => page.locator('.local-dashboard-panel')
  .filter({ has: page.getByRole('heading', { name: 'Savings', exact: true }) }).locator('.local-dashboard-metric');

/** Every projection read, by path and query, with how many were asked for and how many have answered. */
function watchReads(page: Page) {
  const asked = new Map<string, number>();
  const answered = new Map<string, number>();
  const keyOf = (url: string) => { const u = new URL(url); return u.pathname.includes('/projection/') ? u.pathname + u.search : null; };
  page.on('request', (req) => { const k = keyOf(req.url()); if (k) asked.set(k, (asked.get(k) ?? 0) + 1); });
  page.on('requestfinished', (req) => { const k = keyOf(req.url()); if (k) answered.set(k, (answered.get(k) ?? 0) + 1); });
  const settled = () => asked.size > 0 && [...asked].every(([k, n]) => answered.get(k) === n);
  return { asked, answered, settled, reset: () => { asked.clear(); answered.clear(); } };
}

test('AC1 one load and one refresh each read every exposure once', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW_MONEY]: MONEY });
  const reads = watchReads(page);
  await page.goto('/overview');
  await expect(savingsFigure(page)).toHaveText('$0.70');
  await expect.poll(reads.settled).toBe(true);
  const loadKeys = [...reads.asked.keys()].sort();
  for (const key of loadKeys) expect(reads.asked.get(key), key).toBe(1);

  reads.reset();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  // The refresh reads exactly the load's set, each once, and every read has answered.
  await expect.poll(() => [...reads.asked.keys()].sort()).toEqual(loadKeys);
  await expect.poll(reads.settled).toBe(true);
  for (const key of loadKeys) expect(reads.asked.get(key), key).toBe(1);
});

test('AC1 a failed refresh keeps the last good figures with their age', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW_MONEY]: MONEY });
  await page.goto('/overview');
  const figure = savingsFigure(page);
  await expect(figure).toHaveText('$0.70');
  await expect(figure).toHaveAttribute('data-measured', 'true');

  const failing = '**/projection/' + OVERVIEW_MONEY + '*';
  await page.route(failing, (route) => route.fulfill({ status: 503, body: 'Service unavailable' }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const notice = page.getByRole('alert').filter({ hasText: 'couldn’t refresh' }).first();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Showing saved data from');
  await expect(figure).toHaveText('$0.70');

  // Recovery clears the notice and keeps the figure.
  await page.unroute(failing);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'couldn’t refresh' })).toHaveCount(0);
  await expect(figure).toHaveText('$0.70');
});

test('AC1 a first read that fails says unavailable and claims no saved data (control)', async ({ page }) => {
  await serveCharts(page);
  await page.route('**/projection/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
  await page.goto('/overview');
  await expect(page.getByRole('alert').filter({ hasText: 'is unavailable' }).first()).toBeVisible();
  await expect(page.getByText('Showing saved data from')).toHaveCount(0);
});

/** Run A's steps answer only when the test releases them; run B has none. */
async function serveRuns(page: Page, gateA?: Promise<void>) {
  await serveCharts(page, { ...chartRows, [DECISIONS]: RUNS, [RUN_TRACE]: STEPS_A });
  await page.route('**/projection/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith(RUN_TRACE)) return route.fallback();
    const run = url.searchParams.get('correlation_id');
    if (run === 'chart-run-a') {
      if (gateA) await gateA;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: STEPS_A, row_count: 2, data_freshness: 'fresh' }) });
    }
    if (run === 'chart-run-b') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [], row_count: 0, data_freshness: 'fresh' }) });
    return route.fallback();
  });
}

test('AC2 a late answer for a run the user has left is dropped', async ({ page }) => {
  let releaseA!: () => void;
  const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
  await serveRuns(page, gateA);
  const isA = (url: string) => url.includes('run-trace.v1') && url.includes('chart-run-a');
  const aAsked = page.waitForRequest((req) => isA(req.url()));
  await page.goto('/workflow?correlation_id=chart-run-a');
  await aAsked;

  // Switch inside the app while run A's steps are still held (a full page load would discard them and prove nothing).
  await page.locator('.local-run-neighbours a[title="chart-run-b"]').click();
  await expect(page).toHaveURL(/correlation_id=chart-run-b/);
  const summary = page.getByRole('region', { name: 'Run summary' });
  await expect(page.getByText('No steps recorded for this run')).toBeVisible();
  await expect(summary.locator('[data-summary-field="Model"] dd')).toContainText('model-beta');

  const aAnswered = page.waitForResponse((res) => isA(res.url()));
  releaseA();
  // The whole answer has arrived, not just its headers.
  await (await aAnswered).finished();
  await expect(async () => {
    await expect(page.getByText('No steps recorded for this run')).toBeVisible();
    await expect(summary.locator('[data-summary-field="Model"] dd')).toContainText('model-beta');
    await expect(page.locator('main').getByText('Provider call')).toHaveCount(0);
    await expect(summary.getByText('model-alpha')).toHaveCount(0);
    await expect(page.getByText('run-trace.v1 answered steps of another run')).toHaveCount(0);
  }).toPass({ timeout: 3000 });

  // Unrecorded phases read Not recorded; a measured 0 stays a value.
  await expect(summary.locator('[data-summary-field="Queue wait"] dd')).toHaveText('Not recorded');
  await expect(summary.locator('[data-summary-field="Execution"] dd')).toHaveText('Not recorded');
  await expect(summary.locator('[data-summary-field="Duration"] dd')).toHaveText('0 ms');
});

test('AC2 the same run read without a switch shows its steps (control)', async ({ page }) => {
  await serveRuns(page);
  await page.goto('/workflow?correlation_id=chart-run-a');
  await expect(page.getByText('Provider call').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('region', { name: 'Run summary' }).locator('[data-summary-field="Model"] dd')).toContainText('model-alpha');
});
