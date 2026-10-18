import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Catch text made too small to read, a return to monospace for human-facing
// values, and larger type clipping real fields at narrow widths. Keep exact data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('recent runs remain readable and retain all fields at desktop and narrow widths', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  const recent = page.locator('.local-recent-runs-wrap');
  await expect(recent.locator('tbody tr')).not.toHaveCount(0);
  const readValues = () => recent.locator('tbody td').evaluateAll(els => els.map(el => el.textContent));
  const before = await readValues();
  const bodyType = await recent.locator('tbody td[data-label="Model"]').first().evaluate(el => {
    const css = getComputedStyle(el);
    return { size: parseFloat(css.fontSize), family: css.fontFamily };
  });
  expect(bodyType.size).toBeGreaterThanOrEqual(13);
  expect(bodyType.family).toContain('Inter');
  expect(bodyType.family).not.toMatch(/mono/i);
  expect(await recent.locator('tbody td[data-label="Time"]').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  const qualityLabels = page.locator('[data-component="overview-quality"] dt');
  expect(await qualityLabels.evaluateAll(els => Math.min(...els.map(el => parseFloat(getComputedStyle(el).fontSize))))).toBeGreaterThanOrEqual(12);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await readValues()).toEqual(before);
    await expect(recent.locator('tbody tr').first().getByRole('link')).toHaveAttribute('href', /correlation_id=chart-run-a/);
    await page.screenshot({ path: info.outputPath(`readability-${width}.png`), fullPage: true });
  }
});
