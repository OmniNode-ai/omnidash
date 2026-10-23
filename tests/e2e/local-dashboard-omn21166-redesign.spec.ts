import { writeFileSync } from 'node:fs';
import { sourceIdentity } from './source-identity';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// RED controls: baseline source label and counts are invented; row pointer-only;
// unavailable values use giant numeric-card typography; dark/light sparse surfaces.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

test('Event Bus names configured connection without claiming a lane or invented event count', async ({ page }) => {
  await page.goto('/event-bus');
  await expect(page.getByText('chart-run', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('stability-test (:13002 projection API)', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lane not reported', { exact: true })).toBeVisible();
  await expect(page.locator('.ev-owned-topic').first()).toBeVisible();
  await expect(page.locator('.row-main').first()).toContainText('Not measured');
});

// Failure mode: a failed projection read is displayed as a measured zero.
test('Workbench failed read stays unavailable instead of claiming zero pipeline events', async ({ page }, info) => {
  await page.route(/\/projection\/.*node-generation-completed\.v1(?:\?|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/agent-workbench');
  await expect(page.getByText('Not served by this runtime yet (HTTP 503)', { exact: true })).toBeVisible();
  await expect(page.locator('.kpi').filter({ hasText: 'Pipeline events' }).locator('.k-v')).toHaveText('Not measured');
  await expect(page.locator('.kpi').filter({ hasText: 'Contract pass' })).not.toContainText('0 / 0');
  await expect(page.getByText('Data unavailable', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('workbench-unavailable.png') });
});

test('Event Bus failed generation read does not claim a measured zero', async ({ page }, info) => {
  await page.route(/\/projection\/.*node-generation-completed\.v1(?:\?|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/event-bus');
  await page.getByRole('button', { name: 'Toggle details for onex.evt.omnimarket.node-generation-completed.v1', exact: true }).press('Enter');
  await expect(page.getByText('HTTP 503', { exact: true })).toBeVisible();
  await expect(page.locator('.kpi').filter({ hasText: 'Generation rows' }).locator('.k-v')).toHaveText('Not measured');
  await expect(page.locator('.kpi').filter({ hasText: 'Correlations' })).toContainText('Available rows');
  await expect(page.locator('.ev-owned-topic').filter({ hasText: 'onex.evt.omnimarket.node-generation-completed.v1' })).toContainText('Not measured');
  await page.screenshot({path:info.outputPath('event-bus-unavailable-count.png')});
});

test('Workbench successfully served empty projection retains its measured zero', async ({ page }) => {
  await page.goto('/agent-workbench');
  await expect(page.locator('.kpi').filter({ hasText: 'Pipeline events' }).locator('.k-v')).toHaveText('0');
  await expect(page.getByText('No generated nodes', { exact: true })).toBeVisible();
});

test('shared row details expand and collapse by keyboard with explicit state', async ({ page }, info) => {
  await page.goto('/event-bus');
  const row = page.getByRole('button', { name: 'Toggle details for chart-run-a', exact: true });
  await row.press('Enter');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.row-detail').first()).toContainText('chart-run-a');
  await row.press('Space');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: info.outputPath('keyboard-bus.png') });
});

test('unavailable figures remain honest and are readable messages rather than giant numbers', async ({ page }) => {
  await page.goto('/overview');
  const card = page.locator('[data-component="overview-spend"]');
  await expect(card).toContainText('Not measured');
  const missing = card.locator('.local-dashboard-metric');
  expect(await missing.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(22);
  await expect(page.locator('[data-component="overview-tier-mix"]')).toContainText('local');
});

test('final redesign captures all eleven pages, themes and widths without lost fields or overflow', async ({ page }, info) => {
  test.setTimeout(180000);
  const captures: Record<string, unknown>[] = [];
  for (const width of [1440,390,320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of ['overview','runs','workflow','usage','credentials','api-keys','delegation-evidence','experiments','agent-workbench','event-bus','lab']) {
      await page.goto('/' + route);
      await expect(page.locator('.breadcrumbs .cur')).not.toHaveText('');
      for (const theme of ['light','dark']) {
        if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
        await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
        await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('.main')).not.toContainText(/Loading/);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toHaveCount(0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth), route).toBeLessThanOrEqual(1);
        for (const bounds of await page.locator('.ev-head-right').evaluateAll(els => els.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })))) {
          expect(bounds.left, route).toBeGreaterThanOrEqual(0);
          expect(bounds.right, route).toBeLessThanOrEqual(width);
        }
        await expect(page.getByRole('navigation',{name:'Evidence',exact:true})).toBeVisible();
        const file = `${route}-${width}-${theme}.png`;
        await page.screenshot({ path: info.outputPath(file), fullPage: true });
        captures.push({ route,width,theme,file,source:'explicit served fixture, not live' });
      }
    }
  }
  writeFileSync(info.outputPath('redesign-manifest.json'), JSON.stringify({
    ...sourceIdentity(), captures,
  },null,2));
});
