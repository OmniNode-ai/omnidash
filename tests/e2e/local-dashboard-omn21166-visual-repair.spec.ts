import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: oversized unavailable cards must not consume the first
// screen; routing details must remain keyboard accessible without a wall of rows.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('compact Overview preserves missing data, quality, chart access and routing detail', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows,
    [prefix + 'metering-summary.v1']: [],
    [prefix + 'delegation.quality-gate.v1']: [{ overall_pass_rate: .75, total_passed: 6, total_failed: 2, total_checks: 8, avg_score: .98, avg_required_bar: .8 }],
  });
  await page.goto('/overview');
  const summary = page.getByRole('region', { name: 'Runtime summary', exact: true });
  // OMN-21166 live review 2026-10-25: five headline cards (Delegation Quality is the fifth).
  await expect(summary.getByRole('article')).toHaveCount(5);
  await expect(summary).toContainText('Not measured: overview totals unavailable');
  // OMN-21166 AC86 (Lakshman 2026-10-25): the Quality meter is deleted; the same served pass rate is the card's figure.
  await expect(page.locator('[data-component="overview-quality"][data-slice="card"] .local-dashboard-metric')).toHaveText('75.0%');
  await expect(page.locator('.local-overview-surface')).toBeVisible();
  // OMN-21166 AC86 (Lakshman 2026-10-25): the Last run card and "Additional runtime metrics" are deleted from Overview.
  for (const card of await summary.getByRole('article').all()) {
    expect(await card.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(180);
  }
  await page.getByRole('figure', { name: 'Runs per day', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('figure', { name: 'Runs per day', exact: true })).toBeInViewport();
  // OMN-21166 Maple grid: Overview's tier mix is ranked bars with a keyboard link to the routing breakdown; the routing
  // table is Runs' "Full routing breakdown" disclosure, under "More analysis".
  const tier = page.locator('[data-component="overview-tier-mix"]');
  await expect(tier.getByRole('listitem', { name: 'Local: 6 · 75.0%, measured', exact: true })).toBeVisible();
  await expect(tier.getByRole('link', { name: /View routing breakdown/ })).toHaveAttribute('href', /\/runs/);
  await page.goto('/runs');
  await page.getByText('More analysis', { exact: true }).press('Enter');
  const routing = page.locator('[data-component="runs-tier-mix"]');
  const detail = routing.locator('details.local-tier-details');
  await expect(detail).not.toHaveAttribute('open', '');
  await routing.locator('details.local-tier-details > summary').press('Enter');
  await expect(detail).toHaveAttribute('open', '');
  await expect(routing.getByRole('table')).toContainText('Local');
  await expect(routing.getByRole('table')).toContainText('75.0%');
  await page.screenshot({ path: info.outputPath('overview-routing-expanded.png'), fullPage: true });
  await routing.locator('details.local-tier-details > summary').press('Enter');
  await page.goto('/overview');
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
      if (width < 768 && await collapse.isVisible()) await collapse.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      // The app scrolls its main element, rather than the browser window.
      await page.getByRole('main').evaluate(el => { el.scrollTop = 0; });
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`overview-repair-${theme}-${width}.png`), fullPage: true });
    }
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
  }
});
