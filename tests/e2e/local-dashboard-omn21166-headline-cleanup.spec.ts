import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { openWindows, windowTrigger, WINDOW_NAMES } from './overview-window-menu';

// OMN-21166 part 9, AC44 and AC45 (Lakshman, 2026-10-23): the Overview headline cards carry no Details fold and no
// "All calls" / "All-time aggregate" captions. The accounting facts OMN-21304 AC4 requires stay visible under Spend and
// Savings, the modelled label stays beside Savings, the window switch still names the window, and a missing total is
// still a typed state. Declared before the change: a fold left in place, a caption left in place, a required fact
// dropped with the fold, the modelled label lost, the window switch lost, a missing total shown as a number.
// OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): the headline cards read metering-summary.v1, whose row
// names its baseline, pricing version and the runs each total leaves out.
const OVERVIEW_MONEY = prefix + 'metering-summary.v1';
const MONEY = [{ window_kind: 'all', window_start: '', as_of: '2026-10-12T10:07:00Z', baseline_model: 'baseline-a',
  pricing_manifest_version: 'fixture-1', baseline_state: 'resolved', spend_usd: '0.2300', counterfactual_usd: '0.9300',
  savings_usd: '0.7000', runs_total: 5, runs_measured: 2, runs_unknown_tokens: 3, runs_unknown_spend: 0, tokens_in: 512, tokens_out: 20 }];
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
    const text = (await tip.textContent())?.replaceAll('\u2011', '-') ?? '';
    for (const fact of ['Baseline baseline-a · pricing vfixture-1', ...(id === 'overview-spend' ? ['Not counted: 3 runs without token counts'] : [])]) {
      expect(text, `${id}: ${fact}`).toContain(fact);
    }
    // The modelled label stays with Savings: in its caption since part 29 (its tooltip since part 12), never dropped.
    if (id === 'overview-savings') expect(text).toContain('Modelled vs baseline-a');
    await expect(tip.locator(':scope > :first-child')).toBeVisible();
  }
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the window is one "Figures for" button whose list holds the radios.
  await expect(windowTrigger(page)).toBeVisible();
  await expect((await openWindows(page)).getByRole('radio')).toHaveCount(WINDOW_NAMES.length);
});

test('AC45 a missing total is still a typed state (control)', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [OVERVIEW_MONEY]: [] });
  await page.goto('/overview');
  await expect(card(page, 'overview-savings').locator('.local-dashboard-metric')).toHaveText('Not measured: no all-time row');
  await expect(card(page, 'overview-savings').locator('.local-dashboard-metric')).toHaveAttribute('data-measured', 'false');
});
