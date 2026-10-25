import { expect, test } from 'playwright/test';
import { revealRunFields, serveCharts } from './omn21166-chart-fixtures';

// Catch text made too small to read, a return to monospace for human-facing
// values, and larger type clipping real fields at narrow widths. Keep exact data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('recent runs remain readable and retain all fields at desktop and narrow widths', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  await revealRunFields(page);
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

// OMN-21166 (Chrome walk, 2026-10-18): 9 to 11px text survived in table headers, the tier mix, as-of lines, the
// header and the toolbar. This retained check covers Overview and Usage content.
// OMN-21306 adds the whole-shell, SVG and mobile-label census for all eleven destinations in both themes.
test('no visible text on Overview or Usage is smaller than 12px', async ({ page }) => {
  await serveCharts(page);
  for (const path of ['/overview', '/usage']) {
    await page.goto(path);
    await expect(page.locator('.local-dashboard-panel').first()).toBeVisible();
    const small = await page.locator('main').evaluate(main => {
      const found: string[] = [];
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        if (!element || !node.textContent?.trim() || element.getBoundingClientRect().width === 0) continue;
        if (element.closest('svg, canvas, .sr-only')) continue;
        const size = parseFloat(getComputedStyle(element).fontSize);
        if (size < 12) found.push(`${size}px ${element.tagName.toLowerCase()}.${[...element.classList].join('.')}: ${node.textContent.trim().slice(0, 24)}`);
      }
      return [...new Set(found)];
    });
    expect(small, path).toEqual([]);
  }
});
