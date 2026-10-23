import { revealRunFields } from './omn21166-chart-fixtures';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Declared failures before code: Workflow has no field grouping, run controls
// bury the list, evidence renders hundreds of rows, and long pages have no
// keyboard section navigation. Preserve all values, drilldowns and empty states.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: Array.from({ length: 60 }, (_, i) => ({
  ...chartRows[prefix + 'delegation.decisions.v1'][i % 3] as object,
  id: i, correlation_id: `organization-run-${i}`, created_at: new Date(Date.now() - i * 60000).toISOString(),
  written_at: new Date(Date.now() - i * 60000).toISOString(), backend_id: 'fixture-backend', host: 'fixture-host',
  actual_score: '0.98', required_bar: '0.8', queue_wait_ms: 0, execution_ms: 120,
})) };
test.beforeEach(async ({ page }) => { await serveCharts(page, rows); });

test('Workflow groups the same served fields and Runs keeps its list close to filters', async ({ page }, info) => {
  await page.goto('/workflow');
  for (const name of ['Run outcome', 'Routing and model', 'Tokens and completion', 'Timing']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Run summary', exact: true }).locator('dt')).toHaveCount(17);
  await expect(page.getByRole('region', { name: 'Timing', exact: true })).toContainText('0 ms');
  await expect(page.getByRole('region', { name: 'Routing and model', exact: true })).toContainText('fixture-backend');
  await page.screenshot({ path: info.outputPath('workflow-organized.png') });
  await page.goto('/runs');
  const first = page.locator('[data-component="recent-runs"] tbody tr').first();
  await expect(first).toBeVisible();
  expect(await first.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(820);
  await revealRunFields(page);
  await expect(page.locator('[data-component="recent-runs"] th')).toHaveCount(18);
  await page.screenshot({ path: info.outputPath('runs-organized.png') });
});

test('Evidence paging preserves every row and details support keyboard drilldown', async ({ page }, info) => {
  await page.goto('/delegation-evidence');
  const recent = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Recent delegations', exact: true }) });
  await expect(recent.locator('.dt > .row')).toHaveCount(25);
  await expect(recent.getByText('1–25 of 60', { exact: true })).toBeVisible();
  await recent.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(recent.getByText('26–50 of 60', { exact: true })).toBeVisible();
  await recent.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(recent.locator('.dt > .row')).toHaveCount(10);
  await recent.getByRole('button', { name: 'Toggle details for organization-run-59', exact: true }).press('Enter');
  await expect(recent.locator('.row.open')).toContainText('organization-run-59');
  await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('evidence-section-navigation.png') });
});

for (const route of ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys', 'delegation-evidence']) {
  test(`${route} retains its actual panels, usable headings and phone layout`, async ({ page }, info) => {
    await page.goto('/' + route);
    await expect(page.locator('h1')).toBeVisible();
    if (route === 'delegation-evidence') {
      await expect(page.locator('.panel-h h2').first()).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toHaveCount(0);
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
      if (width < 768 && await collapse.isVisible()) await collapse.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const scroller = page.locator(route.startsWith('overview') || ['runs','workflow','usage','credentials','api-keys'].includes(route) ? 'main.local-dashboard-page' : '.ev-scroll');
      await scroller.evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: info.outputPath(`${route}-${width}.png`) });
    }
  });
}

test('the seven primary routes have clear navigation without Partial badges', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByRole('navigation', { name: 'Local', exact: true }).getByRole('link')).toHaveCount(6);
  await expect(page.getByRole('navigation', { name: 'Evidence', exact: true }).getByRole('link', { name: 'Delegation Evidence' })).toBeVisible();
  await expect(page.getByRole('complementary').getByText('partial', { exact: true })).toHaveCount(0);
});

test('destination icons and colors match between sidebar and page headers', async ({ page }) => {
  for (const route of ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys', 'delegation-evidence']) {
    await page.goto('/' + route);
    const nav = page.getByRole('link', { name: route === 'api-keys' ? 'API Keys' : route === 'delegation-evidence' ? 'Delegation Evidence' : route[0].toUpperCase() + route.slice(1), exact: true }).locator('.dash-marker svg');
    const header = page.locator('.local-dashboard-page-icon svg, .ev-title-icon svg').first();
    await expect(header).toBeVisible();
    const identity = (el: SVGElement) => [...el.classList].find(name => name.startsWith('lucide-') && name !== 'lucide-icon');
    expect(await header.evaluate(identity)).toBe(await nav.evaluate(identity));
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
      expect(await header.evaluate(el => getComputedStyle(el).color)).toBe(await nav.evaluate(el => getComputedStyle(el).color));
    }
  }
});

test('phone Evidence records become labelled readable cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/delegation-evidence');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const recent = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Recent delegations', exact: true }) });
  const cell = recent.locator('.row-main [data-label="Correlation"]').first();
  await expect(cell).toBeVisible();
  expect(await cell.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
  expect(await cell.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await recent.getByRole('button', { name: 'Toggle details for organization-run-0', exact: true }).press('Enter');
  await expect(recent.locator('.row.open')).toContainText('organization-run-0');
});

test('Workflow fact cards have distinct semantic Lucide icons and colors', async ({ page }) => {
  await page.goto('/workflow');
  const cards = page.locator('.local-run-summary-group');
  await expect(cards).toHaveCount(4);
  const identities = await cards.evaluateAll(elements => elements.map(element => ({
    icon: element.querySelector('h3 svg')?.getAttribute('class'),
    color: getComputedStyle(element.querySelector('h3 svg')!).color,
    border: getComputedStyle(element).borderTopColor,
  })));
  expect(new Set(identities.map(identity => identity.icon)).size).toBe(4);
  expect(new Set(identities.map(identity => identity.color)).size).toBe(4);
  expect(new Set(identities.map(identity => identity.border)).size).toBe(1);
});
