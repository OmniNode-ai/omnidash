// The tabs show the total for the window chosen in the dropdown, so none may say "per day" beside a total
// (OMN-24282, reported 2026-11-13); the dropdown names the window, so a tab shows its number alone under "Total runs" or "Total tokens", with no window
// suffix (Lakshman 2026-11-14).
// One test per acceptance criterion, so each criterion's contract check runs only its own assertions. Every title starts
// activity_breakdown_window_label, so the criteria's written falsifier (-g activity_breakdown_window_label) runs all three.
import { expect, test, type Locator, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseWindow, openWindows, type WindowName } from './overview-window-menu';

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

const routingTopic = prefix + 'delegation.model-routing.v1';
const meteringTopic = prefix + 'metering-summary.v1';
const [sharedRouting] = chartRows[routingTopic] as Record<string, unknown>[];
// The shared fixture's routing row serves no by_model, so its Model usage tab reads "Models not measured" and carries no
// number to judge. Three models here, against two tier-routed tiers, so a tab showing the other tab's count is caught.
const byModel = [
  { model_name: 'model-a', total_count: 6, pct_of_total: 0.6 },
  { model_name: 'model-b', total_count: 3, pct_of_total: 0.3 },
  { model_name: 'model-c', total_count: 1, pct_of_total: 0.1 },
];
const sharedTiers = (sharedRouting.by_tier as { tiers: Record<string, unknown>[] }).tiers;
// The served routing view also carries the runs that were not tier-routed as a tier row; Tier mix draws only the
// tier-routed ones, so this row must not change the count.
const tiers = [...sharedTiers, { cost_tier_name: 'not tier-routed', count: 2, tier_routed: false, pct_of_tier_routed: 0 }];
const routedTiers = tiers.filter(tier => tier.tier_routed === true).length;
if (routedTiers !== 2 || tiers.length !== 3) throw new Error('the shared routing fixture changed: expected two tier-routed tiers');
const routing = { ...sharedRouting, by_model: byModel, by_tier: { ...(sharedRouting.by_tier as object), tiers } };
const MODELS = `${byModel.length} models`;
const TIERS = `${routedTiers} tiers`;

// The fixtures' clock is 2026-10-30 (UTC). Each rolling window of N days starts N-1 days back and ends today, so a row
// sits on each window's first day, on the day before it, and on the day after today, and each row's runs is its own
// power of two: a window one day too long or too short, at either end, changes its sum.
const dayRuns: [string, number][] = [
  ['2026-10-31', 512], // the day after today, in no window
  ['2026-10-30', 1], // today
  ['2026-10-24', 2], // first day of the last 7
  ['2026-10-23', 4], // the day before it
  ['2026-10-16', 8], // first day of the last 15
  ['2026-10-15', 16],
  ['2026-10-01', 32], // first day of the last 30
  ['2026-09-30', 64],
  ['2026-08-02', 128], // first day of the last 90
  ['2026-08-01', 256],
];
const rows = {
  ...chartRows,
  [routingTopic]: [routing],
  [meteringTopic]: [row('all', '', 900), ...dayRuns.map(([day, runs]) => row('day', day, runs))],
};

type Choice = { name: string; runs: string; tokens: string };
// Every choice the window menu lists, then three days picked in its calendar (the menu's title names "a picked day"):
// one in the past, today, which is a different window from the Today radio, and one in the month before.
const listed: (Choice & { name: WindowName })[] = [
  { name: 'All time', runs: '900 runs', tokens: '3.6K tokens' },
  { name: 'Today (UTC)', runs: '1 runs', tokens: '4 tokens' },
  { name: 'Last 7 days (UTC)', runs: '3 runs', tokens: '12 tokens' },
  { name: 'Last 15 days (UTC)', runs: '15 runs', tokens: '60 tokens' },
  { name: 'Last 30 days (UTC)', runs: '63 runs', tokens: '252 tokens' },
  { name: 'Last 90 days (UTC)', runs: '255 runs', tokens: '1.02K tokens' },
];
// OMN-24282 Amendment 4: a third day in the month before, reached with the calendar's "Previous month" button. It stays
// last because the calendar opens on the chosen day's month.
const picked: (Choice & { day: number; iso: string; monthsBack?: number })[] = [
  { name: 'Picked day 2026-10-23', day: 23, iso: '2026-10-23', runs: '4 runs', tokens: '16 tokens' },
  { name: 'Picked day 2026-10-30', day: 30, iso: '2026-10-30', runs: '1 runs', tokens: '4 tokens' },
  { name: 'Picked day 2026-09-30', day: 30, iso: '2026-09-30', monthsBack: 1, runs: '64 runs', tokens: '256 tokens' },
];
const TAB_IDS = ['runs', 'tokens', 'models', 'tiers'];
const HEADINGS: Record<string, string> = { runs: 'Total runs', tokens: 'Total tokens', models: 'Model usage', tiers: 'Tier mix' };
// The scales formatDashboardCount writes (src/theme/format/count.ts).
const COUNT = String.raw`\d[\d.,]*(?:K|M|B|T|Qa|Qi)?`;

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const tabs = (page: Page): Locator => page.locator('[data-tabs="chart"] [data-tab]');
const tab = (page: Page, id: string): Locator => page.locator(`[data-tabs="chart"] [data-tab="${id}"]`);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The tab's text ends in exactly this number and unit, with no digit, point or comma before it. */
const endsWith = (value: string) => new RegExp(`(?<![\\d.,])${escape(value)}$`);

/**
 * What a tab shows or announces beyond its text: CSS ::before/::after content and title or aria labels, on the tab and
 * everything inside it. A suffix or "per day" put there would be seen or read beside the number without being text.
 * The tab's own aria-label is reported as "tab aria-label <value>" (Tabs.tsx names a stat tab by its heading).
 */
async function extras(locator: Locator): Promise<string[]> {
  return locator.evaluate(tabElement => {
    const found: string[] = [];
    for (const el of [tabElement, ...tabElement.querySelectorAll('*')]) {
      const who = el === tabElement ? 'tab' : el.tagName.toLowerCase();
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(el, pseudo).content;
        // A decorative pseudo-element carries empty content ("" or ''), which shows nothing.
        if (content && !['none', 'normal', '""', "''"].includes(content)) found.push(`${who} ${pseudo} ${content}`);
      }
      for (const name of ['title', 'aria-label', 'aria-description']) {
        const value = el.getAttribute(name);
        if (value) found.push(`${who} ${name} ${value}`);
      }
    }
    return found;
  });
}

async function openOverview(page: Page, served: Record<string, unknown[]> = rows) {
  await serveCharts(page, served);
  await page.goto('/overview');
  await expect(tabs(page)).toHaveCount(TAB_IDS.length, { timeout: 15000 });
}

/**
 * Opens Overview and runs `check` once for every window choice. It first proves the choices are exactly the ones
 * listed here (a window added to the menu and not to this test fails, in either direction) and the tabs are exactly
 * the four this ticket covers, so no choice and no tab goes unjudged.
 */
async function everyChoice(page: Page, check: (choice: Choice) => Promise<void>) {
  await openOverview(page);
  const list = await openWindows(page);
  const offered = await list.getByRole('radio').evaluateAll(radios => radios.map(radio => radio.getAttribute('aria-label')));
  expect(offered, 'the window menu offers exactly the listed choices').toEqual(listed.map(choice => choice.name));
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  expect(await tabs(page).evaluateAll(found => found.map(el => el.getAttribute('data-tab'))), 'the Activity breakdown tabs').toEqual(TAB_IDS);
  for (const choice of listed) {
    await chooseWindow(page, choice.name);
    await check(choice);
  }
  for (const choice of picked) {
    await page.getByRole('button', { name: /^Pick a UTC day/ }).click();
    const calendar = page.getByRole('dialog');
    for (let back = 0; back < (choice.monthsBack ?? 0); back += 1) {
      await calendar.getByRole('button', { name: 'Previous month' }).click();
    }
    await calendar.locator('button.local-calendar-day', { hasText: new RegExp(`^${choice.day}$`) }).click();
    await expect(calendar).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Pick a UTC day, ${choice.iso} chosen` })).toBeVisible();
    await check(choice);
  }
}

test('activity_breakdown_window_label_ac1: the first two tabs are headed Total runs and Total tokens, and every tab shows its number alone, for every window choice', async ({ page }) => {
  await everyChoice(page, async choice => {
    const at = choice.name;
    await expect(tab(page, 'runs'), `${at}: runs tab`).toHaveText(new RegExp(`^Total runs${COUNT} runs$`));
    await expect(tab(page, 'tokens'), `${at}: tokens tab`).toHaveText(new RegExp(`^Total tokens${COUNT} tokens$`));
    await expect(tab(page, 'models'), `${at}: models tab`).toHaveText(/^Model usage\d+ models?$/);
    await expect(tab(page, 'tiers'), `${at}: tiers tab`).toHaveText(/^Tier mix\d+ tiers?$/);
    for (const id of TAB_IDS) {
      await expect(tab(page, id), `${at}: ${id} tab`).not.toContainText('·');
      // Its accessible name is its heading alone, and nothing else is shown or announced beside the number.
      expect(await extras(tab(page, id)), `${at}: ${id} tab beyond its text`).toEqual([`tab aria-label ${HEADINGS[id]}`]);
    }
  });
});

test('activity_breakdown_window_label_ac2: no tab reads per day beside its total, for every window choice', async ({ page }) => {
  await everyChoice(page, async choice => {
    const at = choice.name;
    // Each tab's number is a total, so each must be presented as one: its heading and its total and nothing else, so no
    // daily wording ("Daily runs", "Runs / day", "Runs per UTC day") can stand beside it.
    await expect(tab(page, 'runs'), `${at}: runs tab presents its total as a total`).toHaveText(`Total runs${choice.runs}`);
    await expect(tab(page, 'tokens'), `${at}: tokens tab presents its total as a total`).toHaveText(`Total tokens${choice.tokens}`);
    await expect(tab(page, 'models'), `${at}: models tab presents its total as a total`).toHaveText(`Model usage${MODELS}`);
    await expect(tab(page, 'tiers'), `${at}: tiers tab presents its total as a total`).toHaveText(`Tier mix${TIERS}`);
    for (const id of TAB_IDS) {
      await expect(tab(page, id), `${at}: ${id} tab`).not.toHaveText(/per[\s-]*day/i);
      expect((await extras(tab(page, id))).filter(extra => /per[\s-]*day/i.test(extra)), `${at}: ${id} tab, beyond its text`).toEqual([]);
    }
  });
});

test('activity_breakdown_window_label_ac3: every tab shows the served total for every window choice', async ({ page }) => {
  await everyChoice(page, async choice => {
    const at = choice.name;
    await expect(tab(page, 'runs'), `${at}: runs`).toHaveText(endsWith(choice.runs));
    await expect(tab(page, 'tokens'), `${at}: tokens`).toHaveText(endsWith(choice.tokens));
    // Models and tiers are served all time only (the page's caption says so), so every window shows the served counts.
    await expect(tab(page, 'models'), `${at}: models`).toHaveText(endsWith(MODELS));
    await expect(tab(page, 'tiers'), `${at}: tiers`).toHaveText(endsWith(TIERS));
  });
  // With no all-time metering row, All time's runs come from the routing view's served total instead.
  await page.goto('about:blank');
  await openOverview(page, { ...rows, [meteringTopic]: dayRuns.map(([day, runs]) => row('day', day, runs)) });
  // First prove the metering read of this load has landed (Today reads its day row), so All time below is judged on the
  // served rows and not on a page that has not read them yet.
  await chooseWindow(page, 'Today (UTC)');
  await expect(tab(page, 'runs'), 'no all-time row, Today: runs').toHaveText(endsWith('1 runs'));
  await chooseWindow(page, 'All time');
  await expect(tab(page, 'runs'), 'All time with no all-time row: runs').toHaveText(endsWith(`${String(sharedRouting.total_delegations)} runs`));
});
