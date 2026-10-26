import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 26 (AC153-AC157): one Settings page holds API Keys and Credentials.
// Failure modes declared before code: a separate Credentials or API Keys entry survives; the section lives only in
// component state, so reload or back shows the other one; a removed address still renders key content; the arrow keys
// change the section but drop keyboard focus (seen in main Chrome on 13adb0e9: focus fell to <body>); moving the panels
// brings Cloud Keys back in local-only mode.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', tenant_id: 'chart-fixture-tenant', updated_at: '2026-10-17T10:00:00Z' }] });
});

const selectedTab = (page: import('playwright/test').Page) => page.locator('[role="tab"][aria-selected="true"]');

test('AC153 the sidebar lists Settings in place of Credentials and API Keys, active on each section', async ({ page }) => {
  await page.goto('/overview');
  const local = page.getByRole('navigation', { name: 'Local', exact: true });
  await expect(local.getByRole('link')).toHaveText(['Overview', 'Runs', 'Workflow', 'Usage', 'Settings']);
  await expect(page.getByTestId('nav-local-credentials')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-api-keys')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-settings').locator('svg.lucide-settings')).toHaveCount(1);
  for (const section of ['api-keys', 'credentials']) {
    await page.goto(`/settings?section=${section}`);
    await expect(page.getByTestId('nav-local-settings')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  }
});

test('AC154 the section is in the address: default, choice, back, reload and an unknown value', async ({ page }) => {
  await page.goto('/settings');
  await expect(selectedTab(page)).toHaveText('API Keys');
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Credentials', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=credentials$/);
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await page.reload();
  await expect(selectedTab(page)).toHaveText('Credentials');
  await page.getByRole('tab', { name: 'API Keys', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=api-keys$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\?section=credentials$/);
  await expect(selectedTab(page)).toHaveText('Credentials');
  await page.goto('/settings?section=bogus');
  await expect(selectedTab(page)).toHaveText('API Keys');
});

test('AC154 the arrow keys, Home and End choose a section and keep focus on the chosen tab', async ({ page }) => {
  await page.goto('/settings?section=api-keys');
  await page.getByRole('tab', { name: 'API Keys', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/section=credentials$/);
  await expect(page.getByRole('tab', { name: 'Credentials', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/section=api-keys$/);
  await expect(page.getByRole('tab', { name: 'API Keys', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Credentials', exact: true })).toBeFocused();
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveText('Credentials');
});

test('AC155 the retired addresses show Page not found and nothing links to them', async ({ page }) => {
  for (const path of ['/api-keys', '/credentials']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Local identity|Provider keys|Dashboard access/);
  }
  await page.goto('/settings?section=credentials');
  expect(await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href'))
    .filter(href => /^\/(api-keys|credentials)(?:[?#]|$)/.test(href ?? '')))).toEqual([]);
});

test('AC156 each section keeps its panels and Cloud Keys stays hidden in local-only mode', async ({ page }) => {
  await page.goto('/settings?section=api-keys');
  for (const title of ['Local identity', 'Dashboard access', 'Environment']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByText('chart-fixture-tenant', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cloud keys/i })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Credentials', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toHaveCount(0);
});
