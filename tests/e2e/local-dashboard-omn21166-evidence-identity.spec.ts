import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Before implementation: Evidence summary cards have neutral identical borders
// and no logical icon, despite the individual sections having accent identities.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test('Evidence summary cards each have a logical icon, full accent border and matching hover glow', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/delegation-evidence');
  const cards = page.locator('.ev-root .kpi');
  await expect(cards).toHaveCount(4);
  await expect(cards.locator('.k-l svg')).toHaveCount(4);
  for (const theme of ['dark', 'light']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if ((current === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    const identities = await cards.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, bottom: style.borderBottomColor, icon: element.querySelector('svg')?.getAttribute('class') };
    }));
    expect(new Set(identities.map(item => item.border)).size).toBe(4);
    expect(new Set(identities.map(item => item.icon)).size).toBe(4);
    expect(identities.every(item => item.border === item.bottom)).toBe(true);
    await cards.first().hover();
    await expect.poll(() => cards.first().evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.screenshot({ path: info.outputPath(`evidence-card-colors-${theme}.png`) });
  }
});
