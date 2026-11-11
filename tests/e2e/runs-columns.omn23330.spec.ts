import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

// The operator, 2026-11-10, on the Runs table (dark, Model beside Tokens): "in column why gap - make it dynamic". The Model
// column is sized to its longest name (2026-11-07 "why gap?"), but the table filled its panel with a fixed layout, so the
// browser stretched every column by the same factor: measured on the lab, Model declared 160 px drew 188 px at 1440 and
// 269 px at 1920, Tokens 110 px drew 129 and 185. Now each column keeps its own width and only the last shown column takes
// the room left over, so the spare space sits after the last value, never between two columns.
// Failure modes:
//   C1  a column other than the last draws wider than its own width (a gap between columns);
//   C2  the table no longer fills its panel (the last column does not take the room left);
//   C3  the check is blind: the columns it reads are not drawn.
for (const width of [1440, 1920]) {
  test(`Runs table at ${width}: each column keeps its width, the last takes the room left`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await serveCharts(page, chartRows);
    await page.goto('/runs');
    const table = page.locator('[data-component="recent-runs"] .local-runs-wrap table').first();
    await expect(table).toBeVisible();
    const measured = await table.evaluate((element) => {
      const shown = [...element.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().width > 0) as HTMLElement[];
      return { table: Math.round(element.getBoundingClientRect().width), wrap: Math.round(element.parentElement!.getBoundingClientRect().width),
        columns: shown.map((th) => ({ column: th.dataset.column, declared: th.style.width, drawn: Math.round(th.getBoundingClientRect().width) })) };
    });
    writeFileSync(info.outputPath(`runs-columns-${width}.json`), JSON.stringify(measured, null, 2));
    // C3: the default columns are drawn.
    expect(measured.columns.length).toBeGreaterThanOrEqual(6);
    // C1: every column but the last draws at its own width.
    const stretched = measured.columns.slice(0, -1).filter((column) => Math.abs(column.drawn - parseFloat(column.declared)) > 1);
    expect(stretched).toEqual([]);
    // C2: the table still fills its panel.
    expect(measured.wrap - measured.table).toBeLessThanOrEqual(2);
  });
}
