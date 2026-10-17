import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from 'playwright/test';

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
  [topics.decisions]: [{ correlation_id: 'omn21166-fixture-run', created_at: '2026-10-17T10:00:00Z',
    written_at: '2026-10-17T10:00:00Z', model_name: 'fixture-local-model', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 813, tokens_input: 162, tokens_output: 52,
    task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'fixture' }],
  [topics.savings]: [{ tenant_id: 'omn21166-fixture-tenant', baseline_model: 'fixture-baseline',
    pricing_manifest_version: '1', sessions: [{ session_id: 'omn21166-fixture-run',
      created_at: '2026-10-17T10:00:00Z', model_name: 'fixture-local-model', prompt_tokens: 162,
      completion_tokens: 52, local_cost_usd: .001, counterfactual_baseline_usd: .002,
      savings_usd: .001, baseline_model: 'fixture-baseline', usage_source: 'measured' }] }],
  [topics.metering]: [{ tenant_id: 'omn21166-fixture-tenant', window_kind: 'all', window_start: '',
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

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
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

test('AC9 all eleven destinations have distinct icons and theme-safe accents', async ({ page }) => {
  await page.goto('/overview');
  await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).check();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
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

test('AC8 repeatable fixture artifact: both themes, viewports and developer states', async ({ page }, info) => {
  test.setTimeout(90000);
  const captures: Record<string, unknown>[] = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto('/overview');
    await expect(page.getByTestId('nav-local-overview')).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    for (const enabled of [false, true]) {
      await page.getByRole('checkbox', { name: 'Show developer tools', exact: true }).setChecked(enabled);
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') {
          if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
          await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
          if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
        }
        await page.screenshot({ path: info.outputPath(`fixture-${width}-${enabled}-${theme}.png`), fullPage: false, animations: 'disabled' });
        captures.push({ width, theme, developerTools: enabled, source: 'constructed HTTP fixtures', url: page.url() });
      }
      if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      if (width === 390) await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  // Complete the repeatable page walk in addition to the chrome-state matrix.
  for (const state of ['populated-fixture', 'missing-tenant']) {
    await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      topics: Object.keys(fixtureRows).map(topic => ({ topic, status: 'ok', backing: 'bus', bus_backed: true,
        tenant_scoped: state === 'missing-tenant', tenant_column: state === 'missing-tenant' ? 'tenant_id' : null })),
    }) }));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const route of [...core, 'delegation-evidence']) {
        await page.goto(`/${route}`);
        await expect(page.getByTestId('nav-local-overview')).toBeVisible();
        if (state === 'missing-tenant' && route === 'overview') {
          await expect(page.getByText('Tenant not configured', { exact: true }).first()).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath(`${state}-${route}-${width}.png`), animations: 'disabled' });
        captures.push({ width, height: width === 1440 ? 900 : 844, theme: 'dark', developerTools: false,
          state, url: page.url(), source: 'constructed HTTP fixtures', tenant: state === 'missing-tenant' ? null : 'omn21166-fixture-tenant' });
      }
    }
  }
  const manifest = { ticket: 'OMN-21166', testedCommit: null, workingTreeDirty: true, baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    // Other browser specs refresh tracked PNGs; retain those bytes in the hash
    // without overflowing Node's default 1 MiB child-process output buffer.
    workingDiffSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { maxBuffer: 64 * 1024 * 1024 })).digest('hex'),
    browserSpecSha256: createHash('sha256').update(readFileSync('tests/e2e/local-dashboard-omn21166.spec.ts')).digest('hex'),
    timestamp: new Date().toISOString(), source: 'fixture browser proof; live populated lab proof separate', mode: 'HTTP fixture',
    acVerdict: 'UI captures only; AC7 regression and live populated AC8 readback require separate evidence', captures };
  writeFileSync(info.outputPath('manifest.json'), JSON.stringify(manifest, null, 2));
  await info.attach('AC8 fixture manifest', { path: info.outputPath('manifest.json'), contentType: 'application/json' });
});
