import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 9 AC47: under Tokens processed, input and output come only from fields the Overview aggregate itself
// serves for the same row as its total. A direction the aggregate does not serve reads Not measured, and nothing is
// borrowed from delegation.token-usage, which counts a different population. Behaviour already on dev, so each case
// pins it beside a control and fails on a lab mutant.
const MISSING = { timeout: 3000 };

const OVERVIEW = prefix + 'cost.savings-overview.v1';
const METERING = prefix + 'metering-summary.v1';
const TOKEN_USAGE = prefix + 'delegation.token-usage.v1';

const now = () => new Date().toISOString();

/** A token-usage row whose counts must never appear under Tokens processed: 7,771 in and 3,331 out. */
const INCOMPATIBLE_USAGE = [{ tokens_input: 7771, tokens_output: 3331, total_tokens: 11102, prompt_tokens: 7771,
  completion_tokens: 3331, delegation_count: 4 }];

// cost.savings-overview.v1 serves the directions as tokens_input_total and tokens_output_total (omnimarket#4341);
// omnidash#462 moved the card onto those names, so the fixture serves them too (the 10-25 closer found this control
// serving the old names and failing on dev b101e493).
function overviewRow(directions: { tokens_input_total?: number; tokens_output_total?: number }) {
  return [{ window: 'all', captured_at: now(), total_cost_usd: 0.25, total_baseline_cost_usd: 1, total_savings_usd: 0.75,
    tokens_total: 120, run_count: 3, measured_run_count: 3, estimated_run_count: 0, unknown_run_count: 0, ...directions }];
}

async function tokenDirections(page: Page) {
  const card = page.locator('[data-component="overview-tokens"]');
  await expect(card.locator('.local-dashboard-metric')).toBeVisible();
  return { card, directions: card.locator('.local-token-direction') };
}

test('AC47 the aggregate serves a total but no directions: both read Not measured, none borrowed from token-usage', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW]: overviewRow({}), [TOKEN_USAGE]: INCOMPATIBLE_USAGE });
  await page.goto('/');
  const { card, directions } = await tokenDirections(page);
  await expect(card.locator('.local-dashboard-metric')).toHaveText('120');
  await expect(directions).toHaveCount(2);
  await expect(directions.nth(0)).toHaveText('Not measured', MISSING);
  await expect(directions.nth(1)).toHaveText('Not measured');
  await expect(card).not.toContainText(/7,?771|3,?331/);
});

test('AC47 the aggregate serves its directions: each shows its own value (control)', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW]: overviewRow({ tokens_input_total: 100, tokens_output_total: 20 }),
    [TOKEN_USAGE]: INCOMPATIBLE_USAGE });
  await page.goto('/');
  const { card, directions } = await tokenDirections(page);
  await expect(directions.nth(0)).toHaveText('100', MISSING);
  await expect(directions.nth(1)).toHaveText('20');
  await expect(card).not.toContainText(/7,?771|3,?331/);
});

test('AC47 the metering aggregate serves no directions: both read Not measured, none borrowed from token-usage', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW]: [], [TOKEN_USAGE]: INCOMPATIBLE_USAGE, [METERING]: [{
    tenant_id: 'chart-fixture-tenant', window_kind: 'all', window_start: '', as_of: now(), baseline_model: 'baseline-a',
    baseline_state: 'resolved', pricing_manifest_version: '7', spend_usd: '0.250000', counterfactual_usd: '1.000000',
    savings_usd: '0.750000', savings_pct_of_counterfactual: 0.75, runs_total: 3, runs_measured: 3, runs_unknown_tokens: 0,
    runs_unknown_spend: 0 }] });
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(chartRows).concat(TOKEN_USAGE).map(topic => topic === OVERVIEW
      ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
      : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
  await page.goto('/');
  const { card } = await tokenDirections(page);
  // OMN-21166 live review 2026-10-25: on the metering path the headline card shows its figure only; its input and output
  // directions are one line in the card's hover ("<in> in · <out> out"), shown on keyboard focus of the card. The row
  // serves neither tokens_in nor tokens_out, so each reads "Not recorded", and nothing is borrowed from token-usage.
  // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
  await expect(card.getByText('Not recorded in · Not recorded out', { exact: true })).toBeVisible(MISSING);
  await expect(card.locator('.local-token-direction')).toHaveCount(0);
  await expect(card).not.toContainText(/7,?771|3,?331/);
});
