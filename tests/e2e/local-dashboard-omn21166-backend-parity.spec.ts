import { revealRunFields } from './omn21166-chart-fixtures';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Observed on the live dashboard: the decision serves a modelled saving and
// savings_baseline_model, while the savings session has baseline_model: null.
// The adjacent Baseline model cell incorrectly said Not recorded. Also cover
// conflicting sessions, legacy sessions, and genuinely absent baseline names.
for (const scenario of [
  { name: 'decision with empty session baseline', decision: 'recorded-baseline', session: null, expected: 'recorded-baseline' },
  { name: 'decision with older conflicting session baseline', decision: 'recorded-baseline', session: 'older-baseline', expected: 'recorded-baseline' },
  { name: 'legacy session baseline only', decision: null, session: 'legacy-baseline', expected: 'legacy-baseline' },
  { name: 'neither record provides a baseline', decision: null, session: null, expected: 'Not recorded' },
]) {
  test(`Runs baseline provenance: ${scenario.name}`, async ({ page }, info) => {
    await serveCharts(page, { ...chartRows,
      [prefix + 'delegation.decisions.v1']: [{ ...(chartRows[prefix + 'delegation.decisions.v1'][0] as object),
        modelled_savings_usd: '0.034650', savings_baseline_model: scenario.decision, savings_measurement: 'modelled' }],
      [prefix + 'delegation.savings.v1']: [{ sessions: [{ session_id: 'chart-run-a', baseline_model: scenario.session, usage_source: 'unknown', local_cost_usd: 0 }] }],
    });
    await page.goto('/runs');
    await revealRunFields(page);
    const table = page.locator('[data-component="recent-runs"] table');
    const headers = await table.locator('th').allTextContents();
    const row = table.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(headers.indexOf('Baseline model'))).toHaveText(scenario.expected);
    await expect(row.locator('td').nth(headers.indexOf('Modelled saving'))).toContainText('$0.034650');
    await expect(row.locator('td').nth(headers.indexOf('Basis'))).toHaveText('unknown');
    await expect(row.getByRole('link')).toHaveAttribute('href', /correlation_id=chart-run-a/);
    await page.screenshot({ path: info.outputPath('baseline-provenance.png') });
  });
}

// Live Evidence showed $930.95 in its headline and $1008.22 in its savings
// panel: two projections were used for one labelled cumulative-savings value.
// AC37: both now read the cost.savings-overview.v1 all-time row Overview reads;
// delegation.savings.v1 ($500) and delegation.summary.v1 ($7) disagree on purpose.
// AC38: an absent or refused total reads Not measured, never $0.
for (const scenario of [
  { name: 'uses the shared overview total rather than a divergent view or summary total', value: 19, expected: '$19.00', error: false },
  { name: 'retains a recorded zero', value: 0, expected: '$0.00', error: false },
  { name: 'keeps absent savings unavailable', value: null, expected: 'Not measured', error: false },
  { name: 'keeps refused savings unavailable', value: null, expected: 'Not measured', error: true },
]) {
  test(`Evidence savings provenance: ${scenario.name}`, async ({ page }, info) => {
    await serveCharts(page, { ...chartRows,
      [prefix + 'delegation.summary.v1']: [{ totalDelegations: 3, qualityGatePassed: 2, qualityGateTotal: 3, qualityGatePassRate: 2 / 3, totalSavingsUsd: 7, avgLatencyMs: 100 }],
      [prefix + 'delegation.savings.v1']: [{ cumulative_savings_usd: 500,
        cumulative_local_cost_usd: 1, cumulative_cloud_cost_usd: 501, session_count: 3, baseline_model: null, pricing_manifest_version: '0' }],
      [prefix + 'cost.savings-overview.v1']: scenario.value === null ? [] : [{ window: 'all', captured_at: '2026-10-20T15:14:51Z',
        total_savings_usd: scenario.value, total_cost_usd: 1, total_baseline_cost_usd: scenario.value + 1, tokens_total: 10,
        run_count: 3, measured_run_count: 3, estimated_run_count: 0, unknown_run_count: 0 }],
    });
    if (scenario.error) await page.route('**/projection/**cost.savings-overview.v1*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_yet_bus_backed' }) }));
    await page.goto('/delegation-evidence');
    const kpi = page.locator('.kpi').filter({ has: page.getByText('Savings (modelled)', { exact: true }) });
    await expect(kpi.locator('.k-v')).toHaveText(scenario.expected);
    const panel = page.locator('[data-panel-title="SAVINGS vs CLOUD BASELINE"]');
    await expect(panel.locator('.ev-savings-hero .big')).toHaveText(scenario.expected);
    await expect(panel).toContainText('Baseline model not recorded');
    for (const divergent of ['$7.00', '$500.00']) {
      await expect(kpi).not.toContainText(divergent);
      await expect(panel).not.toContainText(divergent);
    }
    await page.screenshot({ path: info.outputPath('evidence-savings-provenance.png') });
  });
}

// Live catalogue declared acceptance-eval bus-backed, while its endpoint returned
// projection_database_unavailable. Catalogue backing must not imply reachability.
test('Lab labels catalogue backing without claiming unprobed endpoint health', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/lab');
  const row = page.getByTestId('exposure-census-row').filter({ hasText: prefix + 'delegation.decisions.v1' });
  await expect(row).toContainText('bus-backed · not probed');
  await expect(row).not.toContainText('reachable');
  await expect(page.getByText('Catalogue backing only; endpoint health is not checked here.', { exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('catalogue-backing-not-health.png') });
});
