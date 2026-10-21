import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from 'playwright/test';

// Failure modes declared before implementation: advanced tools exposed by default,
// evidence hidden with them, inaccessible collapsed control, lost deep link, persisted
// preference, builder/assistant mounted, Cloud Keys in local composition, saved data
// mutated, and category colors/keyboard focus lost between themes. These fixtures
// prove browser behavior only; they do not replace the populated lab readback.
const core = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'];
const tools = ['experiments', 'sea-control', 'event-bus', 'lab'];
const topics = {
  decisions: 'onex.snapshot.projection.delegation.decisions.v1',
  savings: 'onex.snapshot.projection.delegation.savings.v1',
  metering: 'onex.snapshot.projection.metering-summary.v1',
};
const fixtureRows: Record<string, unknown[]> = {
  [topics.decisions]: [{ tenant_id: '11111111-1111-4111-8111-111111111111', correlation_id: 'omn21166-fixture-run', created_at: '2026-10-17T10:00:00Z',
    written_at: '2026-10-17T10:00:00Z', model_name: 'fixture-local-model', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 813, tokens_input: 162, tokens_output: 52,
    task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'fixture' }],
  [topics.savings]: [{ tenant_id: '11111111-1111-4111-8111-111111111111', baseline_model: 'fixture-baseline',
    pricing_manifest_version: '1', sessions: [{ session_id: 'omn21166-fixture-run',
      created_at: '2026-10-17T10:00:00Z', model_name: 'fixture-local-model', prompt_tokens: 162,
      completion_tokens: 52, local_cost_usd: .001, counterfactual_baseline_usd: .002,
      savings_usd: .001, baseline_model: 'fixture-baseline', usage_source: 'measured' }] }],
  [topics.metering]: [{ tenant_id: '11111111-1111-4111-8111-111111111111', window_kind: 'all', window_start: '',
    window_end: '2026-10-17T10:00:00Z', as_of: '2026-10-17T10:00:00Z',
    baseline_model: 'fixture-baseline', pricing_manifest_version: '1', baseline_state: 'resolved',
    runs_total: 1, runs_measured: 1, runs_unknown_tokens: 0, runs_unknown_spend: 0,
    tokens_in: 162, tokens_out: 52, spend_usd: '0.001', counterfactual_usd: '0.002', savings_usd: '0.001' }],
};

async function setup(page: Page, populated = true) {
  await page.addInitScript(() => {
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: location.origin }));
  });
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    topics: Object.keys(fixtureRows).map(topic => ({ topic, status: 'ok', backing: 'bus', bus_backed: true,
      tenant_scoped: false, tenant_column: null })),
  }) }));
  await page.route('**/projection/**', route => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const rows = populated ? fixtureRows[topic] ?? [] : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh' }) });
  });
}

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', actionTimeout: 5000 });
test.beforeEach(async ({ page }) => { await setup(page); });

test('AC1/AC6 core navigation stays ordered and evidence stays visible', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const local = page.getByRole('navigation', { name: 'Local', exact: true });
  await expect(local.getByRole('link')).toHaveCount(6);
  expect(await local.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))))
    .toEqual(core.map(route => `/${route}`));
  for (const route of core) {
    const link = page.getByTestId(`nav-local-${route}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${route}(?:\\?|$)`));
    await expect(link).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByTestId('nav-delegation-evidence')).toBeVisible();
});

test('AC2 advanced tools are opt-in; evidence survives off/on/off and reload resets', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByTestId('nav-local-overview')).toBeVisible();
  for (const id of tools) await expect(page.getByTestId(`nav-${id}`)).toHaveCount(0);
  const control = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
  await expect(control).not.toBeChecked();
  await control.check();
  await expect(page.getByRole('navigation', { name: 'Developer', exact: true }).getByRole('link')).toHaveCount(4);
  for (const id of tools) await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  await control.uncheck();
  await expect(page.getByTestId('nav-delegation-evidence')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Developer', exact: true })).toHaveCount(0);
  await control.check();
  await page.reload();
  await expect(control).not.toBeChecked();
});

test('AC2 hidden advanced navigation never redirects an open deep link', async ({ page }) => {
  await page.goto('/event-bus');
  await expect(page.getByTestId('nav-local-overview')).toBeVisible();
  await expect(page).toHaveURL(/\/event-bus$/);
  const before = await page.locator('.breadcrumbs .cur').innerText();
  const control = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
  await control.check();
  await expect(page.getByTestId('nav-event-bus')).toHaveAttribute('aria-current', 'page');
  await control.uncheck();
  await expect(page).toHaveURL(/\/event-bus$/);
  await expect(page.locator('.breadcrumbs .cur')).toHaveText(before);
});

test('AC2 collapsed control works with keyboard without expanding the rail', async ({ page }) => {
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  const control = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
  await control.focus();
  await page.keyboard.press('Space');
  await expect(control).toBeChecked();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await expect(page.getByTestId('nav-lab')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(control).not.toBeChecked();
  await expect(page.getByTestId('nav-delegation-evidence')).toBeVisible();
});

test('AC3/AC4 builder and assistant are absent with saved layouts preserved', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByTestId('nav-local-overview')).toBeVisible();
  const saved = await page.evaluate(async () => {
    // Vite test-only import exercises the real store/service; no production API writes.
    const { useFrameStore } = await import('/src/store/store.ts');
    useFrameStore.getState().createDashboard('OMN-21166 test-owned saved layout');
    useFrameStore.getState().setPanelOpen(true);
    return localStorage.getItem('omnidash.dashboards.list.v1');
  });
  expect(saved).toContain('OMN-21166 test-owned saved layout');
  for (const route of core) {
    await page.getByTestId(`nav-local-${route}`).click();
    await expect(page.getByTestId('nav-delegation-evidence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI Assistant', exact: true })).toHaveCount(0);
    await expect(page.getByText('OMN-21166 test-owned saved layout', { exact: true })).toHaveCount(0);
  }
  await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).check();
  expect(await page.evaluate(() => localStorage.getItem('omnidash.dashboards.list.v1'))).toBe(saved);
  await expect(page.getByRole('button', { name: 'New dashboard', exact: true })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.locator('.breadcrumbs .cur')).toHaveText('Dashboards');
  expect(await page.evaluate(() => localStorage.getItem('omnidash.dashboards.list.v1'))).toBe(saved);
});

test('AC5 local identity remains while Cloud Keys is absent', async ({ page }) => {
  await page.goto('/api-keys');
  await expect(page.getByRole('heading', { name: 'API Keys', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cloud keys/i })).toHaveCount(0);
});

test('AC7 theme switching and sidebar collapse preserve the current Runs view', async ({ page }) => {
  await page.goto('/runs');
  await expect(page.getByRole('link', { name: 'omn21166-fixture-run', exact: true })).toBeVisible();
  const rows = await page.locator('[data-component="recent-runs"] tbody').innerText();
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(`theme-${theme}`);
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
    await expect(page.getByTestId('nav-local-runs')).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('[data-component="recent-runs"] tbody').innerText()).toBe(rows);
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
  }
});

test('AC9 all eleven destinations have distinct icons and theme-safe accents', async ({ page }) => {
  await page.goto('/overview');
  await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).check();
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    const entries = await page.locator('.sidebar a[data-testid^="nav-"]').evaluateAll(links => links.map(link => ({
      color: getComputedStyle(link.querySelector('.dash-marker')!).color,
      icon: link.querySelector('svg')?.getAttribute('class'),
    })));
    expect(entries).toHaveLength(11);
    expect(new Set(entries.map(entry => entry.color)).size).toBe(11);
    expect(new Set(entries.map(entry => entry.icon)).size).toBe(11);
  }
  await page.keyboard.press('Tab');
  await page.getByTestId('nav-local-runs').focus();
  expect(await page.getByTestId('nav-local-runs').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.getByTestId('nav-local-runs').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});

// Keep the same capture matrix, partitioned so each verifier invocation has a
// bounded browser walk rather than the entire matrix plus installation.
function attachManifest(info: TestInfo, captures: Record<string, unknown>[]) {
  const sourceManifest = process.env.OMN21166_SOURCE_MANIFEST;
  const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
  const sourceHash = createHash('sha256');
  for (const path of ['src', 'tests', 'contracts'].flatMap(sourceFiles).sort()) {
    sourceHash.update(path).update('\0').update(readFileSync(path)).update('\0');
  }
  let baseSha: string | null = null;
  let workingDiffSha256: string | null = null;
  let workingTreeDirty: boolean | null = null;
  try {
    baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    workingTreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== '';
    workingDiffSha256 = createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { maxBuffer: 64 * 1024 * 1024 })).digest('hex');
  } catch { /* The verifier's hermetic stage has no git metadata; the measured source tree identifies it. */ }
  const manifest = { ticket: 'OMN-21166', testedCommit: workingTreeDirty === false ? baseSha : null, workingTreeDirty, baseSha,
    sourceIdentity: 'measured source tree', sourceTreeSha256: sourceHash.digest('hex'), workingDiffSha256,
    sourceManifestSha256: sourceManifest ? createHash('sha256').update(readFileSync(sourceManifest)).digest('hex') : null,
    browserSpecSha256: createHash('sha256').update(readFileSync('tests/e2e/local-dashboard-omn21166.spec.ts')).digest('hex'),
    timestamp: new Date().toISOString(), source: 'fixture browser proof; live populated lab proof separate', mode: 'HTTP fixture',
    acVerdict: 'UI captures only; AC7 regression and live populated AC8 readback require separate evidence', captures };
  writeFileSync(info.outputPath('manifest.json'), JSON.stringify(manifest, null, 2));
  return info.attach('AC8 fixture manifest', { path: info.outputPath('manifest.json'), contentType: 'application/json' });
}

for (const width of [1440, 390]) test(`AC8 chrome states width ${width}`, async ({ page }, info) => {
  const captures: Record<string, unknown>[] = [];
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto('/overview');
    await expect(page.getByTestId('nav-local-overview')).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    for (const enabled of [false, true]) {
      await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).setChecked(enabled);
      for (const theme of ['dark', 'light']) {
        if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) {
          if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
          await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
          if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
        }
        await page.screenshot({ path: info.outputPath(`fixture-${width}-${enabled}-${theme}.png`), fullPage: false, animations: 'disabled' });
        captures.push({ ...page.viewportSize(), theme: await page.locator('body').evaluate(el => el.classList.contains('theme-dark') ? 'dark' : 'light'), developerTools: await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).isChecked(), source: 'constructed HTTP fixtures', url: page.url() });
      }
      if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(captures.map(({ width: actualWidth, theme, developerTools }) => ({ width: actualWidth, theme, developerTools }))).toEqual([
    { width, theme: 'dark', developerTools: false }, { width, theme: 'light', developerTools: false },
    { width, theme: 'dark', developerTools: true }, { width, theme: 'light', developerTools: true },
  ]);
  await attachManifest(info, captures);
});

// Each state/width still visits every core page and Evidence. Splitting the
// invocation never drops a screenshot or weakens a missing-tenant assertion.
for (const state of ['populated-fixture', 'missing-tenant']) for (const width of [1440, 390]) {
test(`AC8 page walk ${state} width ${width}`, async ({ page }, info) => {
  const captures: Record<string, unknown>[] = [];
  const scopedTenants: Array<string | null> = [];
  await page.route('**/projection/**', async route => {
    const url = new URL(route.request().url());
    if (decodeURIComponent(url.pathname).endsWith('delegation.decisions.v1')) scopedTenants.push(url.searchParams.get('tenant'));
    await route.fallback();
  });
    await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      tenant: state === 'missing-tenant' ? null : '11111111-1111-4111-8111-111111111111',
      topics: Object.keys(fixtureRows).map(topic => ({ topic, status: 'ok', backing: 'bus', bus_backed: true,
        tenant_scoped: true, tenant_column: 'tenant_id' })),
    }) }));
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const route of [...core, 'delegation-evidence']) {
        await page.goto(`/${route}`);
        await expect(page.getByTestId('nav-local-overview')).toBeVisible();
        await expect(page.locator('body')).toHaveClass('theme-light');
        if (state === 'populated-fixture' && route === 'overview') await expect(page.getByLabel('Recent runs preview', { exact: true }).getByRole('link', { name: 'omn21166-fixture-run', exact: true })).toBeVisible();
        if (state === 'missing-tenant' && route === 'overview') {
          await expect(page.getByText('Tenant not configured', { exact: true }).first()).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath(`${state}-${route}-${width}.png`), animations: 'disabled' });
        captures.push({ ...page.viewportSize(), theme: await page.locator('body').evaluate(el => el.classList.contains('theme-dark') ? 'dark' : 'light'),
          developerTools: await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).isChecked(),
          state, url: page.url(), source: 'constructed HTTP fixtures', tenant: state === 'missing-tenant' ? null : '11111111-1111-4111-8111-111111111111' });
      }
  await attachManifest(info, captures);
  const artifact = JSON.parse(readFileSync(info.outputPath('manifest.json'), 'utf8'));
  expect(artifact.captures.map((capture: {theme: string}) => capture.theme)).toEqual(Array(7).fill('light'));
  if (state === 'populated-fixture') {
    expect(scopedTenants.length).toBeGreaterThan(0);
    expect([...new Set(scopedTenants)]).toEqual(['11111111-1111-4111-8111-111111111111']);
  } else expect(scopedTenants).toHaveLength(0);
});
}
