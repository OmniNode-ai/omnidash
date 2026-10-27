import { expect, test } from 'playwright/test';
import { evidenceDecisions, evidenceMetering, evidenceQuality, evidenceTopic, serveEvidence } from './omn21166-evidence-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

const failedRuns = [
  { ...evidenceDecisions[0], correlation_id: 'passed-a', quality_gate_passed: true, model_name: 'model-a', task_type: 'summarization' },
  { ...evidenceDecisions[1], correlation_id: 'failed-b-classification', quality_gate_passed: false, model_name: 'model-b', task_type: 'classification' },
  { ...evidenceDecisions[1], correlation_id: 'failed-b-summary', quality_gate_passed: false, model_name: 'model-b', task_type: 'summarization' },
  { ...evidenceDecisions[1], correlation_id: 'failed-a-classification', quality_gate_passed: null, terminal_ok: false, model_name: 'model-a', task_type: 'classification' },
];

const allTimeQuality = {
  ...evidenceQuality,
  total_failed: 4,
  failure_categories: [
    { category: 'bad shape', count: 3, pct_of_failures: 0.75 },
    { category: 'low score', count: 1, pct_of_failures: 0.25 },
  ],
  by_check_type: [
    { check_type: 'shape', passed: 5, failed: 3, total: 8, pass_rate: 0.625 },
    { check_type: 'score_vs_required_bar', passed: 7, failed: 1, total: 8, pass_rate: 0.875 },
  ],
};

test('Evidence failure triage separates all-time categories from the latest served failed runs', async ({ page }, info) => {
  await serveEvidence(page, {
    [evidenceTopic('delegation.decisions.v1')]: failedRuns,
    [evidenceTopic('delegation.quality-gate.v1')]: [allTimeQuality],
  });
  await page.goto('/delegation-evidence');
  const triage = page.locator('[data-panel-title="FAILURE TRIAGE"]');
  await expect(triage).toContainText('All-time quality checks');
  await expect(triage).toContainText('4 failed checks');
  await expect(triage).toContainText('Bad shape');
  await expect(triage).toContainText('3 · 75.0%');
  await expect(triage).toContainText('score vs required bar');
  await expect(triage).toContainText('Served runs do not record their failure category');
  await expect(triage.getByRole('link', { name: /Bad shape/i })).toHaveAttribute('href', '/runs?status=failed');

  await triage.getByRole('tab', { name: 'By model' }).click();
  await expect(page).toHaveURL(/triage=model/);
  await expect(triage).toContainText('3 failed of 4 latest served runs');
  const modelB = triage.locator('[data-triage-row]').filter({ hasText: 'model-b' });
  await expect(modelB).toContainText('2 · 66.7%');
  await expect(modelB.getByRole('link')).toHaveAttribute('href', '/runs?status=failed&model=model-b');
  await page.reload();
  await expect(triage.getByRole('tab', { name: 'By model' })).toHaveAttribute('aria-selected', 'true');

  await triage.getByRole('tab', { name: 'By task' }).click();
  const classification = triage.locator('[data-triage-row]').filter({ hasText: /classification/i });
  await expect(classification).toContainText('2 · 66.7%');
  await expect(classification.getByRole('link')).toHaveAttribute('href', '/runs?status=failed&task=classification');
  await classification.getByRole('link').click();
  await expect(page).toHaveURL(/\/runs\?status=failed&task=classification/);
  const runList = page.locator('.local-runs-wrap tbody');
  await expect(runList.getByRole('link', { name: 'failed-b-classification' })).toBeVisible();
  await expect(runList.getByRole('link', { name: 'failed-b-summary' })).toHaveCount(0);

  await info.attach('failure-triage-populations', { body: JSON.stringify({ allTimeFailedChecks: 4, latestServedRuns: 4, latestFailedRuns: 3, categories: allTimeQuality.failure_categories }), contentType: 'application/json' });
  await page.goto('/delegation-evidence?triage=task');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(triage).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await triage.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('failure-triage-phone.png') });
});

test('An absent quality aggregate has a typed triage state without losing served model failures', async ({ page }, info) => {
  await serveEvidence(page, {
    [evidenceTopic('delegation.decisions.v1')]: failedRuns,
    [evidenceTopic('delegation.quality-gate.v1')]: [],
  });
  await page.goto('/delegation-evidence');
  const triage = page.locator('[data-panel-title="FAILURE TRIAGE"]');
  await expect(triage).toContainText('No quality-gate rows');
  await expect(triage).not.toContainText('0 failed checks');
  await triage.getByRole('tab', { name: 'By model' }).click();
  await expect(triage).toContainText('3 failed of 4 latest served runs');
  await info.attach('failure-triage-absent-aggregate', { body: JSON.stringify({ aggregateRows: 0, latestServedRuns: 4, latestFailedRuns: 3 }), contentType: 'application/json' });
});

test('Savings bridge uses the canonical all-time metering row at four decimals', async ({ page }, info) => {
  const canonical = { ...evidenceMetering, counterfactual_usd: '30.0004', spend_usd: '12.0001', savings_usd: '18.0003' };
  await serveEvidence(page, {
    [evidenceTopic('metering-summary.v1')]: [canonical],
    [evidenceTopic('delegation.decisions.v1')]: evidenceDecisions.map(row => ({ ...row, modelled_savings_usd: '9999.9999' })),
  });
  await page.goto('/delegation-evidence');
  const bridge = page.getByRole('region', { name: 'Savings bridge' });
  await expect(bridge).toContainText('$30.0004');
  await expect(bridge).toContainText('$12.0001');
  await expect(bridge).toContainText('$18.0003');
  await expect(bridge).toContainText('cloud-baseline');
  await expect(bridge).toContainText('pricing v3');
  await expect(bridge).toContainText('unrounded served values');
  await expect(bridge).not.toContainText('9999');
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toContainText('$18.00');
  await info.attach('canonical-savings-bridge', { body: JSON.stringify({ canonical, decisionSavingsPoison: '9999.9999' }), contentType: 'application/json' });
  await bridge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('savings-bridge-desktop.png') });
});
