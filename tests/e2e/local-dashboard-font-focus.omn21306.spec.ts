import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// The census at rest misses the donut's interactive text; exercise the actual visible state.
// OMN-21166 part 18 AC120: Runs' routing breakdown is a table shown directly, so its visible text is what is measured.
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`AC1 focused tier labels retain a 12px floor at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await serveCharts(page);
    // OMN-21166 Maple grid: the tier donut and its focus label are gone. The routing table is Runs' routing breakdown
    // ("More analysis"); Overview's ranked tier bars are measured too. Same 12px floor on the actual visible text.
    await page.goto('/overview');
    // OMN-21166 live review 2026-10-25: the Overview chart cell is no longer a named region; it is found by its component.
    const ranked = page.locator('[data-component="overview-tier-mix"] figure.rb-chart');
    await expect(ranked).toBeVisible();
    const rankedFonts = await ranked.evaluate(el => [el, ...el.querySelectorAll('*')]
      .filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
      .map(node => ({ text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize) })));
    expect(rankedFonts.length).toBeGreaterThan(0);
    expect(rankedFonts.filter(row => row.size < 12)).toEqual([]);
    await page.goto('/runs');
    await page.getByText('More analysis', { exact: true }).press('Enter');
    const area = page.getByRole('region', { name: 'Tier mix', exact: true });
    // OMN-21166 part 18 AC120: the routing breakdown has no pinnable tier bars, focus label or nested disclosure; its
    // table is shown directly, so the 12px floor is read on the table's and the totals' visible text.
    await expect(area.getByRole('button', { name: 'Inspect Local', exact: true })).toHaveCount(0);
    await expect(area.locator('.local-chart-detail')).toHaveCount(0);
    const table = area.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('75.0%');
    await table.scrollIntoViewIfNeeded();
    await expect(table).toBeInViewport();
    const result = await area.evaluate(el => {
      const targets = [...el.querySelectorAll('table, dl')];
      const nodes = targets.flatMap(target => [target, ...target.querySelectorAll('*')])
        .filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()));
      return nodes.map(node => ({ text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize), rect: node.getBoundingClientRect().toJSON() }));
    });
    writeFileSync(info.outputPath('focused-fonts.json'), JSON.stringify({ viewport, result }, null, 2));
    await page.screenshot({ path: info.outputPath('focused-tier.png'), fullPage: true });
    expect(result.length).toBeGreaterThan(0);
    expect(result.filter(row => row.size < 12)).toEqual([]);
  });
}
