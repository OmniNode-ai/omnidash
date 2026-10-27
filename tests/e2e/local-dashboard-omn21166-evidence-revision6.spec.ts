import { expect, test } from 'playwright/test';
import { evidenceDecisions, evidenceMetering, evidenceQuality, evidenceTopic, serveEvidence } from './omn21166-evidence-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('Evidence explains the canonical total and exports only the latest served decision sample', async ({ page }, info) => {
  await serveEvidence(page);
  await page.goto('/delegation-evidence');
  const claim = page.getByRole('region', { name: 'Evidence claim' });
  await expect(claim).toContainText('$18.00');
  await expect(claim).toContainText('modelled');
  await expect(claim).toContainText('cloud-baseline');
  await expect(claim).toContainText('pricing v3');
  await expect(claim).toContainText('7 measured runs');
  await expect(claim).toContainText('2 with no token counts');
  await expect(claim).toContainText('1 with no spend recorded');
  await expect(claim).toContainText('$12.00');
  await expect(claim).toContainText('$30.00');
  await expect(page.locator('.ev-savings-hero .big')).toHaveText('$18.00');
  await page.screenshot({ path: info.outputPath('evidence-claim-desktop.png') });
  await page.goto('/overview');
  await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('$18.00');
  await page.goto('/delegation-evidence');
  const sample = page.getByRole('region', { name: 'Decision sample export' });
  await expect(sample).toContainText('Latest 3 served decisions');
  await expect(sample).toContainText('sample');
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), sample.getByRole('button', { name: 'Export JSON' }).click()]);
  const json = JSON.parse((await (await jsonDownload.createReadStream()).toArray()).map(chunk => chunk.toString()).join('')) as unknown[];
  expect(json).toHaveLength(evidenceDecisions.length);
  expect(json.map((row) => (row as { correlation_id: string }).correlation_id)).toEqual(evidenceDecisions.map(row => row.correlation_id));
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), sample.getByRole('button', { name: 'Export CSV' }).click()]);
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
  await quality.getByText('More quality detail').click();
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
  await quality.getByText('More quality detail').click();
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
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toContainText('mixed basis');
  await expect(page.getByRole('region', { name: 'Evidence claim' })).not.toContainText('pricing v3');
  await page.setViewportSize({ width: 390, height: 844 });
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await expect(page.getByRole('region', { name: 'Evidence claim' })).toBeVisible();
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
