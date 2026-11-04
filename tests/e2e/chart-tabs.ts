// OMN-22168 (Lakshman 2026-11-04/05): the charts on Overview, Runs, Usage and Evidence are rows of tabs, one chart drawn
// at a time. A test reaches a chart the way a reader does, by choosing its tab, and proves the choice took.
import { expect, type Page } from 'playwright/test';

/** Chooses the tab with this accessible name (a tab's label) and waits until it is the selected one. */
export async function chooseChartTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true }).first();
  await expect(tab).toBeVisible();
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
