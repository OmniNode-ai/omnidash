import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// The census at rest misses the donut's interactive text; exercise the actual visible state.
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`AC1 focused tier labels retain a 12px floor at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await serveCharts(page);
    await page.goto('/overview');
    const item = page.locator('.local-share-legend').getByRole('listitem').first();
    await item.hover();
    const label = page.getByTestId('tier-focus');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('local75.0%');
    const select = item.getByRole('button', { name: 'Inspect local', exact: true });
    await select.press('Enter');
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    // Pin the same tier from the keyboard before scrolling so phone screenshots include the actual label.
    await page.locator('.local-donut-row').scrollIntoViewIfNeeded();
    await expect(label).toBeInViewport();
    const result = await label.evaluate(el => {
      const nodes = [el, ...el.querySelectorAll('*')].filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()));
      return nodes.map(node => ({ text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize), rect: node.getBoundingClientRect().toJSON() }));
    });
    writeFileSync(info.outputPath('focused-fonts.json'), JSON.stringify({ viewport, result }, null, 2));
    await page.screenshot({ path: info.outputPath('focused-tier.png'), fullPage: true });
    expect(result.length).toBeGreaterThan(0);
    expect(result.filter(row => row.size < 12)).toEqual([]);
  });
}
