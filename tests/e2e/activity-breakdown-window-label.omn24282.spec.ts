// the tabs show the total for the chosen window, so each must name that window in the dropdown's own words
// and none may say "per day" beside a total (OMN-24282, reported 2026-11-13).
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

const cases: { name: WindowName; words: string; runs: string; tokens: string }[] = [
  { name: 'All time', words: 'all time', runs: '900 runs', tokens: '3.6K tokens' },
  { name: 'Today (UTC)', words: 'today', runs: '5 runs', tokens: '20 tokens' },
  { name: 'Last 7 days (UTC)', words: 'last 7 days', runs: '25 runs', tokens: '100 tokens' },
  { name: 'Last 15 days (UTC)', words: 'last 15 days', runs: '65 runs', tokens: '260 tokens' },
  { name: 'Last 30 days (UTC)', words: 'last 30 days', runs: '145 runs', tokens: '580 tokens' },
  { name: 'Last 90 days (UTC)', words: 'last 90 days', runs: '305 runs', tokens: '1.22K tokens' },
];

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test('activity_breakdown_window_label: each Runs and Tokens tab names the window its total covers, never per day', async ({ page }) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  for (const c of cases) {
    await chooseWindow(page, c.name);
    const runsTab = page.locator('[data-tabs="chart"] [data-tab="runs"]');
    const tokensTab = page.locator('[data-tabs="chart"] [data-tab="tokens"]');
    await expect(runsTab, `${c.name}: runs tab`).toContainText(c.runs);
    await expect(runsTab, `${c.name}: runs tab`).toContainText(c.words);
    await expect(runsTab).not.toContainText('per day');
    await expect(tokensTab, `${c.name}: tokens tab`).toContainText(c.tokens);
    await expect(tokensTab, `${c.name}: tokens tab`).toContainText(c.words);
    await expect(tokensTab).not.toContainText('per day');
  }
});
