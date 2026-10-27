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
  // Live review 2026-10-26: the three money figures are hatched ranked bars; each bar's value is its label on hover.
  const bar = (key: string) => page.locator(`[data-panel-title="SAVINGS vs CLOUD BASELINE"] [data-ranked-item="${key}"] .rb-value`);
  await expect(bar('baseline')).toHaveText('$9,999,999,999.99');
  await expect(bar('cost')).toHaveText('$0.01');
  await expect(page.locator('.ev-savings-hero .big')).toHaveText('$9,999,999,999.99');
  await expect(bar('savings')).toHaveText('$9,999,999,999.99');
  await page.screenshot({ path: info.outputPath('evidence-exact-currency.png') });
});
// Part 15 AC91 (Lakshman 2026-10-25 "make sure all pages follow overview page style"; "each card a different colour"):
// Evidence's four cards are Overview's cards, so each wears its own identity icon; since part 27 AC167 the edge is the
// one neutral line on every card.
test('Evidence summary cards each have a logical icon and their own identity colour', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/delegation-evidence');
  const cards = page.locator('.ev-root article[data-kpi-card]');
  await expect(cards).toHaveCount(4);
  await expect(cards.locator('h2 svg')).toHaveCount(4);
  for (const theme of ['dark', 'light']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if ((current === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    const identities = await cards.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, bottom: style.borderBottomColor, color: getComputedStyle(element.querySelector('svg')!).color, icon: element.querySelector('svg')?.getAttribute('class') };
    }));
    expect(new Set(identities.map(item => item.border)).size).toBe(1);
    // Part 28 AC177: the card icons are grey (one colour); each card is still told apart by its own icon shape.
    expect(new Set(identities.map(item => item.color)).size).toBe(1);
    expect(new Set(identities.map(item => item.icon)).size).toBe(4);
    await cards.first().hover();
    await expect.poll(() => cards.first().evaluate(element => getComputedStyle(element).boxShadow)).toBe('none');
    await page.screenshot({ path: info.outputPath(`evidence-card-colors-${theme}.png`) });
  }
});
