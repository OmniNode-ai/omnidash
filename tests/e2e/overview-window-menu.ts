import { expect, type Locator, type Page } from 'playwright/test';

// OMN-21970 AC9/AC10 (Lakshman 2026-11-02): Overview's window is one button ("Figures for All time") that opens a list
// (radiogroup "Figures for") of the same radios with the same names; choosing one closes the list. Every e2e test that
// picks or reads a window goes through these helpers, the counterpart of openWindows() in
// src/pages/LocalDashboardPage.omn21015.overview-window.test.tsx.

/** The window radios' full names, in the order the list shows them. */
export const WINDOW_NAMES = ['All time', 'Today (UTC)', 'Last 7 days (UTC)', 'Last 15 days (UTC)', 'Last 30 days (UTC)', 'Last 90 days (UTC)'] as const;
export type WindowName = (typeof WINDOW_NAMES)[number];

/** The button that opens the list; its accessible name is "Figures for <current window>". */
export const windowTrigger = (page: Page): Locator => page.getByRole('button', { name: /^Figures for / });
/** The open list of windows (absent while it is closed). */
export const windowList = (page: Page): Locator => page.getByRole('radiogroup', { name: 'Figures for', exact: true });
/** The visible label the button carries for a window: its name without the "(UTC)" suffix. */
export const windowLabel = (name: WindowName): string => name.replace(/ \(UTC\)$/, '');

/** Opens the list if it is closed and returns it, visible. */
export async function openWindows(page: Page): Promise<Locator> {
  const trigger = windowTrigger(page);
  await expect(trigger).toBeVisible({ timeout: 15000 });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const list = windowList(page);
  await expect(list).toBeVisible();
  return list;
}

/** Chooses a window from the list; proves the list closed and the button now names that window. */
export async function chooseWindow(page: Page, name: WindowName): Promise<void> {
  const list = await openWindows(page);
  await list.getByRole('radio', { name, exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(windowTrigger(page)).toHaveAccessibleName(`Figures for ${windowLabel(name)}`);
}

/** Proves the chosen window two ways: the button names it, and in the opened list exactly its radio is checked. Closes the list again. */
export async function expectWindow(page: Page, name: WindowName, message?: string): Promise<void> {
  await expect(windowTrigger(page), message).toHaveAccessibleName(`Figures for ${windowLabel(name)}`);
  const list = await openWindows(page);
  await expect(list.getByRole('radio', { name, exact: true }), message).toHaveAttribute('aria-checked', 'true');
  await expect(list.locator('[role="radio"][aria-checked="true"]'), message).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
}
