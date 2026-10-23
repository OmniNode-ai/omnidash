import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failures: available aggregate directions hidden by an empty model projection;
// invented model attribution, rounded full integers, stale producer time hidden,
// unbounded day scrolling, known zero merged with missing, or authoritative model rows replaced.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const context = { window_kind: 'all', window_start: '', baseline_model: 'baseline-a',
  as_of: '2026-10-22T09:47:13Z', baseline_state: 'resolved' };
const days = Array.from({ length: 9 }, (_, i) => ({ ...context, window_kind: 'day',
  window_start: `2026-10-${14+i}`, tokens_in: i === 8 ? '9007199254740993' : String(1000+i),
  tokens_out: '514634', runs_unknown_tokens: 2 }));

for (const theme of ['light', 'dark']) {
  test(`daily metering tokens fill the empty model series honestly in ${theme}`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    await serveCharts(page, { ...chartRows, [prefix+'usage-by-model-day.v1']: [],
      [prefix+'metering-summary.v1']: [context, ...days] });
    await page.goto('/usage');
    const panel = page.locator('[data-component="usage-tokens-by-day"]');
    await expect(panel.getByRole('figure', { name: 'Daily metering token totals' })).toBeVisible();
    await expect(panel).toContainText('Daily metering totals');
    await expect(panel).toContainText('Model breakdown unavailable');
    const chart = panel.getByRole('group', { name: 'Daily metering tokens' });
    await expect(chart.getByRole('button')).toHaveCount(7);
    const newest = chart.getByRole('button', { name: /Oct 22: 9,007,199,254,740,993 in, 514,634 out/ });
    await newest.focus();
    await expect(panel.getByRole('status')).toContainText('9,007,199,254,740,993');
    await expect(panel.getByRole('status')).toContainText('2026-10-22 09:47:13 UTC');
    await expect(panel.getByRole('status')).toContainText('2 runs with unrecorded tokens');
    await expect(chart.getByRole('button', { name: /^Oct 14:/ })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Previous token days' }).click();
    await expect(chart.getByRole('button', { name: /^Oct 14:/ })).toBeVisible();
    await expect(chart.getByRole('button')).toHaveCount(2);
    await expect(chart.getByRole('button', { name: /^Oct 16:/ })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Next token days' }).click();
    await expect(newest).toBeVisible();
    await page.screenshot({ path: info.outputPath(`metering-tokens-${theme}.png`), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
      if (await collapse.isVisible()) await collapse.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

test('daily totals retain measured zero and an independently unrecorded direction', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix+'usage-by-model-day.v1']: [],
    [prefix+'metering-summary.v1']: [context, { ...days[8], tokens_in: 0, tokens_out: null, runs_unknown_tokens: null }] });
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-tokens-by-day"]');
  const bar = panel.getByRole('button', { name: /Oct 22: 0 in, not recorded out/ });
  await expect(bar).toBeVisible();
  expect(await bar.locator('[data-field-tone="tokens-in"]').evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  await expect(bar.locator('[data-field-tone="tokens-out"]')).toHaveCount(0);
  await bar.focus();
  await expect(panel.getByRole('status')).toContainText('Token coverage not recorded');
  await expect(panel.getByRole('status')).not.toContainText('0 out');
});

test('shortened daily data clamps old pagination so one Next returns to the latest days', async ({ page }) => {
  const many = Array.from({ length: 59 }, (_, i) => ({ ...days[0],
    window_start: new Date(Date.UTC(2026, 7, 25 + i)).toISOString().slice(0, 10) }));
  const served = { ...chartRows, [prefix+'usage-by-model-day.v1']: [],
    [prefix+'metering-summary.v1']: [context, ...many] };
  await serveCharts(page, served);
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-tokens-by-day"]');
  const previous = panel.getByRole('button', { name: 'Previous token days' });
  await expect(previous).toBeEnabled();
  for (let i = 0; i < 8; i++) await previous.click();
  await expect(previous).toBeDisabled();
  served[prefix+'metering-summary.v1'] = [context, ...days];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(panel).toContainText('Oct 14');
  await panel.getByRole('button', { name: 'Next token days' }).click();
  await expect(panel.getByRole('button', { name: /^Oct 22:/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Next token days' })).toBeDisabled();
});

test('served model/day rows retain their own series rather than being replaced by metering', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix+'usage-by-model-day.v1']: [
    { usage_day: '2026-10-22', model_id: 'model-primary', input_tokens: 17, output_tokens: 3 },
  ], [prefix+'metering-summary.v1']: [context, ...days] });
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-tokens-by-day"]');
  await expect(panel.getByRole('figure', { name: 'Tokens by model and day' })).toBeVisible();
  await expect(panel.getByRole('figure', { name: 'Daily metering token totals' })).toHaveCount(0);
});
