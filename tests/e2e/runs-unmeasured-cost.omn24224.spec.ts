import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// A run whose cost was never measured read "$0" in the Runs Cost column, the same as a measured free run. Seen on a
// local install on 2026-11-13: 95 runs stored with no cost each showed $0, while their Saving cell said the cost was not
// recorded. The store serves such a run with cost_usd null and, once the local savings view stops turning a null into
// 0, a savings session whose local_cost_usd is null too.
// Failure modes:
//   F1  an unmeasured run shows "$0" (or any money) in the table or in its detail dialog;
//   F2  a measured cost of exactly 0 stops reading as the muted "$0";
//   F3  a priced run loses its figure;
//   F4  the check is blind: the rows it reads are not drawn.
const runs = [
  { id: 'cost-run-unmeasured', at: '2026-10-17T10:03:00Z', cost: null },
  { id: 'cost-run-free', at: '2026-10-17T10:02:00Z', cost: 0 },
  { id: 'cost-run-priced', at: '2026-10-17T10:01:00Z', cost: 0.25 },
] as const;

const rows: Record<string, unknown[]> = {
  ...chartRows,
  [prefix + 'delegation.decisions.v1']: runs.map(run => ({
    correlation_id: run.id, created_at: run.at, written_at: run.at, model_name: 'model-a', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 500, tokens_input: 100, tokens_output: 10, backend_id: 'local',
    task_type: 'summarization', cost_tier_name: 'local', cost_usd: run.cost, data_source: 'fixture',
  })),
  [prefix + 'delegation.savings.v1']: [{
    tenant_id: 'chart-fixture-tenant', session_count: runs.length, cumulative_local_cost_usd: 0.25,
    sessions: runs.map(run => ({ session_id: run.id, model_name: 'model-a', local_cost_usd: run.cost, usage_source: 'measured' })),
  }],
};

test('unmeasured_run_cost: a run with no recorded cost reads Not measured, a measured zero stays the muted $0', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page, rows);
  await page.goto('/runs');
  const body = page.locator('[data-component="recent-runs"] .local-runs-wrap table tbody tr');
  // F4: all three runs are drawn, newest first.
  await expect(body).toHaveCount(3);
  const cost = (index: number) => body.nth(index).locator('td[data-label="Cost"]');

  const seen = { unmeasured: await cost(0).innerText(), free: await cost(1).innerText(), priced: await cost(2).innerText() };
  writeFileSync(info.outputPath('unmeasured-run-cost.json'), JSON.stringify(seen, null, 2));

  // F1: the unmeasured run says so and shows no money.
  await expect(cost(0)).toHaveText('Not measured');
  // F2: the measured free run keeps the short, muted zero.
  await expect(cost(1)).toHaveText('$0');
  await expect(cost(1).locator('.local-cost-free')).toHaveCount(1);
  // F3: the priced run keeps its figure.
  await expect(cost(2)).toHaveText('$0.25');

  // F1 in the detail dialog the row opens.
  await body.nth(0).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const detailCost = dialog.locator('[data-field-tone="cost"]').first();
  await expect(detailCost).toContainText('Not measured');
  await expect(detailCost).not.toContainText('$');
});
