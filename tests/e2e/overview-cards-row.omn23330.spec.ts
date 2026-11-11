import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, meteringAll, prefix, serveCharts } from './omn21166-chart-fixtures';

// The operator, 2026-11-10: "in overview all 5 cards in a row". Measured on the lab with large figures before the change:
// one row at 1280 and 1440, but at 1280 the "Delegation Quality" label ran 4 px past its card (the AC9 one-line rule
// started at 1200 px), and at 1100 px and below the cards went two to a row (2, 2, 1). Laid out on one row at 1100 px, the
// tokens figure ("930.44M") was clipped by 17 px: it was the one figure not sized to its card.
// Failure modes:
//   R1  at a desktop width (901 px and up) a card leaves the row;
//   R2  a figure is clipped, or any text runs past its card;
//   R3  a figure shrinks below 16 px to fit;
//   R4  the check is blind: the cards hold no measured figure.
const all = meteringAll({ total_cost_usd: '12345.67', total_savings_usd: '45678.90', total_baseline_cost_usd: '58024.57', run_count: 289301,
  tokens_input_total: 586080123, tokens_output_total: 344360456 });
const rows = { ...chartRows, [prefix + 'metering-summary.v1']: [...(chartRows[prefix + 'metering-summary.v1'] as unknown[]), all] };

for (const width of [1440, 1280, 1100, 1025, 920]) {
  test(`Overview at ${width}: every headline card on one row, nothing clipped`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await serveCharts(page, rows);
    await page.goto('/overview');
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('.local-overview-summary .local-dashboard-metric').first()).toBeVisible();
    const measured = await page.evaluate(() => {
      const cards = [...document.querySelector('.local-overview-summary')!.children] as HTMLElement[];
      return cards.map((card) => {
        const box = card.getBoundingClientRect();
        const figure = card.querySelector<HTMLElement>('.local-dashboard-metric');
        return { name: card.querySelector('h2')?.textContent?.trim(), top: Math.round(box.top), width: Math.round(box.width),
          figure: figure?.textContent?.trim() ?? null, font: figure ? parseFloat(getComputedStyle(figure).fontSize) : null,
          clipped: figure ? figure.scrollWidth - figure.clientWidth : 0,
          spill: [...card.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > box.right + 1).map((el) => el.textContent?.slice(0, 30)) };
      });
    });
    await page.screenshot({ path: info.outputPath(`overview-cards-${width}.png`) });
    writeFileSync(info.outputPath(`overview-cards-${width}.json`), JSON.stringify(measured, null, 2));
    // R4: the figures are measured ones.
    expect(measured.filter((card) => card.figure && /\d/.test(card.figure)).length).toBeGreaterThanOrEqual(4);
    // R1: one row.
    expect(new Set(measured.map((card) => card.top)).size).toBe(1);
    // R2: nothing clipped or spilling.
    expect(measured.filter((card) => card.clipped > 0 || card.spill.length > 0)).toEqual([]);
    // R3: no figure under 16 px.
    expect(measured.filter((card) => card.font !== null && card.font < 16)).toEqual([]);
  });
}
