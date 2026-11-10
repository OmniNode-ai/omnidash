import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-23330 AC12 (the operator's 2026-11-09 review; reading confirmed 2026-11-10: "Provider list + revoked keys"): Settings
// draws its two provider tables, the provider list and the revoked-key table under it, in one table style. Measured on the
// lab at 1440 px before the change: the list had a 12 px corner and a filled background, a header at 12px 16px with 1.2 px
// letter-spacing in weight 400 and cells at 16 px; the revoked-key table had an 8 px corner, no fill, a header at 10px 12px
// with 0.72 px letter-spacing in weight 600 and cells at 11px 12px. Every other table on the dashboard draws the second
// header, so the provider list takes it, and the revoked-key table takes the Settings card every other section uses.
// Failure modes:
//   T1  the two containers differ in border, corner or fill;
//   T2  the two header rows differ in fill, ink, size, face, spacing, case, weight or padding;
//   T3  the two tables' cells differ in size or horizontal padding;
//   T4  the check passes vacuously: either table is not drawn.
const BOX = ['border-top-width', 'border-top-color', 'border-radius', 'background-color'] as const;
const HEAD = ['background-color', 'font-size', 'font-family', 'letter-spacing', 'text-transform', 'font-weight', 'padding-left', 'padding-top'] as const;
const CELL = ['font-size', 'padding-left', 'padding-right'] as const;

test('AC12 Settings at 1440: the provider list and the revoked-key table share one table style', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page, { ...chartRows, [prefix + 'tenant-credentials.v1']: [
    { provider: 'gemini', name: 'llm.gemini.api_key', fingerprint: 'bd161cac', set_at: '2026-10-14T08:24:11Z', revoked_at: null },
    { provider: 'openrouter', name: 'llm.openrouter.old', fingerprint: 'ffee0011', set_at: '2026-09-12T15:52:29Z', revoked_at: '2026-10-12T15:52:29Z' }] });
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [
    { provider: 'gemini', set_up: true, last_test: null, models: ['gemini-2.5-flash-lite'] },
    { provider: 'openrouter', set_up: false, last_test: null, models: [] }] }) }));
  await page.goto('/settings');
  const revoked = page.getByRole('table', { name: 'Revoked key references', exact: true });
  await expect(page.locator('.local-provider-list .local-provider-head-band')).toBeAttached();
  await expect(revoked).toBeVisible();

  const measured = await page.evaluate(({ box, head, cell }) => {
    const read = (element: Element | null, keys: readonly string[]) => element === null ? null
      : Object.fromEntries(keys.map(key => [key, getComputedStyle(element).getPropertyValue(key)]));
    const list = document.querySelector('.local-provider-list');
    const table = document.querySelector('table[aria-label="Revoked key references"]');
    return {
      list: { box: read(list, box), head: read(list?.querySelector('.local-provider-head-band > span') ?? null, head),
        headBand: read(list?.querySelector('.local-provider-head-band') ?? null, ['background-color']),
        cell: read(list?.querySelector('.local-provider-cell') ?? null, cell) },
      revoked: { box: read(table?.closest('.local-dashboard-table-wrap') ?? null, box), head: read(table?.querySelector('th') ?? null, head),
        cell: read(table?.querySelector('td') ?? null, cell) },
    };
  }, { box: BOX, head: HEAD, cell: CELL });
  await revoked.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('settings-tables-1440.png') });
  writeFileSync(info.outputPath('receipt.json'), JSON.stringify(measured, null, 2));

  // T4: both drawn.
  expect(measured.list.box).not.toBeNull();
  expect(measured.revoked.box).not.toBeNull();
  // T1: one container.
  expect(measured.revoked.box).toEqual(measured.list.box);
  // T2: one header (the list's band carries the fill; its cells carry the type and padding).
  const { ['background-color']: headFill, ...revokedHead } = measured.revoked.head!;
  // A band cell carries no fill of its own (the band does), so the fill is left out of the compared header type.
  const listHead = Object.fromEntries(Object.entries(measured.list.head!).filter(([key]) => key !== 'background-color'));
  expect(headFill).toBe(measured.list.headBand!['background-color']);
  expect(revokedHead).toEqual(listHead);
  // T3: one cell.
  expect(measured.revoked.cell).toEqual(measured.list.cell);
});
