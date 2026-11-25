// OMN-26515: an install that has never recorded a run reads "0 runs" on Overview's Total runs tab, for the chosen window;
// a store that cannot be read still reads "Runs not measured", so empty and unreadable stay distinct.
// Every title starts overview_runs_empty_store, so the criteria's written falsifier (-g overview_runs_empty_store) runs all.
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { chooseWindow, type WindowName } from './overview-window-menu';

const routingTopic = prefix + 'delegation.model-routing.v1';
const meteringTopic = prefix + 'metering-summary.v1';
const decisionsTopic = prefix + 'delegation.decisions.v1';
const WINDOWS: WindowName[] = ['All time', 'Today (UTC)', 'Last 7 days (UTC)', 'Last 30 days (UTC)'];
const [sharedRouting] = chartRows[routingTopic] as Record<string, unknown>[];

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const runsTab = (page: Page) => page.locator('[data-tabs="chart"] [data-tab="runs"]');
const strip = (page: Page) => page.getByRole('status', { name: 'Runtime status' });

async function openOverview(page: Page) {
  await page.goto('/overview');
  await expect(runsTab(page)).toBeVisible({ timeout: 15000 });
}

async function expectRuns(page: Page, text: string, absent: string) {
  for (const name of WINDOWS) {
    if (name !== 'All time') await chooseWindow(page, name);
    await expect(runsTab(page), name).toContainText(text);
    await expect(runsTab(page), name).not.toContainText(absent);
    await expect(strip(page), name).toContainText(text);
  }
}

test('overview_runs_empty_store: a store that serves no rows reads 0 runs for every window', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [meteringTopic]: [], [routingTopic]: [], [decisionsTopic]: [] });
  await openOverview(page);
  await expectRuns(page, '0 runs', 'Runs not measured');
});

test('overview_runs_empty_store: a routing row with total_delegations 0 and no metering rows reads 0 runs for every window', async ({ page }) => {
  const zeroRouting = { ...sharedRouting, total_delegations: 0, by_model: [], by_tier: { tiers: [] } };
  await serveCharts(page, { ...chartRows, [meteringTopic]: [], [routingTopic]: [zeroRouting], [decisionsTopic]: [] });
  await openOverview(page);
  await expectRuns(page, '0 runs', 'Runs not measured');
});

test('overview_runs_empty_store: a store that cannot be read reads Runs not measured, not 0 runs', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [meteringTopic]: [], [routingTopic]: [], [decisionsTopic]: [] });
  for (const topic of [meteringTopic, routingTopic]) {
    await page.route(`**/projection/${encodeURIComponent(topic)}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }));
  }
  await openOverview(page);
  for (const name of WINDOWS) {
    if (name !== 'All time') await chooseWindow(page, name);
    await expect(runsTab(page), name).toContainText('Runs not measured');
    await expect(runsTab(page), name).not.toContainText('0 runs');
    await expect(strip(page), name).toContainText('Runs not measured');
  }
});

test('overview_runs_empty_store: a routing store that cannot be read beside an empty metering read reads Runs not measured, not 0 runs', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [meteringTopic]: [], [routingTopic]: [], [decisionsTopic]: [] });
  await page.route(`**/projection/${encodeURIComponent(routingTopic)}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }));
  await openOverview(page);
  await expectRuns(page, 'Runs not measured', '0 runs');
});
