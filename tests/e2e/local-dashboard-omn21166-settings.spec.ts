import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 26 revised (AC153-AC159): one Settings page with Model providers, Access and System status sections.
// Failure modes declared before code: a tab list or section parameter survives; a section loses a panel or Cloud Keys returns;
// Environment back on Overview or missing from Settings; the alert time stays raw; a retired address renders content.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', tenant_id: 'chart-fixture-tenant', updated_at: '2026-10-17T10:00:00Z' }] });
});

test('AC153 the sidebar lists Settings in place of Credentials and API Keys, active on Settings', async ({ page }) => {
  await page.goto('/overview');
  const local = page.getByRole('navigation', { name: 'Local', exact: true });
  await expect(local.getByRole('link')).toHaveText(['Overview', 'Runs', 'Workflow', 'Usage', 'Settings']);
  await expect(page.getByTestId('nav-local-credentials')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-api-keys')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-settings').locator('svg.lucide-settings')).toHaveCount(1);
  await page.goto('/settings');
  await expect(page.getByTestId('nav-local-settings')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
});

test('AC155 the retired addresses show Page not found and nothing links to them', async ({ page }) => {
  for (const path of ['/api-keys', '/credentials']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Local identity|Provider keys|Dashboard access/);
  }
  await page.goto('/settings');
  expect(await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href'))
    .filter(href => /^\/(api-keys|credentials)(?:[?#]|$)/.test(href ?? '')))).toEqual([]);
});

test('AC156 each section keeps its panels and Cloud Keys stays hidden in local-only mode', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard access', exact: true })).toBeVisible();
  await expect(page.getByText('chart-fixture-tenant', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cloud keys/i })).toHaveCount(0);
});

test('AC154 /settings is one page: no tab list, and ?section= changes nothing', async ({ page }) => {
  await page.goto('/settings?section=credentials');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Model providers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard access', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'System status', exact: true })).toBeVisible();
  await page.goto('/settings?section=bogus');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Model providers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard access', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'System status', exact: true })).toBeVisible();
});

test('AC158 Environment is the System status section of Settings, and not on Overview', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'compose', service: 'runtime', verdict: 'running', verdict_reason: 'health check passed', last_seen: '2026-10-26T18:00:59Z' },
    { mode: 'compose', service: 'redpanda', verdict: 'down', verdict_reason: 'container exited', last_seen: '2026-10-26T18:00:59Z', alert_code: 'SERVICE_DOWN', alert_severity: 'critical', alert_since: '2026-10-26T18:01:59.080Z' }
  ]});
  await page.goto('/overview');
  await expect(page.locator('article[data-component$="-environment"]')).toHaveCount(0);
  await page.goto('/settings');
  const sectionHeadings = await page.locator('main section > h2').allTextContents();
  expect(sectionHeadings).toEqual(['Model providers', 'Access', 'System status']);
  const statusSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'System status', exact: true }) });
  const envArticle = statusSection.locator('article[data-component="status-environment"]');
  await expect(envArticle.locator('.local-environment-line')).toBeVisible();
  await expect(envArticle.locator('details.local-more')).not.toHaveAttribute('open');
});

test('AC159 alert banner shows formatted time after opening details', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'compose', service: 'runtime', verdict: 'running', verdict_reason: 'health check passed', last_seen: '2026-10-26T18:00:59Z' },
    { mode: 'compose', service: 'redpanda', verdict: 'down', verdict_reason: 'container exited', last_seen: '2026-10-26T18:00:59Z', alert_code: 'SERVICE_DOWN', alert_severity: 'critical', alert_since: '2026-10-26T18:01:59.080Z' }
  ]});
  await page.goto('/settings');
  const envArticle = page.locator('article[data-component="status-environment"]');
  await envArticle.getByText('Environment details').click();
  await expect(envArticle.locator('details.local-more')).toHaveAttribute('open');
  await expect(envArticle).toContainText('since Oct 26, 18:01:59 UTC');
  await expect(envArticle).not.toContainText('2026-10-26T18:01:59');
});
