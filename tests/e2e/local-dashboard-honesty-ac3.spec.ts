import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21304 AC3's three falsifier clauses not covered by local-dashboard-honesty.spec.ts. Each behaviour was already
// met on dev before this change, so each test pins it, sits beside a positive control, and fails on a lab mutant.
const MISSING = { timeout: 3000 };

const DECISIONS = prefix + 'delegation.decisions.v1';
const QUALITY = prefix + 'delegation.quality-gate.v1';
const RUN_TRACE = prefix + 'run-trace.v1';

const hourAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

/** Four runs with verdicts but no score or bar recorded: 0 of 4 runs scored. */
const UNSCORED = [true, true, false, true].map((passed, i) => ({
  correlation_id: `ac3-unscored-${i}`, created_at: hourAgo(i + 1), written_at: hourAgo(i + 1),
  model_name: 'model-a', task_type: 'summarization', quality_gate_passed: passed ? 1 : 0,
  actual_score: null, required_bar: null, latency_ms: 500, tokens_input: 10, tokens_output: 5, cost_tier_name: 'local',
}));
const qualityRow = (avgScore: number | null, avgBar: number | null) => [{
  overall_pass_rate: 0.75, total_passed: 3, total_failed: 1, total_checks: 4,
  avg_actual_score: avgScore, avg_required_bar: avgBar,
}];

test('AC3 no scored run: the average score reads not recorded, never a number', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [DECISIONS]: UNSCORED, [QUALITY]: qualityRow(null, null) });
  await page.goto('/');
  const panel = page.locator('section[aria-label="Quality"]');
  await expect(panel).toContainText('Pass rate');
  const average = panel.locator('[data-quality-field="avg_actual_score"] dd');
  await expect(average).toHaveText('Not recorded', MISSING);
  await expect(average).not.toHaveText(/\d/);
});

test('AC3 a served average score shows its value (control)', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [DECISIONS]: UNSCORED, [QUALITY]: qualityRow(0.85, 0.8) });
  await page.goto('/');
  const panel = page.locator('section[aria-label="Quality"]');
  await expect(panel).toContainText('Pass rate');
  await expect(panel.locator('[data-quality-field="avg_actual_score"] dd')).toHaveText('0.85', MISSING);
});

test('AC3 a passed gate reads passed, and nothing on the page says accepted', async ({ page }) => {
  const runId = 'ac3-run-pass';
  await serveCharts(page, { ...chartRows,
    [DECISIONS]: [{ correlation_id: runId, created_at: hourAgo(1), written_at: hourAgo(1), model_name: 'model-a',
      task_type: 'summarization', quality_gate_passed: 1, actual_score: 0.9, required_bar: 0.8, latency_ms: 500,
      tokens_input: 10, tokens_output: 5, cost_tier_name: 'local' }],
    [RUN_TRACE]: [{ correlation_id: runId, step_sequence: 1, step_kind: 'request', started_at: hourAgo(1), duration_ms: 1, outcome: 'ok' }],
  });
  await page.goto(`/workflow?correlation_id=${runId}`);
  await expect(page.locator('body')).toContainText('passed', MISSING);
  await expect(page.locator('body')).not.toContainText(/accepted/i);
});

test('AC3 a routing step served with a null confidence shows no 0%', async ({ page }) => {
  const runId = 'chart-run-a';
  await serveCharts(page, { ...chartRows,
    [RUN_TRACE]: [
      { correlation_id: runId, step_sequence: 1, step_kind: 'request', started_at: hourAgo(2), duration_ms: 1, outcome: 'ok' },
      { correlation_id: runId, step_sequence: 2, step_kind: 'routing_decision', started_at: hourAgo(2), duration_ms: 2, outcome: 'ok',
        reason: 'cheapest tier passes', candidates: ['model-a', 'model-b'], confidence: null },
    ],
  });
  await page.goto(`/workflow?correlation_id=${runId}`);
  const steps = page.locator('ol.local-dashboard-steps > li');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1)).toContainText('cheapest tier passes', MISSING);
  await expect(steps.nth(1)).not.toContainText('0%');
  await expect(steps.nth(1)).not.toContainText(/confidence/i);
});
