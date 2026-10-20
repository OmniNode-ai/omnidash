import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: provider references overflow phone records, a served
// identity cannot be copied, and absent identity renders an unusable copy action.
test.use({ viewport: { width: 390, height: 844 }, trace: 'on' });
test('Credentials keeps reference metadata readable on phones without exposing values', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'tenant-credentials.v1']: [{
    provider: 'fixture-provider', name: 'fixture.provider.long.reference.name', fingerprint: '0123abcd',
    set_at: '2026-10-18T10:00:00Z', revoked_at: null, value: 'must-never-render-test-value',
  }] });
  await page.goto('/credentials');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const row = page.locator('[data-component="credentials-keys"] tbody tr').first();
  await expect(row.locator('td[data-label]')).toHaveCount(5);
  expect(await row.locator('td').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200);
  await expect(row).toContainText('0123abcd');
  await expect(row).toContainText('Not revoked');
  await expect(page.getByText('must-never-render-test-value', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('credentials-phone.png'), fullPage: true });
});

test('API Keys offers copy only for an actual served tenant identity', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.savings.v1']: [{ tenant_id: 'served-fixture-tenant', captured_at: '2026-10-18T10:00:00Z', sessions: [] }] });
  await page.goto('/api-keys');
  await expect(page.getByRole('button', { name: 'Copy the tenant identity', exact: true })).toBeVisible();
  await expect(page.getByText('served-fixture-tenant', { exact: true })).toBeVisible();
  await expect(page.getByText('Mint time unavailable.', { exact: true })).toBeVisible();
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.savings.v1']: [] });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Copy the tenant identity', exact: true })).toHaveCount(0);
});
