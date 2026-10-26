import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes declared before implementation: searching the wrong fields or
// source, a stale page hiding matches, lost query on reload, filters not composing,
// inaccessible full failure details, and Evidence missing its main landmark.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('run search composes with filters, survives reload and clears without stale pagination', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs?page=2');
  const search = page.getByRole('searchbox', { name: 'Search runs' });
  await expect(search).toBeVisible();
  await search.fill('CHART-RUN-B');
  await expect(page.locator('.local-runs-wrap tbody tr')).toHaveCount(1);
  await expect(page.locator('.local-runs-wrap tbody')).toContainText('chart-run-b');
  await expect(page).toHaveURL(/q=CHART-RUN-B/);
  await page.reload();
  await expect(search).toHaveValue('CHART-RUN-B');
  await page.getByLabel('Status', { exact: true }).selectOption('passed');
  await expect(page.getByRole('status').filter({ hasText: 'No runs match' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.local-runs-wrap tbody tr')).toHaveCount(3);
  await search.fill('model-a');
  await expect(page.locator('.local-runs-wrap tbody tr')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('runs-search.png') });
});

test('long failures have keyboard-accessible full text and searches keep exact run identity', async ({ page }, info) => {
  const detail = 'Runtime stopped: ' + 'Recorded failure detail. '.repeat(20);
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: [
    { ...(chartRows[prefix + 'delegation.decisions.v1'][1] as object), quality_gate_detail: detail },
  ] });
  await page.goto('/runs');
  const disclosure = page.locator('.local-runs-wrap details');
  await expect(disclosure).toHaveCount(1);
  await disclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure).toContainText(detail);
  await expect(page.locator('.local-runs-wrap a')).toHaveAttribute('href', '/workflow?correlation_id=chart-run-b');
  await page.screenshot({ path: info.outputPath('run-failure-details.png') });
});

test('Evidence has a named main landmark and explicitly modelled savings', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/delegation-evidence');
  const main = page.getByRole('main', { name: 'Delegation Evidence page' });
  await expect(main).toBeVisible();
  // Part 15 AC91: an Overview card; "modelled" is in its title and its tooltip.
  await expect(main.locator('article[data-kpi-card="Savings (modelled)"]')).toContainText('modelled');
  await expect(main.getByRole('heading', { name: 'Delegation Evidence', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('evidence-landmark.png') });
});

test('search and result controls remain usable at phone widths in both themes', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
      await page.getByRole('searchbox', { name: 'Search runs' }).fill('chart-run-a');
      await expect(page.locator('.local-runs-wrap tbody tr')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`runs-search-${width}-${theme}.png`) });
    }
  }
});

// Event Bus currently slices away records after 80. Paging must expose all
// returned identities while limiting DOM rows, and keep keyboard details usable.
test('Event Bus pages every returned correlation, including records beyond eighty', async ({ page }, info) => {
  const decisions = Array.from({ length: 90 }, (_, i) => ({
    ...(chartRows[prefix + 'delegation.decisions.v1'][0] as object),
    correlation_id: `bus-review-${i}`, created_at: new Date(Date.UTC(2026, 9, 17, 10, 0, 90 - i)).toISOString(),
  }));
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: decisions });
  await page.goto('/event-bus');
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'CORRELATIONS ON THE BUS', exact: true }) });
  await expect(panel.getByRole('navigation', { name: 'Record pages' })).toBeVisible();
  await expect(panel.locator('.dt > .row')).toHaveCount(25);
  for (let i = 0; i < 3; i++) await panel.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(panel.locator('.dt > .row')).toHaveCount(15);
  await panel.getByRole('button', { name: 'Toggle details for bus-review-89', exact: true }).press('Enter');
  await expect(panel.locator('.row.open')).toContainText('bus-review-89');
  await expect(panel.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('event-bus-last-page.png') });
});

// Live Chrome regression: list-first Runs left reused chart copy saying below.
// Keep captions true on Runs' run charts. OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs and "Show recent run fields"
// are deleted from Overview, so its disclosed recent-run charts no longer exist and only Runs is checked.
test('run chart captions identify the listed records without claiming an obsolete position', async ({ page }, info) => {
  await serveCharts(page);
  for (const route of ['/runs']) {
    await page.goto(route);
    // OMN-21166 part 18 AC118: Runs keeps its run charts inside its one closed "More analysis".
    await page.locator('summary').filter({ hasText: /^More analysis$/ }).click();
    for (const name of ['Duration per run', 'Tokens per run']) {
      const chart = page.getByRole('figure', { name, exact: true });
      await expect(chart).toBeVisible();
      // OMN-21166 part 18 AC124: the filler subtitle "Explore the listed runs" is removed from the per-run charts.
      await expect(chart).not.toContainText('Explore the listed runs');
      await expect(chart.locator('figcaption')).toContainText('each listed run');
      await expect(chart).not.toContainText(/listed (?:above|below)/);
    }
    await page.screenshot({ path: info.outputPath(route.slice(1) + '-chart-caption.png'), fullPage: true });
  }
});
