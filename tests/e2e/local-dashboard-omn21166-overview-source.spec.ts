import { test, expect, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: client HTTP hides SQLite backing; reading then falling back masks errors;
// day rows replace all-time, stale/tied baselines win, missing becomes zero, or the source is unnamed.
const overview = prefix + 'cost.savings-overview.v1';
const metering = prefix + 'metering-summary.v1';
const today = new Date().toISOString().slice(0, 10);
const all = { window_kind: 'all', window_start: '', as_of: today + 'T12:00:00Z',
  baseline_model: 'baseline-current', baseline_state: 'resolved', pricing_manifest_version: 'fixture-1',
  spend_usd: '0.0123', savings_usd: '0.002992', savings_pct_of_counterfactual: .42,
  runs_total: 29, runs_measured: 23, runs_unknown_tokens: 4, runs_unknown_spend: 2,
  tokens_in: 5756, tokens_out: 378 };
const day = { ...all, window_kind: 'day', window_start: today,
  spend_usd: '0.0007', savings_usd: '0.0012', runs_total: 5, runs_measured: 3,
  tokens_in: 756, tokens_out: 78 };
const legacy = { window: 'all', captured_at: today + 'T12:00:00Z',
  total_cost_usd: 99, total_savings_usd: 98, measured_run_count: 97, tokens_total: 96 };
const ids = ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'];
const card = (page: Page, id: string) => page.locator(`[data-component="${id}"]`);
const figure = (page: Page, id: string) => card(page, id).locator('.local-dashboard-metric');
async function serve(page: Page, backing: string, rows: unknown[] = [all, day], reason = 'projection_table_missing') {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/projection/')) requests.push(decodeURIComponent(new URL(request.url()).pathname.split('/').at(-1)!)); });
  await serveCharts(page, { ...chartRows, [overview]: [legacy], [metering]: rows });
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(chartRows).map(topic => topic === overview
      ? { topic, status: backing === 'bus' ? 'ok' : 'degraded', backing, bus_backed: backing === 'bus', degraded_reason: reason }
      : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
  await page.goto('/overview');
  return requests;
}
async function totals(page: Page, values: string[]) {
  for (const [i, id] of ids.entries()) await expect(figure(page, id)).toHaveText(values[i]);
}
test('declared local-store absence selects metering before a savings read and restores exact all-time and Today figures', async ({ page }, info) => {
  const requests = await serve(page, 'not_in_local_store');
  await totals(page, ['$0.0123', '$0.0030', '23', '5,756 in · 378 out']);
  for (const id of ids) await expect(card(page, id)).toContainText('Source: metering-summary.v1');
  await expect(card(page, 'overview-savings')).toContainText('42% below the baseline-current baseline (modelled)');
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  await totals(page, ['$0.0007', '$0.0012', '3', '756 in · 78 out']);
  await page.getByRole('radio', { name: 'All time', exact: true }).click();
  await totals(page, ['$0.0123', '$0.0030', '23', '5,756 in · 378 out']);
  expect(requests).toContain(metering); expect(requests).not.toContain(overview);
  await page.screenshot({ path: info.outputPath('declared-sqlite-overview.png'), fullPage: true });
});
test('served savings catalogue retains D1 despite conflicting metering and names the selected source', async ({ page }) => {
  await serve(page, 'bus'); await totals(page, ['$99.0000', '$98.0000', '97', '96']);
  for (const id of ids) await expect(card(page, id)).toContainText('Source: cost.savings-overview.v1');
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  await totals(page, ids.map(() => 'Not measured: daily totals unavailable (UTC)'));
});
test('metering chooses newest all-time and day baseline and refuses ties on all four cards', async ({ page }) => {
  await serve(page, 'not_in_local_store', [{ ...all, baseline_model: 'old', as_of: today + 'T09:00:00Z', spend_usd: 77 }, all, day, { ...day, baseline_model: 'twin' }]);
  await totals(page, ['$0.0123', '$0.0030', '23', '5,756 in · 378 out']);
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  await totals(page, ids.map(() => 'Not measured: 2 baseline models'));
});
test('missing current-day metering never becomes zero, yesterday or legacy savings', async ({ page }) => {
  await serve(page, 'not_in_local_store', [all, { ...day, window_start: '2000-01-01' }]);
  await page.getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  await totals(page, ids.map(() => 'Not measured: daily metering data unavailable (UTC)'));
});
test('metering keeps measured zero and independent missing token or spend values', async ({ page }) => {
  await serve(page, 'not_in_local_store', [{ ...all, spend_usd: 0, savings_usd: null, runs_measured: 0, tokens_in: 0, tokens_out: 0 }]);
  await totals(page, ['$0.00', 'Not measured', '0', '0 in · 0 out']);
});
test('a generic refusal never switches source to mask a producer failure', async ({ page }) => {
  await serve(page, 'not_yet_bus_backed', [all, day], 'producer_not_deployed');
  for (const id of ids) { await expect(card(page, id)).toContainText('Not served'); await expect(card(page, id)).toContainText('Source: cost.savings-overview.v1'); }
});
test('a served savings read error never falls back to metering', async ({ page }) => {
  await page.route('**/projection/**', route => route.continue());
  await serveCharts(page, { ...chartRows, [overview]: [legacy], [metering]: [all, day] });
  await page.route('**/projection/**', route => decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!) === overview
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture producer unavailable' }) }) : route.fallback());
  await page.goto('/overview');
  for (const id of ids) { await expect(card(page, id)).toContainText('503'); await expect(card(page, id)).toContainText('Source: cost.savings-overview.v1'); }
});
