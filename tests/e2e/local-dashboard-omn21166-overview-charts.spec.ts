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

// OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs (with its Duration and Tokens per run charts and the ten-row table) is
// deleted from Overview, so the "same latest ten runs" assertions are retired; the Runs page keeps those charts and is
// covered by local-dashboard-omn21166-charts.spec.ts. What is kept here is the Overview's identity, the quality card
// and the day bars' link to the exact day.
test('Overview keeps its declared panels, keeps values and opens the selected day', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  // OMN-21166 live review 2026-10-25: the Overview is five headline cards, Runs per day, Tokens per day, Model usage and Tier mix.
  await expect(page.locator('button.gdb-day').first()).toBeVisible();
  expect(await page.locator('.local-dashboard-panel[data-component]').evaluateAll(elements =>
    elements.map(el => `${el.getAttribute('data-component')}${el.getAttribute('data-slice') ? ':' + el.getAttribute('data-slice') : ''}`).sort())).toEqual([
    'overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens',
    'overview-quality:card', 'overview-insights:runs', 'overview-insights:tokens',
    'overview-model-usage', 'overview-tier-mix',
  ].sort());
  for (const gone of ['overview-recent-runs', 'overview-last-run', 'overview-spend-by-day', 'overview-run-locally',
    'overview-avg-saving-per-call', 'overview-baseline-spend', 'overview-compression', 'overview-cache-hit-rate']) {
    await expect(page.locator(`[data-component="${gone}"]`), `${gone} stays deleted`).toHaveCount(0);
  }
  const quality = page.locator('[data-component="overview-quality"]');
  await expect(quality).toBeVisible();
  expect(await quality.evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(quality).toContainText('75');
  // The served run day keeps its exact count, and a click opens that day's runs.
  const day = page.locator('[data-slice="runs"] button.gdb-day').first();
  await expect(day).toHaveAccessibleName('Oct 17: 12 runs, 8 passed, 4 failed');
  await page.screenshot({ path: info.outputPath('overview-charts-desktop.png'), fullPage: true });
  await day.click();
  await expect(page).toHaveURL(/\/runs\?day=2026-10-17/);
});

test('Overview charts retain reduced motion and controls in both themes at narrow widths', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      if (theme === 'light' && width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      // OMN-21166 AC86: the Recent runs figures are gone; the charts that remain are the day bars (Runs per day, Tokens per day).
      const bars = page.locator('[data-component="overview-insights"] button.gdb-day');
      await expect(bars.first()).toBeVisible();
      await expect(page.locator('[data-slice="runs"] button.gdb-day').first()).toHaveAccessibleName('Oct 17: 12 runs, 8 passed, 4 failed');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`overview-${theme}-${width}.png`), fullPage: true });
    }
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
  }
});

test('empty or unavailable run figures do not produce fake charts or zeros', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: decisions.map(r => ({ ...r, latency_ms: null, tokens_input: null, tokens_output: null })) });
  await page.goto('/overview');
  // OMN-21166 AC86: the recent-runs table is gone; unrecorded token counts must still read "not recorded", never 0.
  const tokenDays = page.locator('[data-slice="tokens"] button.gdb-day');
  await expect(tokenDays.first()).toHaveAccessibleName('Oct 17: not recorded in, not recorded out');
  for (const label of await tokenDays.evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? ''))) {
    expect(label).toMatch(/not recorded in, not recorded out$/);
    expect(label).not.toMatch(/\b0 (in|out)\b/);
  }
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [] });
  await page.reload();
  await expect(page.locator('[data-slice="runs"]')).toContainText('No runs yet');
  await expect(page.locator('[data-slice="tokens"]')).toContainText('No runs yet');
  await expect(page.locator('button.gdb-day')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-empty.png'), fullPage: true });
});
