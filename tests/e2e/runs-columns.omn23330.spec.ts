import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

// The operator, 2026-11-10, on the Runs table (dark, Model beside Tokens): "in column why gap - make it dynamic". The Model
// column is sized to its longest name (2026-11-07 "why gap?"), but the table filled its panel with a fixed layout, so the
// browser stretched every column by the same factor: measured on the lab, Model declared 160 px drew 188 px at 1440 and
// 269 px at 1920, Tokens 110 px drew 129 and 185. The last shown column then took all the room left over, which the
// operator saw on 2026-11-11 as empty space after Duration ("why right side too much space left?") and chose to spread
// evenly: every shown column draws its own width plus the same share of the room left, so no column grows more than
// another (Model no longer grows by its size) and no hole sits at either end.
// Failure modes:
//   C1  one column takes more of the room left than another (a hole after the last value, or Model growing most);
//   C2  the table no longer fills its panel;
//   C3  the check is blind: the columns it reads are not drawn.
for (const width of [1440, 1920]) {
  test(`Runs table at ${width}: each column draws its own width plus the same share of the room left`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await serveCharts(page, chartRows);
    await page.goto('/runs');
    const table = page.locator('[data-component="recent-runs"] .local-runs-wrap table').first();
    await expect(table).toBeVisible();
    const measured = await table.evaluate((element) => {
      const shown = [...element.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().width > 0) as HTMLElement[];
      return { table: Math.round(element.getBoundingClientRect().width), wrap: Math.round(element.parentElement!.getBoundingClientRect().width),
        columns: shown.map((th) => ({ column: th.dataset.column, own: Number(th.dataset.width), drawn: th.getBoundingClientRect().width })) };
    });
    writeFileSync(info.outputPath(`runs-columns-${width}.json`), JSON.stringify(measured, null, 2));
    // C3: the default columns are drawn.
    expect(measured.columns.length).toBeGreaterThanOrEqual(6);
    // C1: every column's extra width (drawn less its own) is the same, within a pixel, and never negative.
    for (const column of measured.columns) expect(Number.isFinite(column.own) && column.own > 0, `${column.column} declares its own width`).toBe(true);
    const extras = measured.columns.map((column) => column.drawn - column.own);
    expect(Math.max(...extras) - Math.min(...extras), JSON.stringify(extras)).toBeLessThanOrEqual(1);
    expect(Math.min(...extras)).toBeGreaterThanOrEqual(-0.5);
    // C2: the table still fills its panel.
    expect(measured.wrap - measured.table).toBeLessThanOrEqual(2);
  });
}
