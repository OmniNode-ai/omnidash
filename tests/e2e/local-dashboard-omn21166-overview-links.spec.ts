import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 19 (AC133-AC136) and part 23 (AC145). Failure modes declared before code:
//   P1  a change line computed against a previous window the served rows do not cover, or a zero previous value shown
//       as an infinite or 100% change; a line on All, Today or a calendar day (AC133);
//   P2  a card click that does not open its page, or an info button that navigates instead of showing its details (AC134);
//   P3  a bar that opens Runs with another model or tier, or a link for a name the rows do not carry (AC135);
//   P4  a window lost on reload or a shared link, or a malformed address that breaks the page instead of falling back
//       to All and correcting itself (AC136);
//   P5  a tier filter that lets a run of another tier (or no tier) through, does not reach the address, or survives
//       Clear filters (AC145).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const DAY = 86_400_000;
const day = (ago: number) => new Date(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - ago * DAY).toISOString().slice(0, 10);
const meteringTopic = prefix + 'metering-summary.v1';
const decisionsTopic = prefix + 'delegation.decisions.v1';
const routingTopic = prefix + 'delegation.model-routing.v1';
const base = { tenant_id: 'links-tenant', as_of: new Date().toISOString(), baseline_model: 'baseline-a', baseline_state: 'resolved', pricing_manifest_version: 'p1' };
/** Fourteen served days: the last seven cost and process twice as much as... see each field. */
const dayRows = Array.from({ length: 14 }, (_, ago) => ({ ...base, window_kind: 'day', window_start: day(ago),
  spend_usd: ago < 7 ? '0.200000' : '0.100000', // current 1.40 vs previous 0.70: +100%
  savings_usd: ago < 7 ? '0.050000' : '0.000000', // previous 0: "New this period"
  counterfactual_usd: '1.000000', runs_total: ago < 7 ? 10 : 7, runs_measured: ago < 7 ? 10 : 7, runs_unknown_tokens: 0, runs_unknown_spend: 0,
  tokens_in: ago < 7 ? 100 : 200, tokens_out: ago < 7 ? 50 : 100, // current 1,050 vs previous 2,100: -50%
}));
const allRow = { ...base, window_kind: 'all', window_start: '', spend_usd: '2.100000', savings_usd: '0.350000', counterfactual_usd: '14.000000',
  runs_total: 119, runs_measured: 119, runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 2100, tokens_out: 1050 };
const decision = chartRows[decisionsTopic][0] as Record<string, unknown>;
/** Last 7 days: 8 of 10 passed (80%); the 7 before: 6 of 10 (60%): +20.0 pts. */
const decisions = Array.from({ length: 20 }, (_, index) => {
  const ago = index < 10 ? index % 7 : 7 + (index % 7);
  const at = new Date(Date.parse(`${day(ago)}T12:00:00Z`)).toISOString();
  const passed = index < 10 ? index < 8 : index < 16;
  return { ...decision, correlation_id: `links-${index}`, created_at: at, written_at: at, quality_gate_passed: passed,
    model_name: index % 2 === 0 ? 'qwen/qwen3.8-coder-480b-a35b-instruct' : 'model-b', cost_tier_name: index % 3 === 0 ? 'cheap_cloud' : index % 5 === 0 ? null : 'local' };
});
const routing = [{ total_delegations: 20,
  by_model: [{ model_name: 'qwen/qwen3.8-coder-480b-a35b-instruct', total_count: 10, pct_of_total: 0.5 }, { model_name: 'model-b', total_count: 10, pct_of_total: 0.5 }, { model_name: null, total_count: 0, pct_of_total: 0 }],
  by_tier: { total_tasks: 20, tier_routed_total: 18, not_tier_routed_count: 2, tiers: [
    { cost_tier_name: 'local', count: 11, tier_routed: true, pct_of_tier_routed: 0.61 }, { cost_tier_name: 'cheap_cloud', count: 7, tier_routed: true, pct_of_tier_routed: 0.39 }] } }];

/** The metering source: the catalogue says the old aggregate has no table in the local store (as overview-source.spec). */
async function serveMetering(page: Page, metering: unknown[] = [allRow, ...dayRows]) {
  const rows: Record<string, unknown[]> = { ...chartRows, [meteringTopic]: metering, [decisionsTopic]: decisions, [routingTopic]: routing };
  await serveCharts(page, rows);
  const legacy = prefix + 'cost.savings-overview.v1';
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(rows).map(topic => topic === legacy
      ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
      : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
}
const windows = (page: Page) => page.getByRole('radiogroup', { name: 'Figures for', exact: true });
const change = (page: Page, id: string) => page.locator(`[data-component="${id}"] .local-card-change`);

test('AC133 a 7-day window shows each card against the previous 7 days; All shows no line', async ({ page }) => {
  await serveMetering(page);
  await page.goto('/overview');
  await expect(page.locator('.local-card-change')).toHaveCount(0);
  await windows(page).getByRole('radio', { name: 'Last 7 days (UTC)', exact: true }).click();
  await expect(change(page, 'overview-spend')).toHaveText('+100% vs previous 7 days');
  await expect(change(page, 'overview-savings')).toHaveText('New this period');
  await expect(change(page, 'overview-tokens')).toHaveText('−50% vs previous 7 days');
  await expect(change(page, 'overview-measured')).toHaveText(/^\+43% vs previous 7 days$/);
  await expect(change(page, 'overview-quality')).toHaveText('Last 7 days: +20.0 pts vs previous 7 days');
  await windows(page).getByRole('radio', { name: 'Today (UTC)', exact: true }).click();
  await expect(page.locator('.local-card-change')).toHaveCount(0);
});

test('AC133 rows that do not reach back over the previous window read "No earlier data", never a percentage', async ({ page }) => {
  await serveMetering(page);
  await page.goto('/overview');
  // 15 days needs rows back 30 days; only 14 are served.
  await windows(page).getByRole('radio', { name: 'Last 15 days (UTC)', exact: true }).click();
  for (const id of ['overview-spend', 'overview-savings', 'overview-tokens', 'overview-measured', 'overview-quality']) {
    await expect(change(page, id), id).toHaveText('No earlier data');
  }
  await expect(page.locator('.local-card-change')).not.toContainText(['%']);
});

test('AC134 each card opens its page, and its info button shows details without navigating', async ({ page }) => {
  await serveMetering(page);
  for (const [id, path, name] of [['overview-spend', '/usage', 'Actual spend: open Usage'], ['overview-measured', '/runs', /: open Runs$/],
    ['overview-quality', '/delegation-evidence', 'Delegation Quality: open Delegation Evidence']] as const) {
    await page.goto('/overview');
    const link = page.locator(`[data-component="${id}"] a.local-card-link`);
    await expect(link).toHaveAccessibleName(name);
    // The link is stretched over the card, so a click anywhere on the card lands on it.
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await page.goto('/overview');
  const info = page.locator('[data-component="overview-spend"] .local-card-info');
  await info.click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.locator('[data-component="overview-spend"] [role="tooltip"]')).toBeVisible();
});

test('AC135 a model or tier bar opens Runs filtered to it; an unnamed model opens nothing', async ({ page }) => {
  await serveMetering(page);
  await page.goto('/overview');
  const modelLink = page.locator('.local-model-usage a.rb-link', { hasText: 'qwen/qwen3.8-coder-480b-a35b-instruct' });
  await expect(modelLink).toHaveAccessibleName(/Opens Runs filtered to qwen\/qwen3\.8-coder-480b-a35b-instruct$/);
  await expect(page.locator('.local-model-usage [data-ranked-item]', { hasText: 'Not recorded' }).locator('a')).toHaveCount(0);
  // A keyboard reaches the bar's link (it takes no box of its own, which must not cost it focus), and focus shows its value.
  await modelLink.focus();
  await expect(modelLink).toBeFocused();
  await expect(modelLink.locator('.rb-value')).toHaveCSS('visibility', 'visible');
  // The link takes no box of its own (display: contents); a click on the bar's name lands on it.
  await modelLink.locator('.rb-name').click();
  await expect(page).toHaveURL(/\/runs\?model=qwen%2Fqwen3\.8-coder-480b-a35b-instruct$/);
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('qwen/qwen3.8-coder-480b-a35b-instruct');
  await page.goto('/overview');
  await page.locator('section[aria-label="Tier mix"] a.rb-link', { hasText: 'Cheap cloud' }).locator('.rb-name').click();
  await expect(page).toHaveURL(/\/runs\?tier=cheap_cloud$/);
  await expect(page.getByLabel('Tier', { exact: true })).toHaveValue('cheap_cloud');
});

test('AC145 the Runs tier filter keeps only that tier, lives in the address and clears', async ({ page }) => {
  await serveMetering(page);
  await page.goto('/runs?tier=local');
  const expected = decisions.filter(row => row.cost_tier_name === 'local').length;
  await expect(page.getByLabel('Tier', { exact: true })).toHaveValue('local');
  await expect(page.locator('[data-component="recent-runs"] tbody tr')).toHaveCount(expected);
  await page.getByLabel('Tier', { exact: true }).selectOption('cheap_cloud');
  await expect(page).toHaveURL(/tier=cheap_cloud/);
  await expect(page.locator('[data-component="recent-runs"] tbody tr')).toHaveCount(decisions.filter(row => row.cost_tier_name === 'cheap_cloud').length);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).not.toHaveURL(/tier=/);
  await expect(page.locator('[data-component="recent-runs"] tbody tr')).toHaveCount(decisions.length);
});

test('AC136 the window lives in the address, survives reload and a shared link, and a malformed one corrects to All', async ({ page }) => {
  await serveMetering(page);
  await page.goto('/overview');
  await windows(page).getByRole('radio', { name: 'Last 30 days (UTC)', exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?window=30d$/);
  await page.reload();
  await expect(windows(page).getByRole('radio', { name: 'Last 30 days (UTC)', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/overview?window=7d');
  await expect(windows(page).getByRole('radio', { name: 'Last 7 days (UTC)', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-slice="runs"] button.gdb-day')).toHaveCount(7);
  await page.goto(`/overview?day=${day(3)}`);
  await expect(page.locator('[data-slice="runs"] button.gdb-day')).toHaveCount(1);
  for (const bad of ['window=bogus', 'day=2026-02-30', `window=7d&day=${day(1)}`]) {
    await page.goto(`/overview?${bad}`);
    await expect(page, bad).toHaveURL(/\/overview$/);
    await expect(windows(page).getByRole('radio', { name: 'All time', exact: true }), bad).toHaveAttribute('aria-checked', 'true');
  }
});
