import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 9, AC44 and AC45 (Lakshman, 2026-10-23): the Overview headline cards carry no Details fold and no
// "All calls" / "All-time aggregate" captions. The accounting facts OMN-21304 AC4 requires stay visible under Spend and
// Savings, the modelled label stays beside Savings, the window switch still names the window, and a missing total is
// still a typed state. Declared before the change: a fold left in place, a caption left in place, a required fact
// dropped with the fold, the modelled label lost, the window switch lost, a missing total shown as a number.
const OVERVIEW_MONEY = prefix + 'cost.savings-overview.v1';
const MONEY = [{ window: 'all', captured_at: '2026-10-12T10:07:00Z', total_cost_usd: '0.2300', total_savings_usd: '0.7000',
  run_count: 2, measured_run_count: 2, unknown_run_count: 3, estimated_run_count: 0, tokens_total: 532 }];
const HEADLINE = ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'];
const card = (page: Page, id: string) => page.locator(`[data-component="${id}"]`);

test('AC44 AC45 headline cards show their basis in view, with no Details fold and no window captions', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW_MONEY]: MONEY });
  await page.goto('/overview');
  await expect(card(page, 'overview-savings').locator('.local-dashboard-metric')).toHaveText('$0.70');
  for (const id of HEADLINE) {
    await expect(card(page, id).locator('details')).toHaveCount(0);
    await expect(card(page, id)).not.toContainText('All calls');
    await expect(card(page, id)).not.toContainText('All-time aggregate');
  }
  // OMN-21166 part 12 AC73, as superseded by part 29 AC191: the basis facts are the card's caption, in the page for every
  // reader with no control to open.
  for (const [id, label] of [['overview-spend', 'Actual spend'], ['overview-savings', 'Savings']] as const) {
    // Part 29 AC191: the basis is the card's caption (first line drawn, every line kept in the page), not a popover.
    const tip = card(page, id).locator('.local-card-caption');
    await expect(tip).toHaveCount(1);
    expect(label.length).toBeGreaterThan(0);
    for (const fact of ['Baseline model not recorded', 'Pricing manifest not recorded', 'Unpriced runs not recorded', '3 unknown-provenance runs']) {
      await expect(tip).toContainText(fact);
    }
    // The modelled label stays with Savings: in its caption since part 29 (its tooltip since part 12), never dropped.
    if (id === 'overview-savings') await expect(tip).toContainText('Modelled · vs cloud baseline');
    await expect(tip.locator(':scope > :first-child')).toBeVisible();
  }
  await expect(page.getByRole('radiogroup', { name: 'Figures for', exact: true })).toBeVisible();
});

test('AC45 a missing total is still a typed state (control)', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW_MONEY]: [] });
  await page.goto('/overview');
  await expect(card(page, 'overview-savings').locator('.local-dashboard-metric')).toHaveText('Not measured: overview totals unavailable');
  await expect(card(page, 'overview-savings').locator('.local-dashboard-metric')).toHaveAttribute('data-measured', 'false');
});
