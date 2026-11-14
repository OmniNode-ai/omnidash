import { expect, test } from 'playwright/test';
import { chartRows, keepRealClock, narrowTo, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseChartTab } from './chart-tabs';
// This spec dates its rows from the real clock, so the browser keeps it (see FIXTURE_NOW).
test.beforeEach(({ page }) => keepRealClock(page));

// Before implementation: no model/tier volume bars or outcome composition;
// unknown verdicts disappear; latest run is buried below every insight chart.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const now = new Date().toISOString();
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: [
  { ...chartRows[prefix + 'delegation.decisions.v1'][0] as object, written_at: now, created_at: now, cost_tier_name: 'local' },
  { ...chartRows[prefix + 'delegation.decisions.v1'][1] as object, written_at: now, created_at: now, cost_tier_name: 'cloud' },
  { ...chartRows[prefix + 'delegation.decisions.v1'][2] as object, written_at: now, created_at: now, cost_tier_name: null, quality_gate_passed: null },
] };
test('Overview groups activity, routing and quality charts and keeps latest execution near the summary', async ({ page }, info) => {
  await serveCharts(page, rows);
  // OMN-21166 Maple grid: Overview's activity is its "Runs per day" panel (the "Activity over time" section and the
  // "Detailed activity analysis" fold are gone from it); Runs' analysis holds the task mix, quality and performance charts (part 18: the model, tier and outcome breakdowns are removed).
  await page.goto('/overview');
  const perDay = page.locator('[data-component="overview-insights"][data-slice="runs"]');
  // OMN-22168: inside its tab the chart's heading is hidden (the tab names it); the Runs per day tab is the one chosen.
  await expect(page.getByRole('tab', { name: 'Runs', exact: true })).toHaveAttribute('aria-selected', 'true');
  // OMN-22168 (Lakshman 2026-11-04, "don't show anything if we don't have"): a run with no verdict is not drawn or
  // counted on Runs per day, so today's three rows (one passed, one failed, one with no verdict) read 2 runs.
  await expect(perDay.getByRole('button', { name: /: 2 runs, 1 passed, 1 failed$/ })).toBeVisible();
  await page.goto('/runs');
  // OMN-21166 part 13: the analysis sits under Runs' closed page-level "More analysis".
  // OMN-21166 part 18 AC119/AC121: "Runs by model", "Runs by tier" and the "Run outcomes" donut are removed from Runs
  // (Overview's Model usage and Tier mix, and the Runs headline cards, show the same figures); the task mix remains.
  await expect(page.getByRole('figure', { name: 'Runs by model', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Runs by tier', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Run outcomes', exact: true })).toHaveCount(0);
  const tasks = page.getByRole('figure', { name: 'Tasks', exact: true });
  await expect(tasks).toBeVisible();
  // The latest execution (the newest run, first in the run list) sits above the analysis charts.
  const latest = page.locator('[data-component="recent-runs"]');
  expect(await latest.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(await tasks.evaluate(element => element.getBoundingClientRect().top));
  const row = page.locator('.overview-chart-row').first();
  const heights = await row.locator(':scope > figure').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('overview-reorganized-desktop.png'), fullPage: true });
  for (const width of [390, 320]) {
    await narrowTo(page, width, 844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goto('/overview');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goto('/runs');
  }
});

test('Overview has no invented composition when decision rows are empty', async ({ page }) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [] });
  await page.goto('/overview');
  // OMN-21166 Maple grid: the insights component is panels of charts; each says so, none invents data.
  // OMN-21166 AC86 (Lakshman 2026-10-25): Why runs failed is deleted from Overview, so two panels remain (runs, tokens).
  // OMN-22168: the two run charts are tabs, one drawn at a time; each says so in turn.
  for (const tab of ['Runs per day', 'Tokens per day']) {
    await chooseChartTab(page, tab);
    const panels = page.locator('[data-component="overview-insights"]');
    await expect(panels).toHaveCount(1);
    await expect(panels).toContainText('No runs yet');
  }
  await expect(page.getByRole('figure', { name: 'Run outcomes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Runs by model', exact: true })).toHaveCount(0);
});
