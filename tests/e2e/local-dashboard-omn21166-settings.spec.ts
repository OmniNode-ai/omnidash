import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { gotoSettings, settingsSection, showSettingsSection, SETTINGS_SECTION_TITLES } from './settings-sections';

// OMN-21166 part 26 revised (AC153-AC159): one Settings page with Model providers, Access and System status sections.
// Failure modes declared before code: a tab list or section parameter survives; a section loses a panel or Cloud Keys returns;
// Environment back on Overview or missing from Settings; the alert time stays raw; a retired address renders content.
// Revision 3 (AC160-AC162), failure modes declared first: a section draws a card inside its card or a second title; an empty
// provider list draws a table of headers or the wrong command (onex secret set); an unread list reads as "no providers";
// an empty Access or System status card names no step that fills it.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', tenant_id: 'chart-fixture-tenant', updated_at: '2026-10-17T10:00:00Z' }] });
});

test('AC153 the sidebar lists Settings in place of Credentials and API Keys, active on Settings', async ({ page }) => {
  await page.goto('/overview');
  const local = page.getByRole('navigation', { name: 'Local', exact: true });
  await expect(local.getByRole('link')).toHaveText(['Overview', 'Runs', 'Workflow', 'Usage', 'Settings']);
  await expect(page.getByTestId('nav-local-credentials')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-api-keys')).toHaveCount(0);
  await expect(page.getByTestId('nav-local-settings').locator('svg.lucide-settings')).toHaveCount(1);
  await page.goto('/settings');
  await expect(page.getByTestId('nav-local-settings')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
});

test('AC155 the retired addresses show Page not found and nothing links to them', async ({ page }) => {
  for (const path of ['/api-keys', '/credentials']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Local identity|Provider keys|Dashboard access/);
  }
  await page.goto('/settings');
  expect(await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href'))
    .filter(href => /^\/(api-keys|credentials)(?:[?#]|$)/.test(href ?? '')))).toEqual([]);
});

test('AC156 each section keeps its panels and Cloud Keys stays hidden in local-only mode', async ({ page }) => {
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): one section shows at a time, so each section's panels are read with it shown.
  await gotoSettings(page, 'Model providers');
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
  await showSettingsSection(page, 'Access');
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard access', exact: true })).toBeVisible();
  await expect(page.getByText('chart-fixture-tenant', { exact: true })).toBeVisible();
  await showSettingsSection(page, 'System status');
  await expect(settingsSection(page, 'System status').locator('article[data-component="status-environment"]')).toBeVisible();
  // Hidden sections count too: no Cloud Keys heading anywhere in the page, shown or not.
  await expect(page.getByRole('heading', { name: /cloud keys/i, includeHidden: true })).toHaveCount(0);
});

// OMN-21970 AC10 (Lakshman 2026-11-02, "yes best way") replaces AC154's one long page: Settings has a section menu down
// its left side and shows one section at a time, chosen by the URL hash. There is still no tab list, ?section= still
// changes nothing, and a hash no section has opens Model providers.
test('AC154 Settings shows one section at a time from its left menu, chosen by the hash; no tab list', async ({ page }) => {
  const shown = page.locator('main section.local-settings-section:not([hidden]) > h2');
  await page.goto('/settings?section=access');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  await expect(shown).toHaveText('Model providers');
  for (const [hash, title] of [['access', 'Access'], ['pricing', 'Pricing and routing'], ['system', 'System status'], ['bogus', 'Model providers']] as const) {
    await page.goto(`/settings#${hash}`);
    await expect(shown).toHaveText(title);
  }
  await page.goto('/settings#access');
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard access', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Model providers' }).click();
  await expect(shown).toHaveText('Model providers');
  await expect(page).toHaveURL(/#providers$/);
  await expect(page.getByRole('heading', { name: 'Provider keys', exact: true })).toBeVisible();
});

test('AC158 Environment is the System status section of Settings, and not on Overview', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'compose', service: 'runtime', verdict: 'running', verdict_reason: 'health check passed', last_seen: '2026-10-26T18:00:59Z' },
    { mode: 'compose', service: 'redpanda', verdict: 'down', verdict_reason: 'container exited', last_seen: '2026-10-26T18:00:59Z', alert_code: 'SERVICE_DOWN', alert_severity: 'critical', alert_since: '2026-10-26T18:01:59.080Z' }
  ]});
  await page.goto('/overview');
  await expect(page.locator('article[data-component$="-environment"]')).toHaveCount(0);
  await page.goto('/settings');
  // Part 27 AC169 put Appearance after Model providers; amendment 30c (AC169a) took it out again.
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): Pricing and routing joined before System status, still last.
  // OMN-23330 AC22: Settings loads lazily, so the headings are awaited, not read once.
  await expect(page.locator('main section > h2')).toHaveText(['Model providers', 'Access', 'Pricing and routing', 'System status']);
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): System status is chosen from the section links; Environment is its one panel.
  const statusSection = await showSettingsSection(page, 'System status');
  await expect(page.locator('article[data-component="status-environment"]')).toHaveCount(1);
  const envArticle = statusSection.locator('article[data-component="status-environment"]');
  await expect(envArticle.locator('.local-environment-line')).toBeVisible();
  // OMN-22168 (Lakshman 2026-11-05, "open all, no hide the contents"): the environment details are open content.
  await expect(envArticle.locator('details.local-more')).toHaveCount(0);
});

test('AC159 alert banner shows formatted time after opening details', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'compose', service: 'runtime', verdict: 'running', verdict_reason: 'health check passed', last_seen: '2026-10-26T18:00:59Z' },
    { mode: 'compose', service: 'redpanda', verdict: 'down', verdict_reason: 'container exited', last_seen: '2026-10-26T18:00:59Z', alert_code: 'SERVICE_DOWN', alert_severity: 'critical', alert_since: '2026-10-26T18:01:59.080Z' }
  ]});
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the banner is in System status, opened by its address.
  await gotoSettings(page, 'System status');
  const envArticle = page.locator('article[data-component="status-environment"]');
  // OMN-22168: no fold to open; the banner's details are in view.
  await expect(envArticle.locator('details.local-more')).toHaveCount(0);
  await expect(envArticle).toContainText('since Oct 26, 18:01:59 UTC');
  await expect(envArticle).not.toContainText('2026-10-26T18:01:59');
});

const sectionNamed = settingsSection;

test('AC160 each section is one card: its panels are flat and a one-panel section shows only its own title', async ({ page }) => {
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [
    { provider: 'gemini', set_up: false, last_test: null, models: [] },
    { provider: 'openrouter', set_up: true, last_test: { status: 'passed' }, models: ['openrouter/model-a'] },
    { provider: 'openai', set_up: false, last_test: null, models: [] },
    { provider: 'ollama', set_up: false, last_test: null, models: [] }] }) }));
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the providers are one row (article) each in the section's provider list, not a
  // table, and each section is read while it is the one shown.
  await gotoSettings(page, 'Model providers');
  await expect(sectionNamed(page, 'Model providers').locator('.local-provider-list > article')).toHaveCount(4);
  expect(await sectionNamed(page, 'Model providers').locator('.local-provider-list > article').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label'))))
    .toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
  const titles: Record<string, { only: string[]; shown: string[] }> = {
    'Model providers': { only: ['Provider keys'], shown: [] }, Access: { only: [], shown: ['Local identity', 'Dashboard access'] },
    'Pricing and routing': { only: [], shown: [] }, 'System status': { only: ['Environment'], shown: [] } };
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the section is no longer the card; its group of panels is (one ink-ruled
  // .local-dashboard-grid). Still one card: the section draws no box around the group, and no panel draws its own box
  // (top edge or shadow) inside it.
  for (const name of SETTINGS_SECTION_TITLES) {
    const section = await showSettingsSection(page, name);
    await expect(section).toHaveCount(1);
    expect(await section.evaluate(el => getComputedStyle(el).borderTopStyle), `${name}: the section is not a box`).toBe('none');
    const groups = section.locator('.local-dashboard-grid');
    expect(await groups.count(), `${name}: one panel group`).toBe(1);
    expect(await groups.evaluate(el => getComputedStyle(el).borderTopStyle), `${name}: the group is the one card`).toBe('solid');
    expect(await section.locator('article.local-dashboard-panel').count(), `${name}: panels`).toBeGreaterThanOrEqual(1);
    for (const panel of await section.locator('article.local-dashboard-panel').all()) {
      expect(await panel.evaluate(el => [getComputedStyle(el).borderTopStyle, getComputedStyle(el).boxShadow]), name).toEqual(['none', 'none']);
    }
    for (const title of titles[name]!.only) {
      const box = await page.getByRole('heading', { name: title, exact: true }).boundingBox();
      expect(box && box.width <= 1 && box.height <= 1, `${title} is named for assistive tech only`).toBe(true);
    }
    for (const title of titles[name]!.shown) {
      expect((await page.getByRole('heading', { name: title, exact: true }).boundingBox())!.height).toBeGreaterThan(10);
    }
  }
  await page.screenshot({ path: test.info().outputPath('settings-rev3-populated-1440.png'), fullPage: true });
});

test('AC161 an empty provider list is one empty state with onex models add, and an unread list says it was not read', async ({ page }) => {
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) }));
  await page.goto('/settings');
  const providers = sectionNamed(page, 'Model providers');
  await expect(providers.getByRole('status').filter({ hasText: 'No model providers listed yet' })).toBeVisible();
  await expect(providers.getByText('onex models add <provider>', { exact: true })).toBeVisible();
  await expect(providers.getByRole('table')).toHaveCount(0);
  await expect(providers).not.toContainText('onex secret set');
  await expect(providers).not.toContainText('No provider credentials recorded');
  await page.unroute('**/models');
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>OmniDash</title>' }));
  await page.reload();
  await expect(providers.getByRole('status').filter({ hasText: 'Model providers could not be read' })).toContainText('The dashboard did not list model providers.');
  await expect(providers).not.toContainText('No model providers listed yet');
  await expect(providers.getByText('onex models list', { exact: true })).toBeVisible();
});

test('AC162 empty Access and System status cards name what fills them', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [] });
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): each section is read while it is the one shown.
  await gotoSettings(page, 'Access');
  const access = sectionNamed(page, 'Access').locator('article[data-component]').filter({ has: page.getByRole('heading', { name: 'Dashboard access', exact: true }) });
  await expect(access.getByRole('status')).toContainText('Access details not reported yet');
  await expect(access.getByRole('status')).toContainText('each time onex dashboard starts on this machine');
  await expect(access).not.toContainText('Not available yet');
  await showSettingsSection(page, 'System status');
  const status = sectionNamed(page, 'System status').getByRole('status').filter({ hasText: 'Service health is not available yet' });
  await expect(status).toBeVisible();
  await expect(status).toContainText('No service has reported yet.');
  await expect(status).toContainText('onex dashboard reports itself each time it starts');
  await expect(status).not.toContainText('could not read');
  await page.route('**/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) }));
  await page.reload();
  await showSettingsSection(page, 'Model providers');
  await expect(sectionNamed(page, 'Model providers').getByText('No model providers listed yet')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('settings-rev3-empty-1440.png'), fullPage: true });
});
