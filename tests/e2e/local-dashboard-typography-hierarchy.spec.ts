import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Main Chrome failure: summary captions inherited the numeric metric's 600
// weight and 1.2 leading, while values inherited 900. Check the hierarchy before
// changing it: prose captions need normal weight and comfortable line spacing.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
for (const width of [1440, 390]) {
  test(`Overview summary captions at ${width}px do not inherit numeric metric typography`, async ({ page }, info) => {
    const route = 'overview';
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await serveCharts(page);
    await page.goto('/' + route);
    const cards = page.locator('.ins-kpi');
    await expect(cards.first()).toBeVisible();
    const readings = await cards.locator(':scope > span, :scope > strong, :scope > small').evaluateAll(elements => elements.map(element => {
      const css = getComputedStyle(element);
      return { tag: element.tagName.toLowerCase(), text: element.textContent?.trim(),
        size: parseFloat(css.fontSize), weight: Number(css.fontWeight),
        leading: parseFloat(css.lineHeight) / parseFloat(css.fontSize), family: css.fontFamily };
    }));
    writeFileSync(info.outputPath('summary-type.json'), JSON.stringify({ route, readings }, null, 2));
    const captions = readings.filter(item => item.tag === 'small');
    const values = readings.filter(item => item.tag === 'strong');
    expect(captions.length, 'positive summary-caption control').toBeGreaterThan(0);
    expect(values.length, 'positive numeric-value control').toBeGreaterThan(0);
    for (const caption of captions) {
      expect(caption.size, caption.text).toBeGreaterThanOrEqual(12);
      expect(caption.weight, caption.text).toBeLessThanOrEqual(500);
      expect(caption.leading, caption.text).toBeGreaterThanOrEqual(1.4);
      expect(caption.family).toContain('Inter');
    }
    for (const value of values) {
      expect(value.size, value.text).toBeGreaterThanOrEqual(20);
      expect(value.weight, value.text).toBeLessThanOrEqual(700);
      expect(value.weight, value.text).toBeGreaterThanOrEqual(600);
    }
    await page.screenshot({ path: info.outputPath('summary-type.png'), fullPage: true });
  });
}
