import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: unrelated identity/savings, backend/queue and host/finish
// fields share colors; field labels lack icons; recent-run and daily-token cards
// use different icons on their respective pages; Developer KPIs lack identities.
const run = { ...(chartRows[prefix + 'delegation.decisions.v1'][0] as object), backend_id: 'local',
  host: 'recorded-host', cost_usd: '0.001234', required_bar: '0.8', actual_score: '0.98', queue_wait_ms: 0, execution_ms: 813 };
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: [run], [prefix + 'delegation.correlation-trace.v1']: [run] };
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page, rows); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('different semantic fields have distinct theme-aware colors', async ({ page }) => {
  await page.goto('/workflow?correlation_id=chart-run-a');
  await expect(page.locator('[data-summary-field="Model"]')).toBeVisible();
  const tones = ['pass','fail','count','score','threshold','model','age','identity','duration','cost','savings','backend','host','tokens-in','tokens-out','tokens','basis','task','tier','queue','execution','completion','calls','tenant','session','baseline','saving-average','compression','cache','quality','events','generation','transport','delegations'];
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const colors = await page.locator('html').evaluate((el, names) => names.map(name => getComputedStyle(el).getPropertyValue('--field-' + name).trim()), tones);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors.map(c => c.toLowerCase())).size).toBe(tones.length);
  }
});

test('matching model, duration and token fields retain the same Lucide icon and color across pages', async ({ page }, info) => {
  await page.goto('/workflow?correlation_id=chart-run-a');
  const fields = ['Model','Duration','Tokens in','Tokens out'];
  const identities: Array<{ icon: string | null; color: string }> = [];
  for (const label of fields) {
    const field = page.locator(`[data-summary-field="${label}"]`);
    await expect(field.locator('dt svg')).toHaveCount(1);
    identities.push({ icon: await field.locator('dt svg').getAttribute('class'), color: await field.locator('dd').evaluate(el => getComputedStyle(el).color) });
  }
  expect(new Set(identities.map(x => x.icon)).size).toBe(fields.length);
  await page.goto('/delegation-evidence');
  const selected = page.locator('[data-panel-title="SELECTED RUN"]');
  for (const [i,sourceLabel] of fields.entries()) {
    const label = sourceLabel === 'Duration' ? 'Latency' : sourceLabel;
    const field = selected.locator('.kv > div').filter({ has: page.getByText(label, { exact: true }) });
    await expect(field.locator('.k svg')).toHaveAttribute('class', identities[i].icon!);
    await expect(field.locator('.v')).toHaveCSS('color', identities[i].color);
  }
  await page.screenshot({ path: info.outputPath('shared-field-identities.png') });
});

test('the same recent-run and daily-token concepts keep their icons on owner pages', async ({ page }) => {
  await page.goto('/overview');
  const recent = page.locator('[data-component="overview-recent-runs"] h2 svg');
  await expect(recent).toHaveCount(1);
  const recentIcon = await recent.getAttribute('class');
  const tokens = page.getByRole('figure', { name: 'Tokens per day', exact: true });
  const tokenIcon = await tokens.locator('h3 svg').getAttribute('class');
  await page.goto('/runs');
  await expect(page.locator('[data-component="recent-runs"] h2 svg')).toHaveAttribute('class', recentIcon!);
  await page.goto('/usage');
  await expect(page.locator('[data-component="usage-tokens-by-day"] h2 svg')).toHaveAttribute('class', tokenIcon!);
});

test('Developer KPI concepts have logical Lucide icons and distinct colors', async ({ page }) => {
  for (const path of ['/event-bus','/agent-workbench']) {
    await page.goto(path);
    await expect(page.locator('.kpi')).toHaveCount(4);
    const icons: Array<string | null> = [];
    for (const card of await page.locator('.kpi').all()) {
      await expect(card.locator('.k-l svg')).toHaveCount(1);
      await expect(card).toHaveAttribute('data-field-tone', /.+/);
      icons.push(await card.locator('.k-l svg').getAttribute('class'));
    }
    expect(new Set(icons).size).toBe(4);
  }
});

// Discovered by the live computed-style review: legacy KPI rules with a tone
// attribute overrode labels only on cards whose caller supplied that attribute.
test('KPI colors follow their semantic identity instead of inherited gray', async ({ page }) => {
  await page.goto('/event-bus');
  await expect(page.locator('.kpi').filter({ hasText: 'Delegation rows' }).locator('.k-v')).toHaveText('1');
  const colors: string[] = [];
  for (const card of await page.locator('.kpi').all()) {
    const tone = await card.getAttribute('data-field-tone');
    const hex = await card.evaluate((el, name) => getComputedStyle(el).getPropertyValue('--field-' + name).trim(), tone);
    const channels = hex.replace('#', '').match(/../g)!.map(x => parseInt(x, 16));
    const expected = `rgb(${channels.join(', ')})`;
    await expect(card.locator('.k-l')).toHaveCSS('color', expected);
    await expect(card.locator('.k-l svg')).toHaveCSS('color', expected);
    await expect(card.locator('.k-v')).toHaveCSS('color', expected);
    colors.push(expected);
  }
  expect(new Set(colors).size).toBe(4);
});

test('headline card icons retain semantic colors beside neutral readable headings', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.locator('.local-overview-summary article')).toHaveCount(4);
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const colors: string[] = [];
    for (const card of await page.locator('.local-overview-summary article').all()) {
      const color = await card.locator('h2 svg').evaluate(el => getComputedStyle(el).color);
      await expect(card.locator('h2')).toHaveCSS('color', await card.evaluate(el => getComputedStyle(el).color));
      colors.push(color);
    }
    expect(new Set(colors).size).toBe(4);
  }
});

// User screenshots exposed two failures that hex uniqueness missed: adjacent
// blue/indigo fields and two economy tiers rendered with the same green.
test('routing categories have separate colors matching their legend in both themes', async ({ page }, info) => {
  const names = ['local','harness','cheap_frontier','cheap_cloud','claude','cloud','frontier'];
  const routing = { total_delegations: 7, by_tier: { total_tasks: 7, tier_routed_total: 7, not_tier_routed_count: 0,
    tiers: names.map(name => ({ cost_tier_name: name, count: 1, tier_routed: true, pct_of_tier_routed: 1 / 7 })) } };
  await serveCharts(page, { ...rows, [prefix + 'delegation.model-routing.v1']: [routing] });
  await page.goto('/overview');
  await expect(page.locator('.local-donut-slice')).toHaveCount(7);
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const colors = [];
    for (const name of names) {
      const color = await page.locator(`[data-tier="${name}"]`).evaluate(el => getComputedStyle(el).stroke);
      await expect(page.getByRole('button', { name: `Inspect ${name}`, exact: true }).locator('.local-share-swatch')).toHaveCSS('background-color', color);
      colors.push(color);
    }
    expect(new Set(colors).size).toBe(names.length);
    await page.screenshot({ path: info.outputPath(`routing-colors-${theme}.png`) });
  }
});

test('checks, score, run ID and model occupy distinct hue families', async ({ page }) => {
  await page.goto('/overview');
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const hues = await page.locator('html').evaluate(el => ['count','score','identity','model'].map(name => {
      const hex = getComputedStyle(el).getPropertyValue('--field-' + name).trim();
      const [r,g,b] = hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255);
      const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
      return ((max === r ? (g-b)/d : max === g ? (b-r)/d+2 : (r-g)/d+4)*60+360)%360;
    }));
    for (let i=0;i<hues.length;i++) for (let j=i+1;j<hues.length;j++) {
      const gap = Math.abs(hues[i]-hues[j]);
      expect(Math.min(gap,360-gap), `${theme}: hues ${hues[i]} and ${hues[j]}`).toBeGreaterThan(30);
    }
  }
});

// Legacy compact-card CSS clipped these labels to a 1px accessibility-only box.
test('Overview visibly labels model and run identity beside their Lucide icons', async ({ page }, info) => {
  await page.goto('/overview');
  const card = page.locator('[data-component="overview-last-run"]');
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    for (const name of ['Model','Run']) {
      const label = card.locator(`[data-field="${name}"] dt`);
      await expect(label).toContainText(name);
      const box = await label.boundingBox();
      expect(box!.width).toBeGreaterThan(30);
      expect(box!.height).toBeGreaterThan(12);
      await expect(label.locator('svg')).toBeVisible();
    }
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`visible-last-run-${theme}.png`) });
  }
});

// A long backend failure made the Overview row expand into a detailed report.
test('Overview keeps a long failure compact and reveals its complete original reason on demand', async ({ page }, info) => {
  const reason = 'Recorded failure: ' + 'provider credential reference unavailable; '.repeat(30);
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [{ ...run, quality_gate_passed: false, quality_gate_detail: reason }] });
  await page.goto('/overview');
  const cause = page.locator('[data-component="overview-last-run"] [data-field="Cause"] dd');
  const details = cause.locator('details');
  await expect(details).not.toHaveAttribute('open');
  await expect(cause.locator('summary')).toBeVisible();
  expect((await cause.boundingBox())!.height).toBeLessThan(75);
  await cause.locator('summary').press('Enter');
  await expect(details).toHaveAttribute('open','');
  await expect(cause.locator('p')).toHaveText(reason);
  await cause.locator('summary').press('Enter');
  await expect(details).not.toHaveAttribute('open');
  await expect(page.getByRole('link', { name: 'Open run details', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-a/);
  await page.locator('[data-component="overview-last-run"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('compact-recorded-failure.png') });
});
