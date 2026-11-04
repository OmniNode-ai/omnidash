import { expect, type Locator, type Page } from 'playwright/test';

// OMN-21970 AC9/AC10 (Lakshman 2026-11-02): Settings shows one section at a time, chosen by the URL hash (#providers,
// #access, #pricing, #system; any other hash is Model providers), from the "Settings sections" links. The other three
// sections stay in the page with the hidden attribute. e2e tests reach a section through these helpers so each one
// proves the section it reads is the one on screen.

export const SETTINGS_SECTIONS = { 'Model providers': 'providers', Access: 'access', 'Pricing and routing': 'pricing', 'System status': 'system' } as const;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;
export const SETTINGS_SECTION_TITLES = Object.keys(SETTINGS_SECTIONS) as SettingsSection[];

/** The h2 of the one section on screen. */
export const shownSectionTitle = (page: Page): Locator => page.locator('main section.local-settings-section:not([hidden]) > h2');
/** A section by its title, shown or not. */
export const settingsSection = (page: Page, name: SettingsSection): Locator =>
  page.locator('main section.local-settings-section').filter({ has: page.getByRole('heading', { level: 2, name, exact: true, includeHidden: true }) });

/** Opens /settings at a section's address and proves that section, and only it, is shown. */
export async function gotoSettings(page: Page, name: SettingsSection = 'Model providers'): Promise<Locator> {
  await page.goto(`/settings#${SETTINGS_SECTIONS[name]}`);
  await expect(shownSectionTitle(page)).toHaveText(name, { timeout: 15000 });
  return settingsSection(page, name);
}

/** Chooses a section from the Settings sections links on the open page; proves the hash and the shown section follow. */
export async function showSettingsSection(page: Page, name: SettingsSection): Promise<Locator> {
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${SETTINGS_SECTIONS[name]}$`));
  await expect(shownSectionTitle(page)).toHaveText(name);
  return settingsSection(page, name);
}
