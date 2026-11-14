// The tabs show the total for the window chosen in the dropdown, so none may say "per day" beside a total
// (OMN-24282, reported 2026-11-13); the dropdown names the window, so a tab shows its number alone under "Total runs" or "Total tokens", with no window
// suffix (Lakshman 2026-11-14).
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseWindow, type WindowName } from './overview-window-menu';

function row(kind: string, start: string, runs: number) {
  return {
    tenant_id: 'chart-fixture-tenant',
    window_kind: kind,
    window_start: start,
    as_of: '2026-10-30T11:00:00Z',
    baseline_model: 'baseline-a',
    pricing_manifest_version: 'fixture-1',
    baseline_state: 'resolved',
    spend_usd: null,
    savings_usd: null,
    counterfactual_usd: null,
    runs_total: runs,
    runs_measured: runs,
    runs_unknown_tokens: 0,
    runs_unknown_spend: 0,
    tokens_in: runs * 3,
    tokens_out: runs,
  };
}

const rows = {
  ...chartRows,
  [prefix + 'metering-summary.v1']: [
    row('all', '', 900),
    row('day', '2026-10-30', 5),
    row('day', '2026-10-27', 20),
    row('day', '2026-10-20', 40),
    row('day', '2026-10-05', 80),
    row('day', '2026-08-15', 160),
  ],
};

const cases: { name: WindowName; runs: string; tokens: string }[] = [
  { name: 'All time', runs: '900 runs', tokens: '3.6K tokens' },
  { name: 'Today (UTC)', runs: '5 runs', tokens: '20 tokens' },
  { name: 'Last 7 days (UTC)', runs: '25 runs', tokens: '100 tokens' },
  { name: 'Last 15 days (UTC)', runs: '65 runs', tokens: '260 tokens' },
  { name: 'Last 30 days (UTC)', runs: '145 runs', tokens: '580 tokens' },
  { name: 'Last 90 days (UTC)', runs: '305 runs', tokens: '1.22K tokens' },
];

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test('activity_breakdown_window_label: each tab shows its total for the chosen window, never per day and never a window suffix', async ({ page }) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  const tab = (id: string) => page.locator(`[data-tabs="chart"] [data-tab="${id}"]`);
  for (const c of cases) {
    await chooseWindow(page, c.name);
    await expect(tab('runs'), `${c.name}: runs tab`).toHaveText(`Total runs${c.runs}`);
    await expect(tab('tokens'), `${c.name}: tokens tab`).toHaveText(`Total tokens${c.tokens}`);
    for (const id of ['runs', 'tokens', 'models', 'tiers']) {
      await expect(tab(id), `${c.name}: ${id} tab`).not.toContainText('per day');
      await expect(tab(id), `${c.name}: ${id} tab`).not.toContainText('·');
    }
  }
});
