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

// OMN-21166 part 18 AC128: the keys in use sit on their provider's row of the one "Model providers" table, whose rows come
// from GET /models; the page reads it beside the credentials projection, so the test serves it.
const MODEL_PROVIDERS = [
  { provider: 'gemini', set_up: false, last_test: null, models: [] },
  { provider: 'openrouter', set_up: true, last_test: { status: 'passed' }, models: ['openrouter/model-a'] },
  { provider: 'openai', set_up: false, last_test: null, models: [] },
  { provider: 'ollama', set_up: false, last_test: null, models: [] },
];

async function serve(page: Page, served: Record<string, unknown[]>) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
  });
  await page.route('**/models', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: MODEL_PROVIDERS }) });
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

  // OMN-21166 part 13/part 10/AC60: the keys in use are in view; the revoked one is under "Show key history (1 revoked)".
  // Part 18 AC128: the keys in use are columns of the one "Model providers" table (one row per provider; no "Revoked"
  // column, and Expires and Bound host only when a key records one), and times read as "Oct 7, 07:35:00 UTC" with the
  // served value kept in the <time> element (datetime and title).
  await expect(page.getByRole('table', { name: 'Provider key references', exact: true })).toHaveCount(0);
  const table = page.getByRole('table', { name: 'Model providers', exact: true });
  await expect(table.getByRole('columnheader')).toHaveText(['Provider', 'State', 'Models', 'Key ref', 'Fingerprint', 'Set', 'Set up with']);
  await expect(table.getByRole('columnheader', { name: 'Revoked', exact: true })).toHaveCount(0);
  await expect(page.getByText('No key records an expiry or a bound host.', { exact: true })).toBeVisible();
  const live = table.getByRole('row').filter({ hasText: '89abcdef' });
  await expect(live.getByRole('rowheader')).toHaveText('OpenRouter');
  await expect(live.getByRole('cell')).toHaveText([
    'Last test passed', 'openrouter/model-a', 'llm.openrouter.api_key', '89abcdef', 'Oct 7, 07:35:00 UTC', 'onex models add openrouter',
  ]);
  await expect(live.locator('td[data-label="Set"] time')).toHaveAttribute('datetime', '2026-10-07T07:35:00+00:00');
  await expect(live.locator('td[data-label="Set"] time')).toHaveAttribute('title', '2026-10-07T07:35:00+00:00');
  await expect(table.getByRole('row').filter({ hasText: '0123abcd' })).toHaveCount(0);
  const history = page.getByText('Show key history (1 revoked)', { exact: true });
  await history.press('Enter');
  const revokedTable = page.getByRole('table', { name: 'Revoked key references', exact: true });
  const revoked = revokedTable.getByRole('row').filter({ hasText: '0123abcd' });
  await expect(revoked.locator('td[data-label="Revoked"]')).toHaveText('Oct 7, 07:35:00 UTC');
  await expect(revoked.locator('td[data-label="Revoked"] time')).toHaveAttribute('datetime', '2026-10-07T07:35:00+00:00');

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

  await expect(page.getByText('No provider credentials recorded')).toBeVisible();
  await expect(page.getByText('onex secret set')).toBeVisible();
  // OMN-21166 part 18 AC128: the one "Model providers" table is always listed (one row per provider); with no key set its
  // key cells read "No key", and neither key-reference table (keys in use, key history) is drawn.
  await expect(page.getByRole('table', { name: 'Provider key references', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Revoked key references', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Model providers', exact: true }).locator('td[data-label="Key ref"]')).toHaveText(['No key', 'No key', 'No key', 'No key']);
  await page.screenshot({ path: screenshotPath('local-dashboard-omn19985-credentials-empty-1440x900.png'), fullPage: false });
});
