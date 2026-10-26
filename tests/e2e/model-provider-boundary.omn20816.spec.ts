import { expect, test } from 'playwright/test';

// AC1: the built Credentials page must read /models independently of the
// unrelated credentials projection, retaining both sources' own failure states.
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const providers = [
  { provider: 'gemini', set_up: true, last_test: null, models: ['gemini-a'] },
  { provider: 'openrouter', set_up: true, last_test: { status: 'passed' }, models: ['openai/model-a'] },
  { provider: 'openai', set_up: true, last_test: { status: 'failed', reason: '401 invalid api key' }, models: [] },
  { provider: 'ollama', set_up: false, last_test: null, models: [] },
];

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const state of ['healthy', 'pending', 'missing', 'failed', 'models-failed']) {
    test(`AC1: independent provider list, ${state}, ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const modelRequests: string[] = [];
      await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: window.location.origin }));
      });
      await page.route('**/models', async route => {
        modelRequests.push(route.request().method());
        await route.fulfill({ status: state === 'models-failed' ? 503 : 200, contentType: 'application/json',
          body: JSON.stringify(state === 'models-failed'
            ? { error: 'unavailable', detail: 'Model provider service unavailable' } : { providers }) });
      });
      await page.route('**/projections', async route => {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
          ['missing', 'models-failed'].includes(state) ? [] : [{ topic: CREDENTIALS, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false, tenant_column: null }],
        }) });
      });
      let releasePending: (() => void) | undefined;
      await page.route('**/projection/**', async route => {
        if (state === 'pending') await new Promise<void>(resolve => { releasePending = resolve; });
        await route.fulfill({ status: state === 'failed' ? 503 : 200, contentType: 'application/json',
          body: JSON.stringify(state === 'failed' ? { detail: 'credential projection unavailable' }
            : { rows: [], row_count: 0, data_freshness: 'fresh' }) });
      });
      try {
        await page.goto('/');
        // OMN-21166 part 26: Credentials is a section of Settings.
        await page.getByTestId('nav-local-settings').click();
        await page.getByTestId('settings-tab-credentials').click();
        await expect(page.getByRole('tab', { name: 'Credentials', exact: true })).toHaveAttribute('aria-selected', 'true');
        const table = page.getByRole('table', { name: 'Model providers' });
        if (state === 'models-failed') {
          await expect(page.getByText('Model provider service unavailable', { exact: true })).toBeVisible();
          await expect(table).toHaveCount(0);
        } else {
          await expect(table).toBeVisible();
          await expect(table).toHaveCount(1);
          await expect(table.getByRole('rowheader')).toHaveText(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
          await expect(table.getByText('Set up, not tested yet', { exact: true })).toBeVisible();
          await expect(table.getByText('Last test passed', { exact: true })).toBeVisible();
          await expect(table.getByText('Last test failed: 401 invalid api key', { exact: true })).toBeVisible();
          await expect(table.getByText('Not set up', { exact: true })).toBeVisible();
          expect(await table.evaluate(el => el.closest('[aria-busy="true"]') === null)).toBe(true);
          await expect(page.getByRole('region', { name: 'Model providers' }).locator('input, textarea, select, form, button, [contenteditable]')).toHaveCount(0);
        }
        if (state === 'healthy') await expect(page.getByText('No provider credentials recorded')).toBeVisible();
        if (state === 'pending') await expect(page.getByText('Loading data…', { exact: true })).toBeVisible();
        if (['missing', 'models-failed'].includes(state)) await expect(page.getByText('Not available yet: credentials.', { exact: true })).toBeVisible();
        if (state === 'failed') await expect(page.getByRole('alert')).toContainText('data is unavailable.');
        expect(modelRequests).toEqual(['GET']);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await page.screenshot({ path: testInfo.outputPath('credentials.png'), fullPage: true, animations: 'disabled' });
        await testInfo.attach('fixture-read-receipt', { body: JSON.stringify({ state, viewport, modelRequests }), contentType: 'application/json' });
      } finally {
        releasePending?.();
      }
    });
  }
}
