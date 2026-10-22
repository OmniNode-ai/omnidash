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
  await expect(summary.getByRole('article')).toHaveCount(4);
  await expect(summary).toContainText('Not measured: overview totals unavailable');
  await expect(page.getByRole('meter', { name: 'Quality pass rate' })).toHaveAttribute('aria-valuenow', '0.75');
  await expect(page.locator('.local-overview-surface')).toBeVisible();
  expect(await page.locator('.local-overview-surface').evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(600);
  for (const card of await summary.getByRole('article').all()) {
    expect(await card.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(180);
  }
  expect(await page.getByRole('figure', { name: 'Runs per day', exact: true }).evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(1050);
  const tier = page.locator('[data-component="overview-tier-mix"]');
  const detail = tier.locator('details');
  await expect(detail).not.toHaveAttribute('open', '');
  await tier.locator('details > summary').press('Enter');
  await expect(detail).toHaveAttribute('open', '');
  await expect(tier.getByRole('table')).toContainText('local');
  await expect(tier.getByRole('table')).toContainText('75.0%');
  await page.screenshot({ path: info.outputPath('overview-routing-expanded.png'), fullPage: true });
  await tier.locator('details > summary').press('Enter');
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
