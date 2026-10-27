import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 AC37 (one number everywhere). One served response set for both pages. The views behind
// Delegation Evidence's old cards (delegation.savings.v1, delegation.summary.v1, delegation.token-usage.v1)
// deliberately disagree with cost.savings-overview.v1 here, as they did on the dev lane on 2026-10-20 15:42Z
// ($1,030.76 vs $952.29 vs $951.72; 54,228 runs vs 46,241 measured vs 54,225 events). A page that reads its
// own view instead of the one shared field shows a different headline and fails.
const RUN = 'one-number-run-a';
const overview = {
  window: 'all', captured_at: '2026-10-20T15:14:51Z', total_cost_usd: 3.39, total_savings_usd: 1030.76,
  total_baseline_cost_usd: 1034.15, tokens_total: 287200000, run_count: 54228, measured_run_count: 46241, estimated_run_count: 0, unknown_run_count: 7987,
};
const rows: Record<string, unknown[]> = {
  ...chartRows,
  [prefix + 'cost.savings-overview.v1']: [overview],
  [prefix + 'delegation.savings.v1']: [{
    cumulative_savings_usd: 951.72, cumulative_local_cost_usd: 3.39, cumulative_cloud_cost_usd: 955.11,
    baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '7', session_count: 54225, sessions: [],
  }],
  [prefix + 'delegation.summary.v1']: [{
    totalDelegations: 54225, qualityGatePassRate: 0.9, qualityGatePassed: 100, qualityGateTotal: 111,
    totalSavingsUsd: 952.29, avgLatencyMs: 1200,
  }],
  [prefix + 'delegation.token-usage.v1']: [{
    total_tokens: 190842392, total_prompt_tokens: 150000000, total_completion_tokens: 40842392,
    total_estimated_cost_usd: 3.39, by_model: [],
  }],
  [prefix + 'delegation.decisions.v1']: [{
    id: 1, correlation_id: RUN, created_at: '2026-10-20T15:10:00Z', written_at: '2026-10-20T15:10:00Z',
    task_type: 'summarization', model_name: 'glm-5.3', quality_gate_passed: true, quality_gate_detail: 'completed',
    latency_ms: 900, tokens_input: 1200, tokens_output: 300, tokens_to_compliance: 1500, backend_id: 'harness',
    cost_tier_name: 'harness', cost_usd: 0, modelled_savings_usd: '0.012345', savings_measurement: 'measured',
    savings_baseline_model: 'claude-sonnet-5-5', data_source: 'live',
  }],
  // The run's own trace carries the legacy event saving (0), the figure Evidence used to show per run.
  [prefix + 'delegation.correlation-trace.v1']: [{
    id: 1, correlation_id: RUN, task_type: 'summarization', model_name: 'glm-5.3', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 900, tokens_input: 1200, tokens_output: 300, cost_usd: 0,
    cost_savings_usd: 0, routing_rule: null, prompt_text: null, response_text: null, created_at: '2026-10-20T15:10:00Z',
  }],
};

const amount = (text: string) => Number(text.replace(/[$,\s]/g, ''));

async function overviewFigure(page: Page, component: string) {
  const figure = page.locator(`[data-component="${component}"] .local-dashboard-metric`).first();
  // A cold Vite dev server compiles the page on first request; on a loaded lab that can exceed the default 5 s.
  await expect(figure).toBeVisible({ timeout: 20_000 });
  return (await figure.textContent()) ?? '';
}

async function evidenceKpi(page: Page, label: string) {
  // OMN-21166 part 15 AC91: Evidence's headline figures are Overview cards (article[data-kpi-card]); a card's caption is in
  // its tooltip, which stays in the page (it is the info button's accessible description).
  const card = page.locator(`.ev-root article[data-kpi-card="${label}"]`);
  await expect(card).toHaveCount(1);
  return { value: (await card.locator('.local-dashboard-metric').textContent()) ?? '', sub: (await card.locator('[role="tooltip"]').textContent()) ?? '' };
}

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('Overview and Delegation Evidence show one savings, tokens and runs figure from one served field', async ({ page }, info) => {
  await serveCharts(page, rows);

  await page.goto('/');
  const overviewSavings = await overviewFigure(page, 'overview-savings');
  const overviewTokens = await overviewFigure(page, 'overview-tokens');
  const overviewRuns = await overviewFigure(page, 'overview-measured');
  await expect(page.locator('[data-component="overview-measured"]')).toContainText('46.24K measured');
  await page.screenshot({ path: info.outputPath('overview.png') });

  await page.goto('/delegation-evidence');
  const evidenceSavings = await evidenceKpi(page, 'Savings (modelled)');
  const evidenceTokens = await evidenceKpi(page, 'Tokens');
  const evidenceRuns = await evidenceKpi(page, 'Delegations');
  await page.screenshot({ path: info.outputPath('evidence.png') });

  // Each concept: both pages equal, and equal to the shared served field.
  expect([amount(overviewSavings), amount(evidenceSavings.value)]).toEqual([1030.76, 1030.76]);
  expect([overviewTokens, evidenceTokens.value]).toEqual(['287.2M', '287.2M']);
  expect([overviewRuns, evidenceRuns.value]).toEqual(['54.22K', '54.22K']);
  // The second population is a labelled breakdown, never a second headline.
  expect(evidenceRuns.sub).toContain('46.24K measured');
  // No other savings total appears anywhere on Evidence: not the savings view's, not the summary's.
  const evidenceText = (await page.locator('.ev-root').textContent()) ?? '';
  expect(evidenceText).not.toMatch(/951\.72|952\.29/);
  await expect(page.locator('[data-panel-title="SAVINGS vs CLOUD BASELINE"] .ev-savings-hero')).toContainText('$1,030.76');
});

test('a run shows one modelled saving on Delegation Evidence and on Runs', async ({ page }) => {
  await serveCharts(page, rows);

  await page.goto('/delegation-evidence');
  const selected = page.locator('[data-panel-title="SELECTED RUN"]');
  await expect(selected.locator('.kv')).toContainText(RUN);
  const evidenceSaving = selected.locator('.kv > div', { has: page.locator('.k', { hasText: 'Savings (modelled)' }) });
  await expect(evidenceSaving.locator('.v')).toContainText('$0.01');

  await page.goto('/runs');
  await expect(page.locator('table').first()).toContainText('$0.01 vs claude-sonnet-5-5');
});
