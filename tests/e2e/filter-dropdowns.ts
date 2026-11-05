/**
 * OMN-22168: browser-test access to the Runs filters, which are kit Dropdowns (Lakshman 2026-11-04) instead of native
 * selects: by the label each names itself with (data-dropdown) and by option value (data-value).
 */
import { expect, type Page } from 'playwright/test';

export const filterTrigger = (page: Page, label: string) => page.locator(`.ds-dropdown-trigger[data-dropdown="${label}"]`);
const filterList = (page: Page, label: string) => page.getByRole('listbox', { name: label, exact: true });

async function openFilter(page: Page, label: string) {
  const trigger = filterTrigger(page, label);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(filterList(page, label)).toBeVisible();
}

/** Choose the option with this value, as selectOption did. */
export async function pickFilter(page: Page, label: string, value: string) {
  await openFilter(page, label);
  await filterList(page, label).locator(`[role="option"][data-value="${value}"]`).click();
  await expect(filterTrigger(page, label)).toHaveAttribute('data-value', value);
}

/** The chosen value, as toHaveValue read it. */
export async function expectFilter(page: Page, label: string, value: string) {
  await expect(filterTrigger(page, label)).toHaveAttribute('data-value', value);
}

/** The chosen option's text, as the checked option's text read it. */
export async function expectFilterText(page: Page, label: string, text: string) {
  await expect(filterTrigger(page, label).locator('.ds-dropdown-value')).toHaveText(text);
}

/** An option's text, found by part of it, as `option` with hasText read it; the list is closed again after. */
export async function expectFilterOption(page: Page, label: string, hasText: string, text: string) {
  await openFilter(page, label);
  await expect(filterList(page, label).locator('[role="option"]', { hasText }).locator('.ds-dropdown-label')).toHaveText(text);
  await page.keyboard.press('Escape');
}
