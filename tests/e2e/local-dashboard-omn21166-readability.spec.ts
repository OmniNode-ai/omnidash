import { expect, test } from 'playwright/test';
import { revealRunFields, serveCharts } from './omn21166-chart-fixtures';

// Catch text made too small to read, a return to monospace for human-facing
// values, and larger type clipping real fields at narrow widths. Keep exact data.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test('recent runs remain readable and retain all fields at desktop and narrow widths', async ({ page }, info) => {
  await serveCharts(page);
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs is deleted from Overview, so the same readability checks run on the
  // Runs list, which shows the same fields.
  await page.goto('/runs');
  // The Runs table has no data-label cells: Model is its fifth column and Created its second.
  const recent = page.locator('.local-runs-wrap');
  await expect(recent.locator('tbody tr')).not.toHaveCount(0);
  const cellType = (column: number) => recent.locator('tbody tr').first().locator('td').nth(column).evaluate(el => {
    const css = getComputedStyle(el);
    return { size: parseFloat(css.fontSize), family: css.fontFamily };
  });
  // OMN-21166 live review 2026-10-25: the Runs list sets its body at 13px in the compact view and at the 12px floor
  // with every field shown (the dense layout), so the 13px check reads the compact view, before the fields are revealed.
  // Task type (the 14th column) is the human-facing value: the Runs table keeps run ids and the model id in the
  // identifier face (JetBrains Mono, as on dev), so Inter and 'not monospace' are read from Task type, size from both.
  const compact = await cellType(13);
  expect(compact.size).toBeGreaterThanOrEqual(13);
  expect(compact.family).toContain('Inter');
  expect(compact.family).not.toMatch(/mono/i);
  expect((await cellType(4)).size).toBeGreaterThanOrEqual(12);
  await revealRunFields(page);
  const readValues = () => recent.locator('tbody td').evaluateAll(els => els.map(el => el.textContent));
  const before = await readValues();
  const bodyType = await cellType(13);
  expect(bodyType.size).toBeGreaterThanOrEqual(12);
  expect(bodyType.family).toContain('Inter');
  expect(bodyType.family).not.toMatch(/mono/i);
  expect((await cellType(1)).size).toBeGreaterThanOrEqual(12);
  // OMN-21166 AC86 (Lakshman 2026-10-25): the Quality panel's detail list (dt labels) is deleted; Quality is a card whose
  // text the 12px test below covers.
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
