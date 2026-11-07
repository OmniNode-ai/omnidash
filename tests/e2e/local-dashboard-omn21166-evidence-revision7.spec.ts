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
  // OMN-21970 (d0476f95): a complete read names its population without "latest".
  await expect(triage).toContainText('3 failed of 4 served runs');
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
  // OMN-21970 (d0476f95): a complete read names its population without "latest".
  await expect(triage).toContainText('3 failed of 4 served runs');
  await info.attach('failure-triage-absent-aggregate', { body: JSON.stringify({ aggregateRows: 0, latestServedRuns: 4, latestFailedRuns: 3 }), contentType: 'application/json' });
});

// Amendment 30b AC207a (Lakshman 2026-10-27, "show full cost don't round up"), as changed on 2026-11-07: the bridge writes
// each figure as dashboard money, cut and never rounded up (Jonah 2026-11-06), and keeps the exact served value as the
// figure's title, where the equation adds up. These are Lakshman's local all-time figures.
test('Savings bridge cuts the canonical all-time metering row and keeps each exact served value on hover', async ({ page }, info) => {
  const canonical = { ...evidenceMetering, counterfactual_usd: '4.975354', spend_usd: '0.232022', savings_usd: '4.743332' };
  await serveEvidence(page, {
    [evidenceTopic('metering-summary.v1')]: [canonical],
    [evidenceTopic('delegation.decisions.v1')]: evidenceDecisions.map(row => ({ ...row, modelled_savings_usd: '9999.9999' })),
  });
  await page.goto('/delegation-evidence');
  const bridge = page.getByRole('region', { name: 'Savings bridge' });
  const figures = bridge.locator('.ev-savings-equation strong');
  await expect(figures).toHaveText(['$4.97', '$0.232', '$4.74']);
  // The exact served values stay on each figure, and they add up: 4.975354 - 0.232022 = 4.743332.
  expect(await figures.evaluateAll(cells => cells.map(cell => cell.getAttribute('title'))))
    .toEqual(['$4.975354 exactly, as served', '$0.232022 exactly, as served', '$4.743332 exactly, as served']);
  // Controls: rounding would have shown $4.98, and the every-digit display this replaces showed $4.975354.
  await expect(bridge).not.toContainText('$4.98');
  await expect(figures.first()).not.toHaveText('$4.975354');
  await expect(bridge).toContainText('cloud-baseline');
  await expect(bridge).toContainText('pricing v3');
  await expect(bridge).toContainText('never rounded up');
  await expect(bridge).not.toContainText('9999');
  // OMN-22168: the claim sentence ("Savings were ...") is removed; the bridge above carries the served $4.743332.
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toHaveCount(0);
  await info.attach('canonical-savings-bridge', { body: JSON.stringify({ canonical, decisionSavingsPoison: '9999.9999' }), contentType: 'application/json' });
  await bridge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('savings-bridge-desktop.png') });
});

// AC207a, Codex MSG 2afcf6ae: a metering row may serve numbers, and a small number prints in exponent form (3e-7). The
// bridge reads it as an amount, not "Not measured": below the last shown place it shows that place's unit, the exact value
// expanded in its title, and at 390px the figures stay inside their card.
test('Savings bridge reads small numeric values as amounts with the exact value on hover and fits a phone', async ({ page }, info) => {
  const canonical = { ...evidenceMetering, counterfactual_usd: 0.0000003, spend_usd: 0.0000001, savings_usd: 0.0000002 };
  await page.setViewportSize({ width: 390, height: 844 });
  await serveEvidence(page, { [evidenceTopic('metering-summary.v1')]: [canonical] });
  await page.goto('/delegation-evidence');
  const bridge = page.getByRole('region', { name: 'Savings bridge' });
  await expect(bridge.locator('.ev-savings-equation strong')).toHaveText(['$0.0001', '$0.0001', '$0.0001']);
  expect(await bridge.locator('.ev-savings-equation strong').evaluateAll(cells => cells.map(cell => cell.getAttribute('title'))))
    .toEqual(['$0.0000003 exactly, as served', '$0.0000001 exactly, as served', '$0.0000002 exactly, as served']);
  await expect(bridge).not.toContainText('Not measured');
  await bridge.scrollIntoViewIfNeeded();
  const edge = (await bridge.boundingBox())!;
  for (const figure of await bridge.locator('.ev-savings-equation strong').all()) {
    const box = (await figure.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(edge.x + edge.width + 0.5);
  }
  await page.screenshot({ path: info.outputPath('savings-bridge-phone-exponent.png') });
});

// AC207a, Codex MSG 9f72d7f9: a malformed served figure with an absurd exponent reads Not measured; it must not take the
// Evidence page down (an unbounded exponent made the expansion throw RangeError: Invalid string length).
test('Savings bridge reads an absurd exponent as Not measured and the page stays up', async ({ page }) => {
  const canonical = { ...evidenceMetering, counterfactual_usd: '1e100000000000000000000', spend_usd: '0.232022', savings_usd: '4.743332' };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await serveEvidence(page, { [evidenceTopic('metering-summary.v1')]: [canonical] });
  await page.goto('/delegation-evidence');
  const bridge = page.getByRole('region', { name: 'Savings bridge' });
  await expect(bridge.locator('.ev-savings-equation strong')).toHaveText(['Not measured', '$0.232', '$4.74']);
  expect(errors).toEqual([]);
});
