import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Main Chrome failure: summary captions inherited the numeric metric's 600
// weight and 1.2 leading, while values inherited 900. Check the hierarchy before
// changing it: prose captions need normal weight and comfortable line spacing.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
for (const width of [1440, 390]) {
  test(`Overview summary captions at ${width}px do not inherit numeric metric typography`, async ({ page }, info) => {
    const route = 'overview';
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    // The all-time money row is served so the four money cards carry a figure and a tooltip (the default fixture has none).
    await serveCharts(page, { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-12T10:07:00Z',
      total_cost_usd: '0.2300', total_savings_usd: '0.7000', run_count: 2, measured_run_count: 2, unknown_run_count: 3, estimated_run_count: 0, tokens_total: 532 }] });
    await page.goto('/' + route);
    // OMN-21166 live review 2026-10-25: the .ins-kpi window cards are deleted (AC86); the headline cards are the Overview
    // summary now. A card's caption lines sit in its tooltip (opened by hovering the card), its value is the metric.
    const cards = page.locator('.local-overview-summary article[data-component]');
    await expect(cards.first()).toBeVisible();
    // Part 29 AC191: the small text is the drawn caption under each figure (no popover to open).
    await expect(cards.locator('.local-card-caption > :first-child').first()).toBeVisible();
    const read = (selector: string, tag: string) => cards.locator(selector).evaluateAll((elements, tagName) => elements.map(element => {
      const css = getComputedStyle(element);
      return { tag: tagName, text: element.textContent?.trim(),
        size: parseFloat(css.fontSize), weight: Number(css.fontWeight),
        leading: parseFloat(css.lineHeight) / parseFloat(css.fontSize), family: css.fontFamily };
    }), tag);
    const readings = [...await read('.local-card-caption > :first-child', 'small'), ...await read('.local-dashboard-metric', 'strong')];
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
      // OMN-21166 part 27 AC166: figures are JetBrains Mono at its bundled 500 weight (no new weight file).
      expect(value.weight, value.text).toBeGreaterThanOrEqual(500);
      expect(value.family, value.text).toMatch(/JetBrains Mono/);
    }
    await page.screenshot({ path: info.outputPath('summary-type.png'), fullPage: true });
  });
}
