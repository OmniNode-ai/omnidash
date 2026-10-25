import { expect, test } from 'playwright/test';
import { serveCharts, chartRows, prefix } from './omn21166-chart-fixtures';

// Declared before the fix: even medians must average the two measured middle
// durations; null is excluded and zero retained. Every heatmap hover value must
// also be available through keyboard focus and touch/click, without 168 tab stops.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce', hasTouch: true });

test('review fixes: exact median and keyboard/touch hourly inspection', async ({ page }, info) => {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: [120, 1800, null].map((latency_ms, i) => ({
    correlation_id: `review-fixture-${i}`, written_at: `${day}T08:00:00Z`,
    quality_gate_passed: true, latency_ms, tokens_input: 0, tokens_output: null,
    model_name: 'fixture-model', task_type: 'document',
  })) };
  await serveCharts(page, rows);
  // OMN-21166 part 13/Maple grid: Overview no longer has the "Detailed activity analysis" fold; the run analysis (duration
  // medians and the UTC-hour heatmap) is Runs', under "More analysis". Runs draws the latest seven served UTC days,
  // so the 168 cells no longer need the Overview presets.
  await page.goto('/runs');
  await page.getByText('More analysis', { exact: true }).press('Enter');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'How long runs take', exact: true })).toContainText('Median 960 ms');
  const heat = page.getByRole('group', { name: /Runs by UTC hour for all served UTC dates/ });
  const cells = heat.getByRole('button');
  await expect(cells).toHaveCount(168);
  expect(await cells.evaluateAll(elements => elements.filter(el => (el as HTMLButtonElement).tabIndex === 0).length)).toBe(1);
  await cells.nth(0).press('ArrowRight');
  await expect(cells.nth(1)).toBeFocused();
  await cells.nth(1).press('ArrowDown');
  await expect(cells.nth(25)).toBeFocused();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const populated = heat.getByRole('button', { name: `${weekday} 08:00 UTC · 3 runs`, exact: true });
  await populated.tap();
  await expect(page.getByTestId('activity-hour-readout')).toHaveText(`${weekday} 08:00 UTC · 3 runs`);
  await populated.press('ArrowRight');
  await expect(page.getByTestId('activity-hour-readout')).toHaveText(`${weekday} 09:00 UTC · 0 runs`);
  // A readout must survive the pointer leaving the chart after keyboard selection.
  await page.getByRole('heading', { name: 'Runs', exact: true }).hover();
  await expect(page.getByTestId('activity-hour-readout')).toHaveText(`${weekday} 09:00 UTC · 0 runs`);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (width < 768 && await collapse.isVisible()) await collapse.click();
    await heat.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('activity-hour-readout')).toHaveText(`${weekday} 09:00 UTC · 0 runs`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await heat.screenshot({ path: info.outputPath(`review-heatmap-${width}.png`) });
  }
  await page.screenshot({ path: info.outputPath('review-fixes-320.png'), fullPage: true });
  await info.attach('review-fixes-result', { body: JSON.stringify({
    source: 'constructed HTTP fixture', medianMs: 960, cells: 168,
    keyboard: 'right/down and selected-value readout', widths: [1440, 390, 320],
  }), contentType: 'application/json' });
});
