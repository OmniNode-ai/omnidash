import { readFileSync, writeFileSync } from 'node:fs';
import { sourceIdentity } from './source-identity';
import { createHash } from 'node:crypto';
import { expect, test } from 'playwright/test';
import type { Page } from 'playwright/test';

// Expected before styling: RED for IBM body typography, uppercase headings,
// monochrome unbadged icons, and the evidence surface ignoring light mode.
// GREEN controls: populated fixture, required routes/fields, bounded viewport.
// Failure modes: external font dependency; color-only status; low-contrast labels;
// layout overflow; lost controls/columns; motion despite reduced-motion preference.
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
async function theme(page: Page, value: string) {
  if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== value)
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
}

// OMN-21166 part 11 AC62 (corrected): Inter is the bundled text face, JetBrains Mono the identifier face; Poppins stays on the wordmark.
test('AC62 bundled Inter and JetBrains Mono typography preserves the Poppins wordmark', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => {
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(request.url()).hostname)) external.push(request.url());
  });
  await page.goto('/overview');
  await expect(page.locator('.local-dashboard-panel').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Inter');
  expect(await page.evaluate(() => document.fonts.check('14px Inter'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('14px "JetBrains Mono"'))).toBe(true);
  expect(await page.locator('.brand-name .primary').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Poppins');
  expect(external).toEqual([]);
});

test('AC10 sentence case headings and semantic panel icon badges', async ({ page }) => {
  await page.goto('/overview');
  const headings = page.locator('.local-dashboard-panel h2');
  await expect(headings.first()).toBeVisible();
  expect(await headings.first().evaluate(el => getComputedStyle(el).textTransform)).toBe('none');
  const icons = await page.locator('.local-dashboard-panel h2 svg').evaluateAll(els => els.slice(0, 4).map(el => ({
    color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
  })));
  expect(icons).toHaveLength(4);
  expect(new Set(icons.map(icon => icon.color)).size).toBe(4);
  for (const icon of icons) expect(icon.background).toBe('rgba(0, 0, 0, 0)');
});

test('AC10 evidence honors the same theme and typography as the frame', async ({ page }) => {
  await page.goto('/delegation-evidence');
  await expect(page.locator('.ev-root')).toBeVisible();
  for (const value of ['light', 'dark']) {
    await theme(page, value);
    const surface = await page.locator('.ev-root').evaluate(el => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      return { rgb: Array.from(ctx.getImageData(0, 0, 1, 1).data), font: getComputedStyle(el).fontFamily };
    });
    expect(surface.font).toContain('Inter');
    if (value === 'light') expect(surface.rgb[0]).toBeGreaterThan(230);
    else expect(surface.rgb[0]).toBeLessThan(60);
  }
});

test('AC10 labels meet contrast and reduced motion disables presentation animation', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.locator('.local-dashboard-panel').first()).toBeVisible();
  for (const value of ['light', 'dark']) {
    await theme(page, value);
    const ratios = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      function luminance(color: string) {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => {
          const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      }
      const panel = document.querySelector('.local-dashboard-panel')!;
      const style = getComputedStyle(panel);
      const background = luminance(style.backgroundColor);
      return ['--ink', '--ink-2', '--ink-3', '--status-ok', '--status-warn', '--status-bad'].map(token => {
        const ink = luminance(style.getPropertyValue(token).trim());
        return { token, ratio: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05) };
      });
    });
    for (const result of ratios) expect(result.ratio, `${value} ${result.token}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = page.locator('.local-dashboard-panel').first();
  expect(await card.evaluate(el => getComputedStyle(el).animationDuration)).toBe('0s');
  expect(await card.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('AC10 unserved topic names stay readable inside narrow cards', async ({ page }) => {
  await page.goto('/overview');
  const empty = page.locator('[data-component="overview-tier-mix"] .local-dashboard-empty');
  await expect(empty).toContainText('Not available yet');
  expect(await empty.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test('AC10 repeatable visual review across pages, themes and narrow viewports', async ({ page }, info) => {
  test.setTimeout(180000);
  const captures: Record<string, unknown>[] = [];
  const routes = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys', 'delegation-evidence',
    'experiments', 'sea-control', 'event-bus', 'lab'];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const route of routes) {
      await page.goto(`/${route}`);
      await expect(page.locator('.breadcrumbs .cur')).not.toHaveText('');
      for (const value of ['light', 'dark']) {
        await theme(page, value);
        await page.evaluate(() => document.fonts.ready);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow, `${route} ${width} ${value}`).toBeLessThanOrEqual(1);
        const file = `${route}-${width}-${value}.png`;
        await page.screenshot({ path: info.outputPath(file), fullPage: true });
        captures.push({ route, width, theme: value, file, data: 'governed browser fixture, not live backend' });
      }
    }
  }
  writeFileSync(info.outputPath('visual-manifest.json'), JSON.stringify({ ticket: 'OMN-21166',
    ...sourceIdentity(),
    browserSpecSha256: createHash('sha256').update(readFileSync('tests/e2e/local-dashboard-omn21166-visual.spec.ts')).digest('hex'),
    captures }, null, 2));
});
