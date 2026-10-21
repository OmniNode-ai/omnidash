import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: plots use a different row/order than the ten-row table, unknowns
// become zero, selection opens the wrong run, quality remains hidden/duplicates,
// color alone implies failure for token output, or narrow charts overflow.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const decisions = Array.from({ length: 12 }, (_, i) => ({
  ...(chartRows[prefix + 'delegation.decisions.v1'][i % 3] as object),
  correlation_id: i === 4 ? null : `overview-run-${i}`,
  created_at: `2026-10-17T10:${String(20 - i).padStart(2, '0')}:00Z`,
  written_at: `2026-10-17T10:${String(20 - i).padStart(2, '0')}:00Z`,
}));
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: decisions };

test('Overview plots the same latest ten runs, keeps values and opens the selected identity', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  await page.getByText('Show recent run fields', { exact: true }).press('Enter');
  const recent = page.locator('[data-component="overview-recent-runs"]');
  const duration = recent.getByRole('figure', { name: 'Duration per run', exact: true });
  const tokens = recent.getByRole('figure', { name: 'Tokens per run', exact: true });
  await expect(duration.locator('.local-chart-canvas svg')).toBeVisible();
  await expect(tokens.locator('.local-chart-canvas svg')).toBeVisible();
  await expect(duration.locator('.lucide-timer')).toBeVisible();
  await expect(tokens.locator('.lucide-layers')).toBeVisible();
  expect(await duration.locator('.local-chart-symbol svg').evaluate(el => getComputedStyle(el).color))
    .not.toBe(await tokens.locator('.local-chart-symbol svg').evaluate(el => getComputedStyle(el).color));
  await expect(recent.locator('tbody tr')).toHaveCount(10);
  const ids = decisions.slice(0, 10).map(r => r.correlation_id).filter((id): id is string => id !== null);
  const options = await duration.getByLabel('Inspect run').locator('option').evaluateAll(els => els.slice(1).map(el => (el as HTMLOptionElement).value));
  expect(options).toEqual(ids);
  expect(await tokens.getByLabel('Inspect run').locator('option').evaluateAll(els => els.slice(1).map(el => (el as HTMLOptionElement).value))).toEqual(ids);
  await expect(recent).not.toContainText('overview-run-10');
  await duration.getByLabel('Inspect run').selectOption('overview-run-0');
  await expect(duration.getByRole('status')).toContainText('813 ms');
  await duration.getByLabel('First point').focus();
  await duration.getByLabel('First point').press('ArrowRight');
  await expect(duration.getByText('Showing 2–10 of 10')).toBeVisible();
  await duration.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(duration.getByText('Showing 1–10 of 10')).toBeVisible();
  const outputColor = await tokens.getByRole('button', { name: 'Tokens out', exact: true }).locator('[data-swatch]').evaluate(el => getComputedStyle(el).backgroundColor);
  const failedColor = await duration.getByRole('button', { name: 'failed', exact: true }).locator('[data-swatch]').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(outputColor).not.toBe(failedColor);
  await recent.getByRole('checkbox', { name: 'Show all run fields' }).check();
  await expect(recent.locator('tbody tr').nth(2).locator('td').nth(11)).toHaveText('0');
  await expect(recent.locator('tbody tr').nth(2).locator('td').nth(12)).toHaveText('Not recorded');
  // The approved insights panel joined the original fourteen. Check identities
  // as well as count so a duplicated panel cannot hide a missing component.
  expect(await page.locator('.local-dashboard-panel[data-component]').evaluateAll(elements =>
    elements.map(el => el.getAttribute('data-component')).sort())).toEqual([
    'overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens',
    'overview-quality', 'overview-insights', 'overview-spend-by-day', 'overview-last-run',
    'overview-recent-runs', 'overview-tier-mix', 'overview-run-locally',
    'overview-avg-saving-per-call', 'overview-baseline-spend', 'overview-compression',
    'overview-cache-hit-rate',
  ].sort());
  await expect(page.locator('[data-component="overview-quality"]')).toBeVisible();
  expect(await page.locator('[data-component="overview-quality"]').evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(page.locator('[data-component="overview-quality"]')).toContainText('75');
  await page.screenshot({ path: info.outputPath('overview-charts-desktop.png'), fullPage: true });
  await duration.getByRole('link', { name: 'Open run', exact: true }).click();
  await expect(page).toHaveURL(/workflow\?correlation_id=overview-run-0/);
});

test('Overview charts retain reduced motion and controls in both themes at narrow widths', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  await page.getByText('Show recent run fields', { exact: true }).press('Enter');
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      if (theme === 'light' && width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const charts = page.locator('[data-component="overview-recent-runs"] figure');
      await expect(charts).toHaveCount(2);
      await expect(charts.first()).toHaveAttribute('data-motion', 'reduced');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await charts.last().getByLabel('Inspect run').selectOption('overview-run-1');
      await expect(charts.last().getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=overview-run-1/);
      await page.screenshot({ path: info.outputPath(`overview-${theme}-${width}.png`), fullPage: true });
    }
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
  }
});

test('empty or unavailable run figures do not produce fake charts or zeros', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: decisions.map(r => ({ ...r, latency_ms: null, tokens_input: null, tokens_output: null })) });
  await page.goto('/overview');
  const recent = page.locator('[data-component="overview-recent-runs"]');
  await expect(recent.locator('tbody tr')).toHaveCount(10);
  await expect(recent.locator('.local-chart-canvas')).toHaveCount(0);
  await expect(recent.locator('tbody tr').first().locator('td').nth(5)).toHaveText('Not recorded');
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [] });
  await page.reload();
  await expect(recent).toContainText('No runs yet');
  await expect(recent.locator('figure')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-empty.png'), fullPage: true });
});
