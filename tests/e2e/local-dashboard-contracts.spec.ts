import { revealRunFields } from './omn21166-chart-fixtures';
import { chartTabPanel, chooseChartTab } from './chart-tabs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import { pickFilter, expectFilter } from './filter-dropdowns';

// OMN-19981 AC4: no page renders 0 for an unmeasured figure, and the default page renders at 1440x900 with no panel
// cut off. The fixtures are the served shapes read from the lakshman lane on 2026-10-02, including one unmeasured run
// (no baseline, 0 savings, no latency) next to a measured one.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';
// OMN-20225: the quality and tier-mix panels' served exposures.
const QUALITY = 'onex.snapshot.projection.delegation.quality-gate.v1';
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
// OMN-19980 Step B: the Overview Savings total's one source.
const METERING = 'onex.snapshot.projection.metering-summary.v1';

/** A metering-summary.v1 row in omnimarket#3368's served shape: money as decimal text, null when unmeasured. */
function meteringRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 'tenant-fresh-store', window_kind: 'all', window_start: '', window_end: '2026-10-02T10:07:00+00:00',
    as_of: '2026-10-02T10:07:00+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3',
    baseline_state: 'resolved', runs_total: 46, runs_measured: 45, runs_unknown_tokens: 1, runs_unknown_spend: 0,
    tokens_in: 7452, tokens_out: 2392, spend_usd: '0.006860', counterfactual_usd: '1.225260', savings_usd: '1.218400',
    ...overrides,
  };
}

const decisions = [
  {
    correlation_id: 'corr-19981-measured', written_at: '2026-10-02T10:07:00Z', created_at: '2026-10-02T10:07:00Z',
    model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 813,
    tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000',
    tokens_to_compliance: 214, data_source: 'real',
    // OMN-20225: the accepting attempt's backend and host (OMN-20162 columns) and the tier's cost regime.
    backend_id: 'local-heavy-reasoning', host: 'gpu-host-b', cost_tier_type: 'free_local',
  },
  {
    correlation_id: 'corr-19981-unmeasured', written_at: '2026-10-02T10:01:00Z', created_at: '2026-10-02T10:01:00Z',
    model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: null,
    tokens_input: 161, tokens_output: 36, task_type: 'summarization', cost_tier_name: 'local', actual_score: null,
    tokens_to_compliance: null, data_source: 'real',
  },
];

const fixtures: Record<string, unknown[]> = {
  [DECISIONS]: decisions,
  [SAVINGS]: [{
    tenant_id: 'tenant-fresh-store',
    baseline_model: null,
    pricing_manifest_version: '1',
    sessions: [
      {
        session_id: 'corr-19981-measured', created_at: '2026-10-02T10:07:00Z', model_name: 'Qwen3.8-27B',
        prompt_tokens: 162, completion_tokens: 52, local_cost_usd: 0.0011, cloud_cost_usd: 0.000844,
        counterfactual_baseline_usd: 0.000844, baseline_model: 'claude-opus-4-6', savings_usd: 0.000844,
        usage_source: 'measured',
      },
      {
        session_id: 'corr-19981-unmeasured', created_at: '2026-10-02T10:01:00Z', model_name: 'Qwen3.8-27B',
        prompt_tokens: 161, completion_tokens: 36, local_cost_usd: 0.0004, cloud_cost_usd: null,
        counterfactual_baseline_usd: null, baseline_model: null, savings_usd: 0, usage_source: 'measured',
      },
    ],
  }],
  // OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): Overview reads the metering all row; the retired
  // aggregate is served with conflicting figures ($9.99) so a headline cannot silently switch back to it.
  [OVERVIEW]: [{
    window: 'all', captured_at: '2026-10-02T10:07:00Z', tokens_total: 9844, unknown_run_count: 3,
    total_cost_usd: 0.00686, total_savings_usd: 9.9952, total_baseline_cost_usd: 1.2321,
    run_count: 49, measured_run_count: 46, zero_token_run_count: 0,
  }],
  // The all row is the Savings total; the day row is the daily series and must not reach the card.
  [METERING]: [meteringRow({ window_kind: 'day', window_start: '2026-10-02', savings_usd: '0.400000' }), meteringRow()],
  [CREDENTIALS]: [],
  [USAGE]: [],
  // Served values chosen so a figure the browser recomputed from the counts would differ (pass rate 0.875 of 7/8).
  [QUALITY]: [{
    tenant_id: 'tenant-fresh-store', overall_pass_rate: 0.875, total_passed: 7, total_failed: 1, total_checks: 8,
    avg_actual_score: 0.81, avg_required_bar: 0.7,
  }],
  [ROUTING]: [{
    tenant_id: 'tenant-fresh-store',
    by_tier: {
      total_tasks: 9, tier_routed_total: 7, not_tier_routed_count: 2,
      tiers: [
        { cost_tier_name: 'local', count: 5, tier_routed: true, pct_of_tier_routed: .7143 },
        { cost_tier_name: 'cheap_cloud', count: 2, tier_routed: true, pct_of_tier_routed: .2857 },
      ],
    },
  }],
};

async function serveFixtures(page: Page, servedRows: Record<string, unknown[]> = fixtures) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'omnidash.dataSourceOverride.v1',
      JSON.stringify({ mode: 'live', baseUrl: window.location.origin }),
    );
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: Object.keys(servedRows).map((topic) => ({
          topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = servedRows[topic];
    await route.fulfill(rows === undefined
      ? { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }) });
  });
}

/** Every panel's content fits its width, and the page itself never scrolls sideways. */
async function expectNoPanelCutOff(page: Page) {
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    panels: [...document.querySelectorAll<HTMLElement>('.local-dashboard-panel')].map((panel) => ({
      title: panel.querySelector('h2')?.textContent ?? '',
      right: panel.getBoundingClientRect().right,
      overflow: panel.scrollWidth - panel.clientWidth,
    })),
  }));
  expect(layout.panels.length).toBeGreaterThan(0);
  expect(layout.documentWidth).toBeLessThanOrEqual(1440);
  for (const panel of layout.panels) {
    expect(panel.right, panel.title).toBeLessThanOrEqual(1440);
    expect(panel.overflow, panel.title).toBeLessThanOrEqual(0);
  }
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

test('stored basis, excluded counts and modelled baseline survive native Overview and Runs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bases = ['measured', 'estimated', 'unknown', undefined];
  const provenanceDecisions = bases.map((basis, index) => ({
    ...decisions[0], correlation_id: `provenance-${index}`,
    written_at: new Date(Date.UTC(2026, 9, 3, 12, 4 - index)).toISOString(),
  }));
  const provenanceSessions = bases.map((basis, index) => ({
    session_id: `provenance-${index}`, usage_source: basis,
    savings_method: 'must-not-substitute', local_cost_usd: 0.0011,
    cloud_cost_usd: 0.002, savings_usd: 0.0009, baseline_model: 'served-baseline-model',
  }));
  await serveFixtures(page, {
    ...fixtures, [DECISIONS]: provenanceDecisions,
    [SAVINGS]: [{ baseline_model: 'served-baseline-model', pricing_manifest_version: 1, sessions: provenanceSessions }],
    // OMN-19980 Step B: the savings caption is the metering all row's own baseline and manifest; Amendment 2: the
    // excluded counts beside Measured runs are the same row's run classes (no token counts, no spend).
    [METERING]: [meteringRow({ baseline_model: 'served-baseline-model', pricing_manifest_version: '1', savings_usd: '0.000900',
      runs_total: 4, runs_measured: 1, runs_unknown_tokens: 1, runs_unknown_spend: 2 })],
  });
  await page.goto('/');
  // OMN-21166 AC86 (Lakshman 2026-10-25): "Additional runtime metrics" (and its Baseline spend card, the only place the
  // metering row's baseline and "The baseline never ran." note appeared) is deleted from Overview. Since OMN-23330
  // AC1/AC2 the headline reads that metering row, so the Savings card's caption names its baseline and pricing version,
  // and Agent calls names the runs it measured of every run.
  const savingsCard = page.locator('[data-component="overview-savings"]');
  await expect(savingsCard.locator('.local-dashboard-metric')).toBeVisible();
  // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
  expect((await savingsCard.textContent())?.replaceAll('\u2011', '-')).toContain('Baseline served-baseline-model · pricing v1');
  await expect(page.locator('[data-component="overview-measured"]')).toContainText('1 of 4 runs measured');
  await expect(page.locator('[data-component="overview-spend"]')).toContainText('Not counted: 1 run without token counts, 2 runs without spend');
  // OMN-21166 AC86 (Lakshman 2026-10-25): Last run and Recent runs deleted from Overview; the stored basis column is
  // held on Runs below, and Overview keeps the no-cut-off check.
  await expectNoPanelCutOff(page);
  // The metering row's own baseline model is named on Usage (live review 2026-10-25: KPI "Baseline cost").
  await page.getByTestId('nav-local-usage').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Usage' })).toBeVisible();
  await expect(page.getByText('Same tokens at served-baseline-model list price (modelled)')).toHaveCount(1);
  await page.getByTestId('nav-local-overview').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('local-dashboard-provenance-overview-1440x900.png'), fullPage: false });
  for (const route of ['runs']) {
    if (route === 'runs') {
      await page.getByTestId('nav-local-runs').click();
      await expect(page.getByRole('heading', { level: 1, name: 'Runs', exact: true })).toBeVisible();
      await revealRunFields(page);
      await expect(page.locator('table thead th').filter({ hasText: 'Basis' })).toHaveCount(1);
    }
    // Runs is intentionally horizontally scrollable at 1440px; role locators
    // omit clipped headers even though the semantic table cells are rendered.
    // OMN-21015: the Overview now has tables above Recent runs (spend per day, tier mix), so the Basis column is
    // looked up in the table that holds these runs, not across every table on the page.
    const runTable = page.locator('table').filter({ hasText: 'provenance-0' });
    await expect(runTable).toHaveCount(1);
    const headers = await runTable.locator('thead th').allTextContents();
    const basisColumn = headers.indexOf('Basis');
    expect(basisColumn).toBeGreaterThanOrEqual(0);
    for (const [index, basis] of bases.entries()) {
      const row = runTable.locator('tbody tr').filter({ hasText: `provenance-${index}` });
      await expect(row.locator('td').nth(basisColumn)).toHaveText(basis ?? 'Not recorded');
    }
    await expect(page.getByText('must-not-substitute', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/verified/i)).toHaveCount(0);
    await expectNoPanelCutOff(page);
    await page.screenshot({ path: screenshotPath(`local-dashboard-provenance-${route}-1440x900.png`), fullPage: false });
  }
});

test('Overview is the default page and fits 1440x900 with no unmeasured 0 (AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.locator('.local-dashboard-page').evaluate(el => { el.scrollTop = 0; });
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs (its Savings column, the per-run unmeasured row and the Passed/Failed
  // filter buttons) is deleted from Overview; the per-run typed values are held on Runs (AC4 Runs test below). What
  // stays here is the page-wide guard: no unmeasured figure is drawn as 0.
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toHaveCount(0);
  // Keep the page-wide guard. Only explicit chart axes and the separately
  // verified returned-run composition counts may contain a measured zero.
  const zeroNodes = await page.getByText('0', { exact: true }).evaluateAll(nodes => nodes.map(el => ({
    html: el.outerHTML, parent: el.parentElement?.outerHTML.slice(0, 900),
    exempt: !!el.closest('.ins-value-axis, .local-tier-bars-axis, .overview-outcome-legend, figure[aria-label="Duration per run"] .local-chart-canvas svg, figure[aria-label="Tokens per run"] .local-chart-canvas svg'),
  })));
  await test.info().attach('numeric-zero-scope', { body: JSON.stringify(zeroNodes), contentType: 'application/json' });
  expect(zeroNodes.filter(node => !node.exempt)).toEqual([]);
  await expect(page.getByText('$0', { exact: true })).toHaveCount(0);

  // OMN-23330 AC1/AC2: Savings follows the metering all row, never the retired aggregate or a day row.
  const savings = page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: 'Savings', exact: true }) });
  // Metering 1.2184 reads $1.21 (OMN-22168: money from $1 up shows two decimals, cut); never the aggregate's $9.99.
  await expect(savings.getByText('$1.21', { exact: true })).toBeVisible();
  await expect(savings.getByText('$9.99', { exact: true })).toHaveCount(0);
  // OMN-21166 (card basis in a tooltip): the basis line is in the card's tooltip, shown on keyboard focus of the card.
  // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
  await expect(savings).toContainText('Modelled vs');
  await expect(savings.getByText('$0.40', { exact: true })).toHaveCount(0);
  // OMN-23330 AC1/AC2: all four headline tiles follow the same metering all row (45 of 46 runs measured), never the
  // retired aggregate's 49 calls.
  const headline = (title: string) => page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(headline('Actual spend').getByText('$0.0068', { exact: true })).toBeVisible();
  await expect(headline('Agent calls').locator('.local-dashboard-metric')).toHaveText('45');
  await expect(headline('Agent calls').getByText('49', { exact: true })).toHaveCount(0);
  // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
  await expect(headline('Agent calls')).toContainText('45 of 46 runs measured');
  await expect(headline('Tokens processed').getByText('9.84K', { exact: true })).toBeVisible();
  await expect(headline('Tokens processed').getByText(/Not available yet/)).toHaveCount(0);

  // The headline cards sit above the fold, Tokens processed among them (requirement Q3). OMN-21166 AC86 (Lakshman
  // 2026-10-25): the newest run (requirement Q2) is waived and its row is deleted from Overview, so only the five
  // cards are held inside the window. Delegation Quality is the fifth card (live review 2026-10-25).
  for (const title of ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed', 'Delegation Quality']) {
    const bounds = await page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).boundingBox();
    expect(bounds, title).not.toBeNull();
    expect(bounds!.y + bounds!.height, title).toBeLessThanOrEqual(900);
  }
  await expectNoPanelCutOff(page);

  await page.screenshot({ path: screenshotPath('local-dashboard-overview-1440x900.png'), fullPage: false });
});

test('Runs lists every decision with typed unmeasured values at 1440x900 (AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await page.getByTestId('nav-local-runs').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Runs' })).toBeVisible();
  const unmeasured = page.locator('tr').filter({ has: page.getByRole('link', { name: 'corr-19981-unmeasured', exact: true }) });
  await expect(unmeasured).toBeVisible();
  // OMN-19980 AC2b: local cost and the baseline label stay; no per-run baseline price or saving is shown.
  for (const header of ['Baseline cost', 'Savings']) {
    await expect(page.getByRole('columnheader', { name: header, exact: true }), header).toHaveCount(0);
  }
  await expect(unmeasured.getByText('$0.0004', { exact: true })).toBeVisible();
  await expect(unmeasured.getByText('Baseline unresolved')).toHaveCount(0);
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  // OMN-21166 AC63: the Runs summary strip shows the served Failed count; both runs passed, so its 0 is a measured
  // count (the strip's other figures are non-zero). Every other 0 on the page would be an unmeasured value shown as 0.
  const runZeros = await page.getByText('0', { exact: true }).evaluateAll(nodes => nodes.map(el => ({
    html: el.outerHTML, exempt: !!el.closest('article[data-kpi-card="Failed"] .local-dashboard-metric'),
  })));
  expect(runZeros.filter(node => !node.exempt)).toEqual([]);
  // Part 15 AC91: the strip is Overview cards; the Failed card's face is its title and its served 0.
  await expect(page.locator('article[data-kpi-card="Failed"] .local-dashboard-metric')).toHaveText('0');
  await expectNoPanelCutOff(page);
  // OMN-21166 part 18 AC121: the "Run outcomes" donut and its legend (Passed/Failed/Not recorded) are removed from Runs'
  // "More analysis"; the Runs, Pass rate and Failed cards above hold the same figures.
  await expect(page.locator('.overview-outcome-legend button')).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Run outcomes', exact: true })).toHaveCount(0);

  await page.screenshot({ path: screenshotPath('local-dashboard-runs-1440x900.png'), fullPage: false });
});

// OMN-20006: the Usage page at 1440x900. One day and model mixes a measured run (0.25) with an estimated one, so the
// served measured cost is 0.25 beside "1 unmeasured" while cost_usd (9.25) is never shown; another has only an
// unmeasured run, so its cost is Not measured, never $0. The savings series shows metering-summary.v1's day row, never
// the all row (the Overview headline).
test('Usage shows measured cost beside unmeasured runs, never 0 for unmeasured, at 1440x900 (AC1, AC3, AC4, AC-US3)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page, {
    ...fixtures,
    [USAGE]: [
      {
        tenant_id: 'tenant-fresh-store', usage_day: '2026-10-02', model_id: 'Qwen3.8-27B', input_tokens: 162,
        output_tokens: 52, cost_usd: 9.25, measured_cost_usd: 0.25, unmeasured_call_count: 1, call_count: 2,
      },
      {
        tenant_id: 'tenant-fresh-store', usage_day: '2026-10-01', model_id: 'glm-4.6', input_tokens: 161,
        output_tokens: 36, cost_usd: 4, measured_cost_usd: null, unmeasured_call_count: 1, call_count: 1,
      },
    ],
  });
  await page.goto('/');
  await page.getByTestId('nav-local-usage').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Usage' })).toBeVisible();
  // OMN-21166 part 13: the usage-by-model-day records are under "More usage", and the savings day table under "Savings
  // by day as a table".
  // Part 29 AC194: Usage analysis also lists models; these rows are the usage-by-model-day records.
  const records = page.getByRole('table', { name: 'Usage by model and day' });
  const mixed = records.getByRole('row').filter({ hasText: 'Qwen3.8-27B' });
  // OMN-23330 AC10: the day reads in the short form ("Oct 2").
  for (const value of ['Oct 2', '162', '52', '$0.25', '1 unmeasured', '2']) {
    await expect(mixed.getByText(value, { exact: true })).toBeVisible();
  }
  const unmeasured = records.getByRole('row').filter({ hasText: 'glm-4.6' });
  await expect(unmeasured.getByText('Not measured', { exact: true })).toBeVisible();
  await expect(page.getByText(/9\.25/)).toHaveCount(0);
  await expect(page.getByText('$0', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0', { exact: true })).toHaveCount(0);
  // OMN-22168: Savings per day is a tab of "Savings and spend"; its own heading is hidden inside the tab, which names it.
  const savings = await chartTabPanel(page, 'Savings per day');
  const series = savings.getByRole('table', { name: 'Savings per day vs claude-sonnet-5-5' });
  // OMN-23330 AC10: the day reads in the short form ("Oct 2"); the pattern keeps it from matching "Oct 20".
  const day = series.getByRole('row').filter({ hasText: /^Oct 2(?!\d)/ });
  for (const value of ['Oct 2', '$0.40', '46']) await expect(day.getByText(value, { exact: true })).toBeVisible();
  await expect(series.getByRole('row')).toHaveCount(2);
  await expect(savings.getByText('$1.21')).toHaveCount(0);
  await expect(savings.getByText(/Not available yet/)).toHaveCount(0);
  await expectNoPanelCutOff(page);

  await page.screenshot({ path: screenshotPath('local-dashboard-usage-1440x900.png'), fullPage: false });
});

test('Overview and Runs show each run\'s backend, host, tier and score, typed when not recorded (OMN-20225)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs deleted from Overview, so a run's backend, host, tier and score
  // are held on Runs below; Overview no longer lists any run row.
  await expect(page.getByText('Not served (OMN-20162)')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'corr-19981-measured', exact: true })).toHaveCount(0);

  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Runs' })).toBeVisible();
  await revealRunFields(page);
  const run = page.locator('tr').filter({ has: page.getByRole('link', { name: 'corr-19981-measured', exact: true }) });
  for (const value of ['local-heavy-reasoning', 'gpu-host-b', 'Local (free local)']) {
    await expect(run.getByText(value, { exact: true }), value).toBeVisible();
  }
  // The second run carries no backend or host: typed, never blank (moved here from the deleted Overview Recent runs).
  const unmeasuredRun = page.locator('tr').filter({ has: page.getByRole('link', { name: 'corr-19981-unmeasured', exact: true }) });
  const runHeaders = (await page.locator('table thead th').allTextContents()).map((h) => h.trim());
  for (const header of ['Backend', 'Host']) {
    expect(runHeaders.indexOf(header), header).toBeGreaterThanOrEqual(0);
    await expect(unmeasuredRun.getByRole('cell').nth(runHeaders.indexOf(header)), header).toHaveText('Not recorded');
  }
  await expect(page.getByText('Not served (OMN-20162)')).toHaveCount(0);
  await expectNoPanelCutOff(page);
  await page.screenshot({ path: screenshotPath('local-dashboard-runs-backend-1440x900.png'), fullPage: false });
});

test('Overview quality and tier-mix panels show served fields only (OMN-20225 AC3)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');

  // OMN-21166 live review 2026-10-25: Quality is the fifth headline card, "Delegation Quality": its figure is the served
  // overall pass rate (not recomputed from the counts), and the served passed / checked / failed counts are in its hover.
  // OMN-21166 AC86 (Lakshman 2026-10-25): the meter, "More quality detail", the score figures (0.81, 0.7) and the daily
  // pass-rate line are deleted from Overview.
  const quality = page.locator('[data-component="overview-quality"][data-slice="card"]');
  await expect(quality.getByRole('heading', { name: 'Delegation Quality', exact: true })).toBeVisible();
  await expect(quality.locator('.local-dashboard-metric')).toHaveText('87.5%');
  await expect(page.getByRole('meter')).toHaveCount(0);
  // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
  await expect(quality.getByText('7 of 8 runs passed the quality gate', { exact: true })).toBeVisible();
  await expect(quality.getByText('1 failed · deterministic checks', { exact: true })).toBeVisible();
  // OMN-21166 Maple grid/AC64: Overview's Tier mix is ranked bars that print each served share and count, with the
  // not-tier-routed count; the table with the raw served shares (title 0.7143) is Runs' routing breakdown, below.
  // OMN-22168: Tier mix is the fourth tab of Overview's chart panel; the tab names it, its own heading is hidden.
  const tierMix = await chartTabPanel(page, 'Tier mix');
  await expect(tierMix.getByRole('link', { name: 'Local: 5 · 71.4%, measured. Opens Runs filtered to Local', exact: true })).toBeVisible();
  await expect(tierMix.getByRole('link', { name: 'Cheap cloud: 2 · 28.6%, measured. Opens Runs filtered to Cheap cloud', exact: true })).toBeVisible();
  await expect(tierMix.getByText('7 tier-routed · 2 not tier-routed · 9 runs', { exact: true })).toBeVisible();
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs is deleted from Overview; that no panel is cut off is still held.
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toHaveCount(0);
  await expectNoPanelCutOff(page);
  await quality.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath('local-dashboard-overview-panels-1440x900.png'), fullPage: false });
  // The raw served shares and the not-tier-routed count stay in Runs' routing breakdown, under "More analysis".
  await page.goto('/runs');
  // OMN-22168: the routing breakdown is Runs' Tier breakdown tab; its own heading is hidden inside the tab.
  const routing = await chartTabPanel(page, 'Tier breakdown');
  // OMN-21166 part 18 AC120: the table is shown directly; the nested "Full routing breakdown" disclosure is removed.
  await expect(routing.locator('summary').filter({ hasText: 'Full routing breakdown' })).toHaveCount(0);
  for (const value of ['Cheap cloud', '71.4%', '28.6%']) {
    await expect(routing.getByRole('table').getByText(value, { exact: true }), value).toBeVisible();
  }
  await expect(routing.locator('.local-readable[title="0.7143"]').first()).toBeVisible();
  await expect(routing.locator('.local-readable[title="0.2857"]').first()).toBeVisible();
  await expect(routing.getByText('Not tier-routed', { exact: true })).toBeVisible();
});

test('every local page opens in order, names a served exposure, and fits 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // OMN-21166 part 11 (data pass 1): API Keys' identity and access cards read the native local-runtime row of
  // local-environment.v1 (no longer delegation.savings.v1), so that exposure is served for the page to name.
  await serveFixtures(page, { ...fixtures, 'onex.snapshot.projection.local-environment.v1': [{
    tenant_id: 'tenant-fresh-store', mode: 'native', service: 'local-runtime', updated_at: '2026-10-02T10:07:00Z',
    access_mode: 'token', token_minted_at: '2026-10-02T10:00:00Z', rotate_hint: 'onex dashboard --rotate',
  }] });
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Local' });
  await expect(nav.getByRole('link')).toHaveText([
    // OMN-19987: Workflow reads a served exposure now and carries no "partial" chip.
    // OMN-21166 part 26: Settings holds API Keys and Credentials.
    'Overview', 'Runs', 'Workflow', 'Usage', 'Settings',
  ].map((label) => new RegExp(`^${label.replace(' partial', '\\s*partial')}$`)));

  for (const [testId, title] of [
    ['nav-local-workflow', 'Workflow'],
    ['nav-local-usage', 'Usage'],
    ['nav-local-settings', 'Settings'],
  ] as const) {
    await page.getByTestId(testId).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/As of \d+s ago/).first()).toBeVisible();
    await expect(page.getByText('0', { exact: true })).toHaveCount(0);
    await expectNoPanelCutOff(page);
  }
});

test('local panels follow both themes on every page without losing readable surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // OMN-21166 AC86 (Lakshman 2026-10-25): Overview has no Recent runs field view to reveal.
  await page.locator('.local-dashboard-page').evaluate(el => { el.scrollTop = 0; });

  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    for (const [name, title] of [
      // OMN-21166 part 26: Settings holds API Keys and Credentials.
      ['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'], ['usage', 'Usage'], ['settings', 'Settings'],
    ]) {
      await page.getByTestId(`nav-local-${name}`).click();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator('.local-dashboard-panel').first()).toBeVisible();
      // OMN-21166 revision 3 (AC160): on Settings the card is the section; its embedded panels are flat inside it.
      const surfaces = await page.locator('.local-dashboard-panel:not(.local-settings-section .local-dashboard-panel), .local-settings-section').evaluateAll((panels) => {
        const expected = document.createElement('div');
        expected.style.backgroundColor = getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ds-surface').trim(); // the 01+20 card surface (Lakshman 2026-11-03; was --panel)
        // OMN-21166 AC63/live review: the four KPI tiles are --panel with a 7% tint of their own accent, so they are
        // compared channel by channel (within 20/255 of --panel, and opaque); every other panel is exactly --panel.
        const canvas = document.createElement('canvas').getContext('2d')!;
        const rgb = (color: string) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data]; };
        return panels.map((panel) => {
          const background = getComputedStyle(panel).backgroundColor;
          const tile = !!panel.parentElement?.matches('.local-overview-summary');
          const a = rgb(background), b = rgb(expected.style.backgroundColor);
          return {
            title: panel.querySelector('h2')?.textContent,
            background: tile ? (a[3] === 255 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 20) ? 'panel-tint' : background) : background,
            // OMN-21970 AC10 (Lakshman 2026-11-02, "it should be full page"): Settings' sections and panels sit on the page.
            // OMN-22168: a chart drawn inside a tab is flat on the tabbed panel, whose own surface is checked as a panel here.
            expected: tile ? 'panel-tint' : panel.closest('.local-dashboard-page--settings, .local-dashboard-tabpanel') ? 'rgba(0, 0, 0, 0)' : expected.style.backgroundColor,
          };
        });
      });
      expect(surfaces.length).toBeGreaterThan(0);
      for (const surface of surfaces) expect(surface.background, `${theme} ${name} ${surface.title}`).toBe(surface.expected);
      const nested = await page.locator('.overview-chart-row > figure.local-chart, .local-run-charts > figure.local-chart, .workflow-analysis-card').evaluateAll(cards => cards.map(card => {
        const expected = document.createElement('div');
        expected.style.backgroundColor = getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ds-surface').trim(); // the 01+20 card surface (Lakshman 2026-11-03; was --panel)
        const background = getComputedStyle(card).backgroundColor;
        // OMN-21166 live review 2026-10-25: the Maple restyle draws a chart or analysis card flat (transparent) on its
        // panel, whose own --panel surface is checked above; a flat card inside a panel passes, any other colour fails.
        const flat = background === 'rgba(0, 0, 0, 0)' && !!card.closest('.local-dashboard-panel');
        return { title: card.querySelector('h3')?.textContent, background: flat ? expected.style.backgroundColor : background, expected: expected.style.backgroundColor };
      }));
      // OMN-21166 Maple grid: Overview's charts are drawn flat inside their panel (no card of their own), so there is no
      // nested card to colour; each flat chart must sit on a panel whose surface is the checked --panel (above) and
      // add no surface of its own. Runs' nested chart cards keep the --panel surface.
      if (name === 'overview') {
        const flat = await page.locator('.maple-grid figure.local-chart, .maple-grid figure.rb-chart').evaluateAll(figures => figures.map(figure => {
          const expected = document.createElement('div');
          expected.style.backgroundColor = getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ds-surface').trim(); // the 01+20 card surface (Lakshman 2026-11-03; was --panel)
          const background = getComputedStyle(figure).backgroundColor;
          return {
            title: figure.getAttribute('aria-label') ?? figure.querySelector('h3')?.textContent,
            // A flat chart is either transparent on its panel or the same --panel; never a surface of another colour.
            background: background === expected.style.backgroundColor ? 'rgba(0, 0, 0, 0)' : background,
            panelSurface: !!figure.closest('.local-dashboard-panel'),
          };
        }));
        expect(flat.length, 'overview flat-chart positive control').toBeGreaterThan(0);
        for (const chart of flat) {
          expect(chart.panelSurface, `${theme} overview flat chart ${chart.title} sits in a panel`).toBe(true);
          expect(chart.background, `${theme} overview flat chart ${chart.title}`).toBe('rgba(0, 0, 0, 0)');
        }
      } else if (name === 'runs') expect(nested.length, `${name} nested-card positive control`).toBeGreaterThan(0);
      for (const card of nested) expect(card.background, `${theme} ${name} nested ${card.title}`).toBe(card.expected);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expectNoPanelCutOff(page);
    }
    await page.getByTestId('nav-local-overview').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
    await page.screenshot({ path: screenshotPath(`local-dashboard-overview-${theme}-1440x900.png`) });
  }
});

test('Overview and Runs scroll to their last row while the header stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const manyDecisions = Array.from({ length: 26 }, (_, index) => ({
    ...decisions[0], correlation_id: `scroll-run-${String(index).padStart(2, '0')}`,
    written_at: new Date(Date.UTC(2026, 9, 2, 10, 30 - index)).toISOString(),
  }));
  await serveFixtures(page, { ...fixtures, [DECISIONS]: manyDecisions });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs is deleted from Overview, so its last row is no longer the end of
  // the page; the same property (the page scrolls to its last panel while the header stays reachable) is held on the
  // last Overview panel, Tier mix.
  await page.locator('.local-dashboard-page').evaluate(el => { el.scrollTop = 0; });
  const scrollPage = page.locator('.local-dashboard-page');
  await expect.poll(() => scrollPage.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.mouse.move(1100, 650);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => scrollPage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // OMN-22168: Tier mix is a tab of Overview's chart panel, drawn when chosen.
  await chooseChartTab(page, 'Tier mix');
  const lastOverviewPanel = page.locator('[data-component="overview-tier-mix"]');
  await lastOverviewPanel.scrollIntoViewIfNeeded();
  await expect.poll(async () => { const box = await lastOverviewPanel.boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(900);
  expect((await page.getByRole('button', { name: 'Toggle theme', exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual(0);

  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByText('Runs 1–25 of 26')).toBeAttached();
  await page.mouse.move(1100, 650);
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => scrollPage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
  // OMN-20759: the Runs table fits its panel at 1440, so there is nothing to scroll sideways to.
  const table = page.locator('[data-component="recent-runs"] .local-dashboard-table-wrap');
  expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Runs 26–26 of 26')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
  await page.screenshot({ path: screenshotPath('local-dashboard-runs-scroll-1440x900.png') });
});

test('manual Refresh rereads local exposures and preserves the Runs filter', async ({ page }) => {
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/projection/')) reads += 1;
  });
  await serveFixtures(page);
  await page.goto('/');
  // Refresh rereads the metering Overview total.
  const savingsCard = page.locator('.local-dashboard-panel').filter({ has: page.getByRole('heading', { name: 'Savings', exact: true }) });
  // OMN-22168 (Jonah 2026-11-06): money from $1 up shows two decimals, cut, so the metering total 1.2184 reads $1.21.
  await expect(savingsCard.getByText('$1.21', { exact: true })).toBeVisible();
  await page.getByTestId('nav-local-runs').click();
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await pickFilter(page, 'Status', 'passed');
  const before = reads;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads, { timeout: 3000 }).toBeGreaterThan(before);
  await expectFilter(page, 'Status', 'passed');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
});

// Catch dark surfaces/text left in light mode, including hover, collapsed/mobile rails and rename inputs.
test('sidebar surfaces and controls follow the theme in expanded and collapsed layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // OMN-23330 AC22: the page loads lazily; its placeholder shares the title, so read only once it is no longer busy.
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  // OMN-21166 AC86 (Lakshman 2026-10-25): Overview has no Recent runs field view to reveal.
  await page.locator('.local-dashboard-page').evaluate(el => { el.scrollTop = 0; });
  // Compare rendered colors, not equivalent hex/rgb/oklch serializations.
  const token = async (name: string) => page.evaluate((name) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.querySelector('.app')!).getPropertyValue(name).trim();
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, name);
  const expectColor = async (locator: ReturnType<typeof page.locator>, property: string, expected: number[]) => {
    await expect.poll(() => locator.evaluate((el, property) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = getComputedStyle(el).getPropertyValue(property);
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, property)).toEqual(expected);
  };
  const sidebar = page.locator('.sidebar');

  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    // The 01+20 look (Lakshman 2026-11-03): the sidebar sits on the page colour with ink text and ink-3 secondary items
    // (was the --sidebar shell set).
    const background = await token('--ds-page');
    const foreground = await token('--ds-ink');
    const secondary = await token('--ds-ink-3');
    await expectColor(sidebar, 'background-color', background);
    await expectColor(sidebar, 'color', foreground);
    await expectColor(page.getByTestId('nav-local-runs'), 'color', secondary);
    // MVP navigation carries no partial-state chip. Keep an exact positive
    // control on the developer switch's retained separator instead.
    await expectColor(page.locator('.developer-switch'), 'background-color', await token('--sidebar-line'));
    const idleBackground = await page.getByTestId('nav-local-runs').evaluate(el => getComputedStyle(el).backgroundColor);
    await page.getByTestId('nav-local-runs').hover();
    await expect.poll(() => page.getByTestId('nav-local-runs').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(idleBackground);
    await expectColor(page.getByTestId('nav-local-runs'), 'color', foreground);

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      // OMN-21166 part 27 AC173: crossing into phone width folds the sidebar by itself; at desktop width fold it by hand.
      if (width > 1024) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await expect(sidebar).toHaveClass('sidebar collapsed');
      await expectColor(sidebar, 'background-color', background);
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
      await expect(sidebar).toHaveClass('sidebar');
      await expectColor(sidebar, 'background-color', background);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('button', { name: 'New dashboard', exact: true })).toHaveCount(0);
    const developer = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
    await developer.check();
    await expect(page.getByTestId('nav-lab')).toBeVisible();
    await developer.uncheck();
    await page.getByTestId('nav-local-overview').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
  }
});

// Failure modes: state-only navigation, lost deep links/history, malformed filters, stale pagination and unknown paths.
test('local pages have real links, canonical URLs and survive direct opens and reloads', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/overview$/);
  // OMN-21166 part 26: Settings holds API Keys and Credentials.
  await expect(page.getByRole('navigation', { name: 'Local' }).getByRole('link')).toHaveCount(5);
  for (const [path, title] of [
    ['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'], ['usage', 'Usage'], ['settings', 'Settings'],
  ]) {
    const link = page.getByTestId(`nav-local-${path}`);
    await expect(link).toHaveAttribute('href', `/${path}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  }
  await page.goto('/runs/');
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Runs', exact: true })).toBeVisible();
});

test('Runs URL preserves filters and pagination through reload and Back/Forward', async ({ page }) => {
  const model = 'route/model with spaces';
  const many = Array.from({ length: 60 }, (_, index) => ({
    ...decisions[0], correlation_id: `route-run-${index}`, model_name: model,
    quality_gate_passed: index >= 34, quality_gate_detail: index >= 34 ? 'completed' : 'provider timeout',
    written_at: new Date(Date.UTC(2026, 9, 2, 10, 59 - index)).toISOString(),
  }));
  await serveFixtures(page, { ...fixtures, [DECISIONS]: many });
  await page.goto(`/runs?status=failed&model=${encodeURIComponent(model)}&page=2`);
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await expectFilter(page, 'Status', 'failed');
  await expectFilter(page, 'Model', model);
  await page.reload();
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await page.getByTestId('nav-local-overview').click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goBack();
  await expect(page.getByText('Runs 26–34 of 34')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('Runs 1–25 of 34')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await pickFilter(page, 'Status', 'passed');
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('status')).toBe('passed');
  await page.goBack();
  await expectFilter(page, 'Status', 'failed');
  await expect(page.getByText('Runs 1–25 of 34')).toBeVisible();
  await page.goForward();
  await expectFilter(page, 'Status', 'passed');
  await expect(page.getByText('Runs 1–25 of 26')).toBeVisible();
});

test('bad URL values stay usable, absent models are explicit and unknown pages recover', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/runs?status=bad&window=yesterday&page=-3');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await expectFilter(page, 'Status', 'all');
  await expectFilter(page, 'Window', 'all');
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto('/runs?page=9999');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto('/runs?model=absent-model&cause=absent-cause');
  await expectFilter(page, 'Model', 'absent-model');
  await expectFilter(page, 'Cause', 'absent-cause');
  await expect(page.getByText('No runs match these filters')).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByTestId('nav-local-overview')).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Go to Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
});

// Failure modes observed in Chrome: transparent selected row, no hover on selected rows,
// square targets, invisible keyboard focus, and a breadcrumb stuck on Dashboards.
test('navigation selection, hover and keyboard focus remain distinct in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveFixtures(page);
  await page.goto('/overview');
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    for (const path of ['overview', 'runs', 'workflow', 'usage', 'settings']) {
      const selected = page.getByTestId(`nav-local-${path}`);
      await selected.click();
      await page.mouse.move(700, 60);
      await expect(selected).toHaveAttribute('aria-current', 'page');
      await expect(selected).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(selected).toHaveCSS('border-radius', '8px'); // the 01+20 control radius (was 7px)
      const selectedBackground = await selected.evaluate(el => {
        const color = document.createElement('div');
        color.style.backgroundColor = getComputedStyle(el).getPropertyValue('--ds-surface-2').trim();
        return color.style.backgroundColor;
      });
      await expect(selected).toHaveCSS('background-color', selectedBackground);
      await selected.hover();
      await expect(selected).toHaveCSS('background-color', selectedBackground);
      const other = page.getByTestId(path === 'overview' ? 'nav-local-runs' : 'nav-local-overview');
      await page.mouse.move(700, 60);
      const resting = await other.evaluate(el => getComputedStyle(el).backgroundColor);
      await other.hover();
      await expect(other).not.toHaveCSS('background-color', resting);
      await expect(other).not.toHaveAttribute('aria-current', 'page');
      await other.focus();
      await other.press('Tab');
      const focused = page.locator('.sidebar :focus-visible');
      await expect(focused).toHaveCount(1);
      await expect(focused).toHaveCSS('outline-style', 'solid');
      await expect(focused).toHaveCSS('outline-width', '2px');
    }
    await page.getByTestId('nav-local-overview').click();
    await page.mouse.move(700, 60);
    await page.screenshot({ path: screenshotPath(`local-dashboard-navigation-${theme}-1440x900.png`) });
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expect(page.getByTestId('nav-local-overview')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  }
});

test('breadcrumbs describe the actual page through navigation and direct URLs', async ({ page }) => {
  await serveFixtures(page);
  for (const [path, title] of [['overview', 'Overview'], ['runs', 'Runs'], ['workflow', 'Workflow'], ['usage', 'Usage'], ['settings', 'Settings']]) {
    await page.goto(`/${path}`);
    await expect(page.locator('.breadcrumbs .cur')).toHaveText(title);
  }
  // OMN-21166 part 26 AC155: the retired addresses name no page.
  for (const path of ['api-keys', 'credentials']) {
    await page.goto(`/${path}`);
    await expect(page.locator('.breadcrumbs .cur')).toHaveText('Page not found');
  }
  await page.goto('/no-such-page');
  await expect(page.locator('.breadcrumbs .cur')).toHaveText('Page not found');
});

// OMN-21166 defers creation; legacy layouts remain available through explicit links.
test('MVP navigation defers dashboard creation and highlights only the visible page', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/overview');
  await expect(page.getByRole('button', { name: 'New dashboard', exact: true })).toHaveCount(0);
  await expect(page.locator('.sidebar .dash-item.active')).toHaveCount(1);
  await page.getByTestId('nav-local-runs').click();
  await expect(page.locator('.sidebar .dash-item.active')).toHaveCount(1);
  await expect(page.getByTestId('nav-local-runs')).toHaveAttribute('aria-current', 'page');
  await page.goto('/dashboard');
  await expect(page.locator('.breadcrumbs .cur')).toHaveText('Dashboards');
  await page.getByTestId('nav-local-overview').click();
  await expect(page.locator('.sidebar .dash-item.active')).toHaveCount(1);
});

// The live Chrome pass showed raw, square select controls and an unnecessary scrollbar in the empty list.
test('Runs filters, pagination and table hover use readable themed controls', async ({ page }) => {
  await serveFixtures(page);
  await page.goto('/runs');
  await expect(page.getByText('Runs 1–2 of 2')).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    // OMN-22168 (Lakshman 2026-11-04): the seven filters are the kit Dropdown, each a pill with its own glyph.
    const selects = page.locator('.local-dashboard-filters .ds-dropdown-trigger');
    // Status, Cause, Model, Window, and since OMN-21015 AC8 Backend. OMN-21166 Maple grid: the task chips became a
    // sixth filter, Task; part 23 AC145 added a seventh, Tier.
    await expect(selects).toHaveCount(7);
    for (const select of await selects.all()) {
      // OMN-21166 part 28 AC181: the toolbar's filters keep the 40px touch target; since OMN-22168 they are pills.
      await expect(select).toHaveCSS('border-radius', '999px');
      await expect(select).toHaveCSS('min-height', '40px');
      await expect(select).toHaveCSS('border-top-style', 'solid');
    }
    const previous = page.getByRole('button', { name: 'Previous page', exact: true });
    await expect(previous).toBeDisabled();
    await expect(previous).toHaveCSS('opacity', '0.45');
    await expect(previous).toHaveCSS('border-radius', '8px');
    const row = page.locator('.local-dashboard-table-wrap tbody tr').first();
    await page.mouse.move(1000, 70);
    const rest = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await row.hover();
    await expect(row).not.toHaveCSS('background-color', rest);
    await page.screenshot({ path: screenshotPath(`local-dashboard-controls-${theme}-1440x900.png`) });
  }
});

test('short sidebar windows scroll navigation without a cramped empty-list scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 632 });
  await serveFixtures(page);
  await page.goto('/overview');
  const emptyList = page.locator('.dash-list');
  await expect(emptyList).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).check();
  await page.setViewportSize({ width: 1440, height: 500 });
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveCSS('overflow-y', 'auto');
  await page.getByTestId('nav-lab').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('nav-lab')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeInViewport();
});
