import { expect, test } from 'playwright/test';
import { prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a slow catalogue hides the page structure; one slow aggregate
// hides already returned runs; returning to a page blanks its last good rows.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

test('core navigation does not download unused builder or advanced page modules', async ({ page }) => {
  await serveCharts(page);
  const unnecessary: string[] = [];
  page.on('request', request => {
    if (/\/src\/pages\/(DashboardView|FeatureFlagDashboard|InstructionEvalPage)\.tsx/.test(request.url())) unnecessary.push(request.url());
  });
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  expect(unnecessary).toEqual([]);
});

test('page structure and fast panels do not wait for slow catalogue or aggregates', async ({ page }, info) => {
  await serveCharts(page);
  let releaseCatalogue!: () => void;
  let releaseAggregates!: () => void;
  const catalogue = new Promise<void>(resolve => { releaseCatalogue = resolve; });
  const aggregates = new Promise<void>(resolve => { releaseAggregates = resolve; });
  await page.route('**/projections', async route => { await catalogue; await route.fallback(); });
  await page.route('**/projection/**', async route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    if (['delegation.savings.v1', 'delegation.quality-gate.v1'].some(suffix => topic === prefix + suffix)) await aggregates;
    await route.fallback();
  });
  try {
    await page.goto('/overview');
    // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs deleted from Overview. The page structure that must not wait
    // for the catalogue is now the Runs per day heading, and the fast panel is its served day bar (3 fixture runs on Oct 17).
    await expect(page.getByRole('heading', { name: 'Runs per day', exact: true })).toBeVisible({ timeout: 1000 });
    releaseCatalogue();
    await expect(page.locator('[data-slice="runs"] button.gdb-day').first()).toHaveAccessibleName('Oct 17: 3 runs, 2 passed, 1 failed', { timeout: 1500 });
    await expect(page.locator('[data-component="overview-quality"]')).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: info.outputPath('fast-runs-slow-aggregates.png') });
  } finally { releaseCatalogue(); releaseAggregates(); }
  await expect(page.locator('[data-component="overview-quality"]')).toHaveAttribute('aria-busy', 'false');
});

test('returning to Runs keeps recent real responses visible while refreshing', async ({ page }, info) => {
  await serveCharts(page);
  // Cache reuse requires an explicit tenant; an implicit server tenant must
  // still refuse reuse across navigation. Match the module as a positive control.
  let tenantFixtureMatched = false;
  await page.route('**/src/config/generated/data-source-defaults.ts*', async route => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace(/(PROJECTION_TENANT_ID_DEFAULT\s*=\s*)""/, '$1"11111111-1111-4111-8111-111111111111"');
    expect(body).not.toBe(original);
    tenantFixtureMatched = true;
    await route.fulfill({ response, body });
  });
  let reads = 0;
  let release!: () => void;
  const secondRead = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/projection/**', async route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    if (topic === prefix + 'delegation.decisions.v1' && ++reads > 1) await secondRead;
    await route.fallback();
  });
  try {
    await page.goto('/runs');
    await expect(page.getByRole('link', { name: 'chart-run-a', exact: true }).first()).toBeVisible();
    expect(tenantFixtureMatched).toBe(true);
    await page.getByRole('link', { name: 'Usage', exact: true }).click();
    // OMN-21166 Maple grid: the by-day table sits under the page's closed "More usage" disclosure; open it first.
    await page.getByText('More usage', { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Runs', exact: true }).click();
    await expect(page.getByRole('link', { name: 'chart-run-a', exact: true }).first()).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('runs-navigation-retains-data.png') });
  } finally { release(); }
});


test('without an explicit tenant returning to Runs refuses cross-navigation cached rows', async ({ page }, info) => {
  await serveCharts(page);
  let reads = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/projection/**', async route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    if (topic === prefix + 'delegation.decisions.v1' && ++reads > 1) await pending;
    await route.fallback();
  });
  try {
    await page.goto('/runs');
    await expect(page.getByRole('link', { name: 'chart-run-a', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Usage', exact: true }).click();
    // OMN-21166 Maple grid: the by-day table sits under the page's closed "More usage" disclosure; open it first.
    await page.getByText('More usage', { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Usage by model and day', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Runs', exact: true }).click();
    // Prove a new read is actually waiting, then prove the previous response
    // is not reused under an implicit or absent tenant identity.
    await expect.poll(() => reads).toBeGreaterThan(1);
    await expect(page.getByRole('link', { name: 'chart-run-a', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-component="recent-runs"]')).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: info.outputPath('unconfigured-tenant-refuses-cache.png') });
  } finally { release(); }
  await expect(page.getByRole('link', { name: 'chart-run-a', exact: true })).toBeVisible();
});
