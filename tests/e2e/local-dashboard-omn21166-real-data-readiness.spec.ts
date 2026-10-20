import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Declared before implementation: the catalogue is awaited before the existing
// five-second projection deadline starts. A stalled catalogue must stop loading,
// name the failure, and recover without inventing rows. A refresh failure must
// retain the last successful records and filters while visibly reporting failure.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('stalled catalogue has a bounded error and a working refresh recovery', async ({ page }, info) => {
  await serveCharts(page);
  let stalled = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let projectionReads = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/projection/')) projectionReads++;
  });
  await page.route('**/projections', async route => {
    if (stalled) await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
      Object.keys(chartRows).map(topic => ({ topic, backing: 'bus', tenant_scoped: false })) }) });
  });
  await page.goto('/runs');
  try {
    await expect(page.getByRole('alert')).toContainText('Exposure catalogue: no answer in 5 s', { timeout: 6500 });
    await expect(page.getByText('Loading runtime exposures…', { exact: true })).toHaveCount(0);
    expect(projectionReads).toBe(0);
    await page.screenshot({ path: info.outputPath('catalogue-timeout.png') });
    stalled = false;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('a[href*="correlation_id=chart-run-a"]').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    release();
    await expect(page.locator('a[href*="correlation_id=chart-run-a"]').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('catalogue-recovered.png') });
  } finally { release(); }
});

test('catalogue refresh failure is visible while last good data and filters remain', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs');
  await expect(page.locator('a[href*="correlation_id=chart-run-b"]').first()).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('failed');
  await page.route('**/projections', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('GET /projections returned HTTP 503');
  await expect(page.getByRole('alert')).toContainText('Showing saved data.');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('failed');
  await expect(page.locator('a[href*="correlation_id=chart-run-b"]').first()).toBeVisible();
  await expect(page.getByText('Loading runtime exposures…', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('refresh-retains-records.png'), fullPage: true });
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: chartRows[prefix + 'delegation.decisions.v1'] });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('failed');
  await expect(page.locator('a[href*="correlation_id=chart-run-b"]').first()).toBeVisible();
});
