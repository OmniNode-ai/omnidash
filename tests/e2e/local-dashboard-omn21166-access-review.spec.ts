import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { gotoSettings } from './settings-sections';

// Before implementation: provider references overflow phone records, a served
// identity cannot be copied, and absent identity renders an unusable copy action.
test.use({ viewport: { width: 390, height: 844 }, trace: 'on' });
test('Credentials keeps reference metadata readable on phones without exposing values', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'tenant-credentials.v1']: [{
    provider: 'fixture-provider', name: 'fixture.provider.long.reference.name', fingerprint: '0123abcd',
    set_at: '2026-10-18T10:00:00Z', revoked_at: null, value: 'must-never-render-test-value',
  }] });
  // OMN-21166 part 18 AC128: the keys in use are columns of the one "Model providers" table (rows from GET /models; a key
  // whose provider is not listed keeps its own row), so the test serves /models.
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [
    { provider: 'gemini', set_up: false, last_test: null, models: [] },
    { provider: 'openrouter', set_up: false, last_test: null, models: [] },
    { provider: 'openai', set_up: false, last_test: null, models: [] },
    { provider: 'ollama', set_up: false, last_test: null, models: [] },
  ] }) }));
  await page.goto('/settings');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): a key whose provider GET /models does not list keeps its own provider row (an
  // article that opens to its details) instead of a table row; its key is listed there with the same fields.
  const row = page.getByRole('article', { name: 'Fixture-provider', exact: true });
  await expect(row.locator('.local-provider-status')).toHaveText('Not listed by onex models');
  await row.locator('summary.local-provider-line').click();
  const keys = row.getByRole('list', { name: 'Fixture-provider keys', exact: true });
  // Part 18 AC128: Expires and Bound host show only when a key records one (this fixture serves neither, so one caption
  // says so), and there is no Revoked field: an active key is not revoked. OMN-19996 added Last used, which reads Never.
  await expect(keys.locator('dt')).toHaveText(['Fingerprint', 'Set', 'Last used']);
  await expect(keys.locator('dt', { hasText: /Expires|Bound host|Revoked/ })).toHaveCount(0);
  await expect(keys.locator('div').filter({ has: page.locator('dt', { hasText: 'Last used' }) }).locator('dd')).toHaveText('Never');
  await expect(page.getByText('No key records an expiry or a bound host.', { exact: true })).toBeVisible();
  // The key's entry has the width to be read on a phone, its long reference name is not clipped, and nothing in the row
  // runs past its edge.
  expect(await keys.getByRole('listitem').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200);
  expect(await keys.locator('.local-provider-key-name').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  expect(await row.evaluate(element => [element, ...element.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > element.getBoundingClientRect().right + 1).length)).toBe(0);
  await expect(keys).toContainText('fixture.provider.long.reference.name');
  await expect(keys).toContainText('0123abcd');
  await expect(row).not.toContainText('Not revoked');
  await expect(page.getByText('must-never-render-test-value', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('credentials-phone.png'), fullPage: true });
});

test('API Keys offers copy only for an actual served tenant identity', async ({ page }) => {
  // OMN-21166 part 11: the tenant is read from the native local-runtime row of local-environment.v1, not from savings sessions.
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', tenant_id: 'served-fixture-tenant', updated_at: '2026-10-18T10:00:00Z' }] });
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the identity is in the Access section, opened by its address (kept on reload).
  await gotoSettings(page, 'Access');
  await expect(page.getByRole('button', { name: 'Copy the tenant identity', exact: true })).toBeVisible();
  await expect(page.getByText('served-fixture-tenant', { exact: true })).toBeVisible();
  await expect(page.getByText('Not recorded', { exact: true }).first()).toBeVisible();
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [] });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Copy the tenant identity', exact: true })).toHaveCount(0);
});

// OMN-21166 part 18 AC129/AC131: every field label in "Dashboard access" has its icon, and Rotate shows its command as
// code text without the served backticks.
test('API Keys shows the Rotate command as code without backticks, and every access label has an icon', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', access_mode: 'token', token_minted_at: '2026-10-18T10:00:00Z',
      rotate_hint: 'Run `onex dashboard` again to mint a new token', updated_at: '2026-10-18T10:00:00Z' }] });
  await page.goto('/settings');
  const rotate = page.locator('dl.local-dashboard-fields > div').filter({ has: page.locator('dt', { hasText: 'Rotate' }) });
  await expect(rotate.locator('dd code')).toHaveText('onex dashboard');
  await expect(rotate.locator('dd')).toHaveText('Run onex dashboard again to mint a new token');
  expect(await rotate.locator('dd').innerText()).not.toContain('`');
  for (const label of ['Access', 'Token minted', 'Rotate']) {
    const field = page.locator('dl.local-dashboard-fields > div').filter({ has: page.locator('dt', { hasText: label }) });
    await expect(field.locator('dt svg'), `${label} icon`).toHaveCount(1);
  }
});
