import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: Evidence summary cards have neutral identical borders
// and no logical icon, despite the individual sections having accent identities.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test('Evidence savings labels retain exact decimal strings across the headline and bars', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows,
    [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-22T10:00:00Z',
      total_baseline_cost_usd: '9999999999.99999999', total_cost_usd: '0.00999999',
      total_savings_usd: '9999999999.99000000', measured_run_count: 2 }],
  });
  await page.goto('/delegation-evidence');
  const baseline = page.locator('.barrow').filter({ hasText: 'Cloud baseline cost' });
  await expect(baseline.locator('.val')).toHaveText('$9,999,999,999.99');
  await expect(page.locator('.barrow').filter({ hasText: 'Local / delegated cost' }).locator('.val')).toHaveText('$0.01');
  await expect(page.locator('.ev-savings-hero .big')).toHaveText('$9,999,999,999.99');
  await expect(page.locator('.barrow').filter({ hasText: 'Saved' }).locator('.val')).toHaveText('$9,999,999,999.99');
  await page.screenshot({ path: info.outputPath('evidence-exact-currency.png') });
});
test('Evidence summary cards each have a logical icon, distinct semantic icons on neutral cards', async ({ page }, info) => {
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
      return { border: style.borderTopColor, bottom: style.borderBottomColor, color: getComputedStyle(element.querySelector('svg')!).color, icon: element.querySelector('svg')?.getAttribute('class') };
    }));
    expect(new Set(identities.map(item => item.border)).size).toBe(1);
    expect(new Set(identities.map(item => item.color)).size).toBe(4);
    expect(new Set(identities.map(item => item.icon)).size).toBe(4);
    expect(identities.every(item => item.border === item.bottom)).toBe(true);
    await cards.first().hover();
    await expect.poll(() => cards.first().evaluate(element => getComputedStyle(element).boxShadow)).toBe('none');
    await page.screenshot({ path: info.outputPath(`evidence-card-colors-${theme}.png`) });
  }
});
