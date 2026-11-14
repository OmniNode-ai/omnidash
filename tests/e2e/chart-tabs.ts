// OMN-22168 (Lakshman 2026-11-04/05): the charts on Overview, Runs, Usage and Evidence are rows of tabs, one chart drawn
// at a time. A test reaches a chart the way a reader does, by choosing its tab, and proves the choice took.
import { expect, type Page } from 'playwright/test';

/** OMN-24282: Overview's Runs and Tokens tabs are named for what they count; their charts keep the per-day titles. */
const TAB_FOR_CHART: Readonly<Record<string, string>> = { 'Runs per day': 'Runs', 'Tokens per day': 'Tokens' };
/** The tab that holds the chart with this title (most tabs carry their chart's title). */
export const tabNameFor = (title: string): string => TAB_FOR_CHART[title] ?? title;

/** The tab for a chart title on whatever page is open: a tab named by the title itself (Usage keeps "Tokens per day"),
 * or, on Overview, the tab tabNameFor gives it. */
const tabFor = (page: Page, title: string) => page.getByRole('tab', { name: title, exact: true })
  .or(page.getByRole('tab', { name: tabNameFor(title), exact: true })).first();

/** Chooses the tab for this chart title (see tabFor) and waits until it is the selected one. */
export async function chooseChartTab(page: Page, title: string) {
  const tab = tabFor(page, title);
  await expect(tab).toBeVisible();
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Chooses a chart's tab and returns its panel. Inside a tab the chart's own heading is hidden (the tab names it), so a
 * test reads the chart through the tab panel the tab labels, not through a heading. */
export async function chartTabPanel(page: Page, name: string) {
  await chooseChartTab(page, name);
  const panel = page.getByRole('tabpanel', { name, exact: true })
    .or(page.getByRole('tabpanel', { name: tabNameFor(name), exact: true })).first();
  await expect(panel).toBeVisible();
  return panel;
}
