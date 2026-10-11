import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

// OMN-19985: the Credentials page at 1440x900 lists each provider key ref with its fingerprint prefix and set time,
// one live and one revoked, as tenant-credentials.v1 serves them after `onex secret set` then a re-set (the node
// revokes the key a re-set replaces), and never a value. The served row carries a planted value-shaped field the
// page must not render.
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const PLANTED = 'sk-or-v1-planted-omn19985-e2e';

const rows = [
  {
    api_key_ref: 'cred_localinstall_openrouter_89abcdef0123456789abcdef01234567', tenant_id: 'localinstall',
    name: 'llm.openrouter.api_key', provider: 'openrouter', fingerprint: '89abcdef',
    set_at: '2026-10-07T07:35:00+00:00', created_at: '2026-10-07T07:35:01+00:00', revoked_at: null,
    api_key_value: PLANTED,
  },
  {
    api_key_ref: 'cred_localinstall_openrouter_0123456789abcdef0123456789abcdef', tenant_id: 'localinstall',
    name: 'llm.openrouter.api_key', provider: 'openrouter', fingerprint: '0123abcd',
    set_at: '2026-10-07T07:30:00+00:00', created_at: '2026-10-07T07:30:01+00:00',
    revoked_at: '2026-10-07T07:35:00+00:00',
  },
];

async function serve(page: Page, served: Record<string, unknown[]>) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/projections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: Object.keys(served).map((topic) => ({
          topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null,
        })),
      }),
    });
  });
  await page.route('**/projection/**', async (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const answer = served[topic];
    await route.fulfill(answer === undefined
      ? { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unknown topic ${topic}` }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ rows: answer, row_count: answer.length, data_freshness: 'fresh' }) });
  });
}

function screenshotPath(name: string) {
  const path = resolve(process.cwd(), `tests/e2e/screenshots/${name}`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function openCredentials(page: Page) {
  await page.goto('/');
  await page.getByTestId('nav-local-credentials').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
}

test('OMN-19985: Credentials lists each key ref with its fingerprint and set time, never a value, at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [CREDENTIALS]: rows });
  await openCredentials(page);

  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Fingerprint' }) });
  await expect(table.getByRole('columnheader')).toHaveText(['Provider', 'Key ref', 'Fingerprint', 'Set', 'Revoked']);
  const live = table.getByRole('row').filter({ hasText: '89abcdef' });
  await expect(live.getByRole('cell')).toHaveText([
    'openrouter', 'llm.openrouter.api_key', '89abcdef', '2026-10-07T07:35:00+00:00', 'Not revoked',
  ]);
  const revoked = table.getByRole('row').filter({ hasText: '0123abcd' });
  await expect(revoked.getByRole('cell').last()).toHaveText('2026-10-07T07:35:00+00:00');

  await expect(page.getByText(PLANTED)).toHaveCount(0);
  expect(await page.content()).not.toContain(PLANTED);
  await expect(page.locator('input, textarea, form')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn19985-credentials-1440x900.png'), fullPage: false });
});

test('OMN-19985: with no key set, Credentials shows the onex secret set command, not an empty table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, { [CREDENTIALS]: [] });
  await openCredentials(page);

  await expect(page.getByText('No provider key set')).toBeVisible();
  await expect(page.getByText('onex secret set')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Fingerprint' })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn19985-credentials-empty-1440x900.png'), fullPage: false });
});
