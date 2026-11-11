// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 AC36 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): on the page with the
// time-window control (Overview), single keys choose the window and the figures follow; "?" lists the keys and Escape
// closes the list; typing the same letters in a field, or holding Ctrl, Cmd or Alt, changes nothing. Overview has no run
// filter, so the field case types into a text field placed on Overview, the page where the keys act.
// Failure modes:
//   K1  a key leaves the window unchanged, or changes the address without the figures;
//   K2  a key acts while typing in a field;
//   K3  a key acts with a modifier held;
//   K4  "?" lists no keys, or Escape leaves the list open.
import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page, chartRows);
  await page.goto('/overview');
  await expect(page.locator('.local-window-trigger')).toBeVisible();
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
});

test('K1: each key chooses its window and the trigger and address follow', async ({ page }) => {
  const trigger = page.locator('.local-window-trigger');
  for (const [key, label] of [['w', 'Last 7 days'], ['f', 'Last 15 days'], ['m', 'Last 30 days'], ['q', 'Last 90 days'], ['t', 'Today'], ['a', 'All time']] as const) {
    await page.locator('body').press(key);
    await expect(trigger, key).toContainText(label);
    await expect(trigger, key).toHaveAttribute('data-window', { w: 'last-7', f: 'last-15', m: 'last-30', q: 'last-90', t: 'today', a: 'all' }[key]);
  }
  await page.locator('body').press('w');
  await expect(page).toHaveURL(/window=7d/);
});

test('K2 K3: typing in a field or holding a modifier changes nothing', async ({ page }) => {
  const trigger = page.locator('.local-window-trigger');
  await expect(trigger).toHaveAttribute('data-window', 'all');
  await page.evaluate(() => { const field = document.createElement('input'); field.setAttribute('aria-label', 'Typing field'); document.querySelector('main')!.prepend(field); });
  await page.getByLabel('Typing field').fill('wfmqt');
  await page.getByLabel('Typing field').press('w');
  await expect(trigger).toHaveAttribute('data-window', 'all');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const chord of ['Control+w', 'Alt+w', 'Meta+t']) {
    await page.keyboard.press(chord).catch(() => undefined);
    await expect(trigger, chord).toHaveAttribute('data-window', 'all');
  }
});

test('K4: "?" lists the keys and Escape closes the list', async ({ page }) => {
  await page.locator('body').press('Shift+?');
  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(list).toBeVisible();
  for (const text of ['All time', 'Today', 'Last 7 days', 'Last 15 days', 'Last 30 days', 'Last 90 days']) await expect(list).toContainText(text);
  await page.locator('body').press('Escape');
  await expect(list).toHaveCount(0);
});
