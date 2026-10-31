import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-19787 AC-3: Delegation Evidence shows every class of the latest acceptance-eval run with its false-pass bound.
// The served page carries an older run too (the exposure orders by observed_at over every run), so the panel's row
// count must equal the distinct classes of the newest run only.
const TOPIC = prefix + 'delegation.acceptance-eval.v1';
const base = {
  stratum: 'all', arm: 'recorded', gate_version: 'gate-v3', accepted_n: 114, false_pass_count: 40,
  false_pass_rate: 0.35, false_pass_line_verdict: 'missed', false_pass_required_n: 100, refused_n: 20,
  false_refusal_count: 3, false_refusal_upper_bound: 0.3, false_refusal_line_verdict: 'refused',
  undetermined_share: 0.05, flip_rate: null,
};
const latest = ['code_generation', 'code_review', 'document', 'planning', 'test'].map((task_class, i) => ({
  ...base, eval_run_id: 'run-new', task_class, observed_at: '2026-10-30T10:00:00Z', false_pass_upper_bound: 0.1 * (i + 1),
}));
const rows = [
  ...latest,
  { ...latest[1], stratum: 'accepted' },
  { ...base, eval_run_id: 'run-old', task_class: 'research', observed_at: '2026-10-01T10:00:00Z', false_pass_upper_bound: 0.5 },
];

test('Evidence shows every class of the latest acceptance-eval run with its bound', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [TOPIC]: rows });
  await page.goto('/delegation-evidence');
  const table = page.getByTestId('acceptance-eval-table');
  await expect(table.getByTestId('acceptance-eval-class')).toHaveCount(new Set(latest.map((r) => r.task_class)).size);
  await expect(table).not.toContainText('research');
  for (const r of latest) {
    const bound = table.locator(`[data-testid="acceptance-eval-bound"][data-class="${r.task_class}"]`);
    await expect(bound).toHaveText(`≤\u00a0${(r.false_pass_upper_bound * 100).toFixed(1)}%`);
  }
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('acceptance-eval-panel.png'), fullPage: true });
});

test('Evidence says so when no acceptance-eval run is served', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [TOPIC]: [] });
  await page.goto('/delegation-evidence');
  await expect(page.getByText('No acceptance-eval run', { exact: true })).toBeVisible();
  await expect(page.getByTestId('acceptance-eval-table')).toHaveCount(0);
});
