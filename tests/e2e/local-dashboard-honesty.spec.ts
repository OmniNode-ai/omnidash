import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21304: every figure says what it rests on. Each case has a positive control beside it, so a test that passes
// only because the page went blank, or because the notice is always drawn, fails.

// The hosted evidence check gives each bound check 30 s in all, dev server start included, and runs it at the head and
// at the merge base. So each bound check names one short test, and an element the base lacks is waited for 3 s only,
// after an anchor the base also renders: there it must fail, not be killed (OMN-21304, #431).
const MISSING = { timeout: 3000 };

const DECISIONS = prefix + 'delegation.decisions.v1';
const RUN_TRACE = prefix + 'run-trace.v1';
const METERING = prefix + 'metering-summary.v1';
const SUMMARY = prefix + 'delegation.summary.v1';

const hourAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

/** Four runs of one task and one model: two passed, one failed, one with no verdict served. */
function decisions(verdicts: ReadonlyArray<boolean | null>) {
  return verdicts.map((passed, i) => ({
    correlation_id: `honesty-run-${i}`, created_at: hourAgo(i + 1), written_at: hourAgo(i + 1),
    model_name: 'model-a', task_type: 'summarization', quality_gate_passed: passed,
    latency_ms: 500, tokens_input: 10, tokens_output: 5, cost_tier_name: 'local',
  }));
}

const COVERAGE_SCENARIOS = [
  { name: 'one run has no verdict', verdicts: [true, true, false, null], coverage: '3 of 4 runs' },
  { name: 'every run has a verdict (control)', verdicts: [true, true, false, true], coverage: '4 of 4 runs' },
];

for (const scenario of COVERAGE_SCENARIOS) {
  test(`AC3 the Overview pass rate shows its coverage: ${scenario.name}`, async ({ page }) => {
    await serveCharts(page, { ...chartRows, [DECISIONS]: decisions(scenario.verdicts) });
    await page.goto('/');
    const headline = page.locator('section[aria-label="Pass rate trend"]');
    await expect(headline).toContainText('Pass rate');
    await expect(headline).toContainText(scenario.coverage, MISSING);
  });

  test(`AC3 the Runs task and model pass rates show their coverage: ${scenario.name}`, async ({ page }) => {
    await serveCharts(page, { ...chartRows, [DECISIONS]: decisions(scenario.verdicts) });
    await page.goto('/runs');
    await page.getByText('Show run analysis', { exact: true }).click();
    const tasks = page.getByRole('list', { name: 'Tasks' }).getByRole('listitem');
    await expect(tasks).toHaveCount(1);
    await expect(tasks).toContainText(scenario.coverage, MISSING);
    await expect(page.getByRole('list', { name: 'Pass rate by model' }).getByRole('listitem')).toContainText(scenario.coverage, MISSING);
  });
}

test('AC3 a routing step with no recorded reason or candidates says not recorded, and a recorded one shows its value (control)', async ({ page }) => {
  const runId = 'chart-run-a';
  await serveCharts(page, { ...chartRows,
    [RUN_TRACE]: [
      { correlation_id: runId, step_sequence: 1, step_kind: 'request', started_at: hourAgo(2), duration_ms: 1, outcome: 'ok' },
      { correlation_id: runId, step_sequence: 2, step_kind: 'routing_decision', started_at: hourAgo(2), duration_ms: 2, outcome: 'ok', reason: null, candidates: null },
      { correlation_id: runId, step_sequence: 3, step_kind: 'routing_decision', started_at: hourAgo(2), duration_ms: 2, outcome: 'ok', reason: 'cheapest tier passes', candidates: ['model-a', 'model-b'] },
    ],
  });
  await page.goto(`/workflow?correlation_id=${runId}`);
  const steps = page.locator('ol.local-dashboard-steps > li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(1)).toContainText('reason: not recorded', MISSING);
  await expect(steps.nth(1)).toContainText('candidates: not recorded');
  await expect(steps.nth(2)).toContainText('cheapest tier passes');
  await expect(steps.nth(2)).toContainText('candidates: model-a, model-b');
  await expect(steps.nth(2)).not.toContainText('not recorded');
});

const OVERVIEW = prefix + 'cost.savings-overview.v1';

/** The cards' basis line, in view under the figure (OMN-21166 part 9 AC44 replaced the Details fold). */
async function basisOf(page: Page, card: string) {
  const panel = page.locator(`[data-component="${card}"]`);
  await expect(panel.locator('.local-dashboard-metric')).toHaveAttribute('data-measured', 'true');
  const basis = panel.locator('.local-card-basis');
  await expect(basis, `${card} shows its basis`).toBeVisible({ timeout: 3000 });
  return basis;
}

// The default Overview source, cost.savings-overview.v1, serves no baseline model, pricing manifest version or unpriced
// count, so those read not recorded. Its money totals sum measured-provenance rows only, so the estimated and
// unknown-provenance runs are named as what each total leaves out.
for (const scenario of [
  { name: 'two runs of unknown provenance', unknown: 2, expected: 'Not in this total: 1 estimated run, 2 unknown-provenance runs' },
  { name: 'none of unknown provenance (control)', unknown: 0, expected: 'Not in this total: 1 estimated run, 0 unknown-provenance runs' },
]) {
  test(`AC4 spend and savings each name their baseline, pricing version and the runs left out (savings overview): ${scenario.name}`, async ({ page }) => {
    await serveCharts(page, { ...chartRows, [OVERVIEW]: [{ window: 'all', captured_at: hourAgo(0),
      total_cost_usd: 0.25, total_baseline_cost_usd: 1, total_savings_usd: 0.75, tokens_total: 100, run_count: 11,
      measured_run_count: 9, estimated_run_count: 1, unknown_run_count: scenario.unknown }] });
    await page.goto('/');
    for (const card of ['overview-spend', 'overview-savings']) {
      const details = await basisOf(page, card);
      await expect(details).toContainText(scenario.expected);
      await expect(details).toContainText('Baseline model not recorded');
      await expect(details).toContainText('Pricing manifest not recorded');
      await expect(details).toContainText('Unpriced runs not recorded');
    }
    // Spend and savings stay two figures, never one.
    await expect(page.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('$0.25');
    await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$0.75');
  });
}

// With no savings table in the local store the Overview reads metering-summary.v1. The fold classes a run with no token
// counts before it looks at spend, so both classes are named; the one with no token counts is never hidden behind a 0.
for (const scenario of [
  { name: 'two runs with no spend', unpriced: 2, expected: 'Not in this total: 1 run with no token counts, 2 runs with no spend recorded' },
  { name: 'every run with tokens priced (control)', unpriced: 0, expected: 'Not in this total: 1 run with no token counts, 0 runs with no spend recorded' },
]) {
  test(`AC4 spend and savings each name their baseline, pricing version and the runs left out (metering): ${scenario.name}`, async ({ page }) => {
    await serveCharts(page, { ...chartRows, [METERING]: [{
      tenant_id: 'chart-fixture-tenant', window_kind: 'all', window_start: '', as_of: hourAgo(0),
      baseline_model: 'baseline-a', baseline_state: 'resolved', pricing_manifest_version: '7',
      spend_usd: '0.250000', counterfactual_usd: '1.000000', savings_usd: '0.750000', savings_pct_of_counterfactual: 0.75,
      runs_total: 12, runs_measured: 9, runs_unknown_tokens: 1, runs_unknown_spend: scenario.unpriced, tokens_in: 10, tokens_out: 5 }] });
    await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
      Object.keys(chartRows).map(topic => topic === OVERVIEW
        ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
        : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
    await page.goto('/');
    for (const card of ['overview-spend', 'overview-savings']) {
      const details = await basisOf(page, card);
      await expect(details).toContainText(scenario.expected);
      await expect(details).toContainText('Baseline baseline-a');
      await expect(details).toContainText('pricing manifest v7');
    }
    await expect(page.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('$0.25');
    await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$0.75');
  });
}

for (const scenario of [
  { name: 'the summary includes fixture delegations', delegations: 20 as unknown, savings: 1.5 as unknown, notice: 'Includes 20 fixture delegations' },
  { name: 'only fixture savings are served', delegations: 0 as unknown, savings: 1.5 as unknown, notice: 'Includes $1.50 of fixture savings' },
  { name: 'a non-numeric count invents no notice', delegations: true as unknown, savings: {} as unknown, notice: null },
  { name: 'no fixture delegations (control)', delegations: 0 as unknown, savings: 0 as unknown, notice: null },
]) {
  test(`AC4 Evidence names fixture delegations beside the totals they enter: ${scenario.name}`, async ({ page }) => {
    await serveCharts(page, { ...chartRows,
      [SUMMARY]: [{ totalDelegations: 30, qualityGatePassed: 20, qualityGateTotal: 30, qualityGatePassRate: 2 / 3,
        totalSavingsUsd: 7, avgLatencyMs: 100, fixtureDelegations: scenario.delegations, fixtureSavingsUsd: scenario.savings }],
    });
    await page.goto('/delegation-evidence');
    const quality = page.locator('.kpi').filter({ has: page.getByText('Quality pass', { exact: true }) });
    await expect(quality).toContainText('%');
    if (scenario.notice) {
      await expect(quality).toContainText(scenario.notice);
      await expect(page.locator('.kpi').filter({ has: page.getByText('Tokens', { exact: true }) })).toContainText(scenario.notice);
    } else {
      await expect(page.getByText(/fixture (delegation|savings)/i)).toHaveCount(0);
    }
  });
}
