import { expect, test } from 'playwright/test';
import { evidenceDecisions, evidenceMetering, evidenceQuality, evidenceTopic, serveEvidence } from './omn21166-evidence-fixtures';
import { narrowTo } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('Evidence explains the canonical total and exports only the latest served decision sample', async ({ page }, info) => {
  await serveEvidence(page);
  await page.goto('/delegation-evidence');
  // OMN-22168 (Lakshman 2026-11-05, "remove"): the claim sentence and its derivation row are gone; the canonical
  // figures it repeated stay in the Savings panel, which reads the same served row.
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toHaveCount(0);
  const savings = page.locator('[data-panel-title="SAVINGS vs CLOUD BASELINE"]');
  await expect(page.locator('.ev-savings-hero .big')).toHaveText('$18.00');
  await expect(savings).toContainText('cloud-baseline');
  await expect(savings).toContainText('pricing v3');
  await page.screenshot({ path: info.outputPath('evidence-claim-desktop.png') });
  await page.goto('/overview');
  await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$18.00');
  await page.goto('/delegation-evidence');
  const sample = page.getByRole('region', { name: 'Decision sample export' });
  await expect(sample).toContainText('Latest 3 served decisions');
  await expect(sample).toContainText('sample');
  // OMN-23330 (2026-11-11): an export asks first, as on Runs; only the confirmation's Download button downloads.
  await sample.getByRole('button', { name: 'Export JSON' }).click();
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Download JSON' }).click()]);
  const json = JSON.parse((await (await jsonDownload.createReadStream()).toArray()).map(chunk => chunk.toString()).join('')) as unknown[];
  expect(json).toHaveLength(evidenceDecisions.length);
  expect(json.map((row) => (row as { correlation_id: string }).correlation_id)).toEqual(evidenceDecisions.map(row => row.correlation_id));
  await sample.getByRole('button', { name: 'Export CSV' }).click();
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Download CSV' }).click()]);
  const csv = (await (await csvDownload.createReadStream()).toArray()).map(chunk => chunk.toString()).join('');
  expect(csv).toContain('correlation_id');
  expect(csv).toContain('evidence-newest');
  expect(csv).toContain('evidence-oldest');
  await info.attach('evidence-claim-and-sample', { body: JSON.stringify({ canonical: evidenceMetering, exportedIds: evidenceDecisions.map(row => row.correlation_id) }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('evidence-claim-and-sample.png'), fullPage: true });
});

test('Quality breakdown ranks served failures and distinguishes zero from an unserved subfield', async ({ page }, info) => {
  await serveEvidence(page);
  await page.goto('/delegation-evidence');
  const quality = page.locator('[data-panel-title="QUALITY GATE"]');
  await expect(quality).toContainText('All quality checks served');
  await expect(quality.getByRole('list', { name: 'Checks by type' })).toContainText('score vs required bar');
  await expect(quality.getByText('Median tokens to comply')).toBeVisible();
  await expect(quality.locator('.kv > div', { hasText: 'Median tokens to comply' }).locator('.v')).toHaveText('0');
  await expect(quality.locator('.ev-qg-stats .stat-inline').last().locator('.big')).toHaveText('0.0%');
  const categories = quality.locator('[data-quality-category]');
  await expect(categories).toHaveCount(2);
  await expect(categories.first()).toContainText('bad shape');
  await serveEvidence(page, { [evidenceTopic('delegation.quality-gate.v1')]: [{
    ...evidenceQuality, by_check_type: undefined, median_tokens_to_compliance: undefined,
    failure_categories: undefined, escalation_rate: undefined,
  }] });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(quality).toContainText('Not served');
  await expect(quality.locator('.kv > div', { hasText: 'Median tokens to comply' }).locator('.v')).toHaveText('Not served');
  await expect(quality.getByRole('list', { name: 'Checks by type' })).toHaveCount(0);
  await info.attach('evidence-quality-states', { body: JSON.stringify({ measuredZero: 0, absentSubfield: 'Not served' }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('evidence-quality-states.png'), fullPage: true });
});

test('Missing quality aggregate is a typed empty state; mixed pricing is named', async ({ page }, info) => {
  await serveEvidence(page, {
    [evidenceTopic('delegation.quality-gate.v1')]: [],
    [evidenceTopic('metering-summary.v1')]: [
      evidenceMetering,
      { ...evidenceMetering, window_kind: 'day', window_start: '2026-10-16', pricing_manifest_version: '2' },
    ],
  });
  await page.goto('/delegation-evidence');
  await expect(page.locator('[data-panel-title="QUALITY GATE"]')).toContainText('No quality-gate rows');
  // OMN-22168: no claim block; the Savings panel names the mixed basis instead of one pricing version.
  const savings = page.locator('[data-panel-title="SAVINGS vs CLOUD BASELINE"]');
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toHaveCount(0);
  await expect(savings).toContainText('mixed basis');
  await expect(savings).not.toContainText('pricing v3');
  await narrowTo(page, 390, 844);
  await expect(savings).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await info.attach('evidence-missing-and-mixed', { body: JSON.stringify({ aggregate: 'absent', allTimeVersion: '3', dailyVersion: '2' }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('evidence-missing-and-mixed.png'), fullPage: true });
});

test('A refused decision read cannot present zero as a served export sample', async ({ page }, info) => {
  await serveEvidence(page);
  await page.route(`**/projection/**delegation.decisions.v1*`, route => route.fulfill({ status: 503, body: '{}' }));
  await page.route(`**/projection/**delegation.quality-gate.v1*`, route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/delegation-evidence');
  const sample = page.getByRole('region', { name: 'Decision sample export' });
  await expect(sample).toContainText('Not measured');
  await expect(sample).not.toContainText('Latest 0 served decisions');
  await expect(sample.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
  await expect(page.locator('[data-panel-title="QUALITY GATE"]')).toContainText('No quality-gate rows');
  await info.attach('evidence-refused-read', { body: JSON.stringify({ decisions: 503, qualityGate: 503, sample: 'Not measured' }), contentType: 'application/json' });
});
