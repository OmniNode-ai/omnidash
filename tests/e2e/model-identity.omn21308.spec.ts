import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// AC3 failure modes, before product changes: the unpriced first model shifts
// priced-slice identity; refresh/reordering recolours a model; exact model IDs
// are merged by lowercasing; routing names and chart marks use different maps.
// Current dev already fixes the first two shapes: keep them as positive controls.
const USAGE = prefix + 'usage-by-model-day.v1';
const DECISIONS = prefix + 'delegation.decisions.v1';
const ROUTING = prefix + 'delegation.model-routing.v1';

function fixture(names: string[]) {
  const day = new Date().toISOString().slice(0, 10);
  const usage = names.map((name, index) => ({
    usage_day: day, model_id: name, input_tokens: 100 + index, output_tokens: 20 + index,
    measured_cost_usd: index === 0 ? null : String(index), call_count: 1,
    unmeasured_call_count: index === 0 ? 1 : 0, call_share: 1 / names.length,
    cost_tier_name: 'local',
  }));
  return { ...chartRows,
    [USAGE]: usage,
    [DECISIONS]: names.map((name, index) => ({
      ...chartRows[DECISIONS][0] as object,
      correlation_id: `identity-run-${index}`, model_name: name,
      created_at: `${day}T01:0${index}:00Z`, written_at: `${day}T01:0${index}:00Z`,
      quality_gate_passed: true,
    })),
    [ROUTING]: [{ total_delegations: names.length, by_tier: {
      total_tasks: names.length, tier_routed_total: names.length, not_tier_routed_count: 0,
      tiers: [{ cost_tier_name: 'local', count: names.length, tier_routed: true, pct_of_tier_routed: 1,
        models: names.map((name, index) => ({ model_name: name, count: 1,
          pct_of_tier_routed: 1 / names.length, cost_usd: index === 0 ? null : String(index),
          unmeasured_cost_count: index === 0 ? 1 : 0,
        })),
      }],
    } }],
  };
}

async function theme(page: Page, requested: string) {
  if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== requested) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  }
}

async function usageColors(page: Page, names: string[]) {
  const spend = page.getByRole('figure', { name: 'Spend by model', exact: true });
  const tokens = page.getByRole('figure', { name: 'Tokens by model and day', exact: true });
  await expect(spend.locator('.usage-model-legend button')).toHaveCount(names.length);
  await expect(tokens.getByRole('group', { name: 'Model highlight' }).getByRole('button')).toHaveCount(names.length);
  const result: Record<string, string> = {};
  for (const [index, name] of names.entries()) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const legend = spend.getByRole('button', { name: new RegExp(`^${escaped}:`) });
    const color = await legend.locator('i').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(color, `${name}: real legend color`).not.toBe('rgba(0, 0, 0, 0)');
    const highlight = tokens.getByRole('button', { name: `Highlight ${name}`, exact: true });
    await expect(highlight.locator('.usage-model-swatch')).toHaveCSS('background-color', color);
    await expect(tokens.locator('.usage-tokens-bar').first().locator('.usage-tokens-fill').nth(index)).toHaveCSS('background-color', color);
    const tokenLegend = tokens.locator('.usage-tokens-legend').first().getByRole('listitem').nth(index);
    expect(await tokenLegend.evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe(color);
    result[name] = color;
  }
  const gradient = await spend.locator('.usage-donut').evaluate(el => getComputedStyle(el).backgroundImage);
  for (const name of names.filter(name => name !== 'unpriced-model')) expect(gradient, `slice for ${name}`).toContain(result[name]);
  expect(gradient, 'unpriced model must not create a zero-cost slice').not.toContain(result['unpriced-model']);
  return result;
}

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce' });

for (const selectedTheme of ['light', 'dark']) {
  test(`AC3: unpriced-first chart, legend and widget retain identity after reorder, ${selectedTheme}`, async ({ page }, info) => {
    const names = ['unpriced-model', 'model-a', 'model-b'];
    const rows = fixture(names);
    await serveCharts(page, rows);
    await page.goto('/usage');
    await theme(page, selectedTheme);
    const before = await usageColors(page, names);
    rows[USAGE] = [...rows[USAGE]].reverse();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const tokens = page.getByRole('figure', { name: 'Tokens by model and day', exact: true });
    await expect(tokens.getByRole('group', { name: 'Model highlight' }).getByRole('button').first()).toHaveText('model-b');
    expect(await usageColors(page, [...names].reverse())).toEqual(before);
    await page.screenshot({ path: info.outputPath('model-identity-reordered.png'), fullPage: true, animations: 'disabled' });
    await info.attach('model-colors', { body: JSON.stringify({ theme: selectedTheme, before }), contentType: 'application/json' });
  });

  test(`AC3: exact served model IDs do not alias by case, ${selectedTheme}`, async ({ page }, info) => {
    const names = ['unpriced-model', 'Model-A', 'model-a'];
    await serveCharts(page, fixture(names));
    await page.goto('/usage');
    await theme(page, selectedTheme);
    const colors = await usageColors(page, names);
    expect(colors['Model-A'], 'distinct served model identities need distinct measured colors').not.toBe(colors['model-a']);
    await info.attach('model-colors', { body: JSON.stringify({ theme: selectedTheme, colors }), contentType: 'application/json' });
  });

  test(`AC3: routing model identity agrees with its chart ring and model label, ${selectedTheme}`, async ({ page }, info) => {
    const names = ['unpriced-model', 'model-a', 'model-b'];
    await serveCharts(page, fixture(names));
    await page.goto('/overview');
    await theme(page, selectedTheme);
    await page.getByText('Detailed activity analysis', { exact: true }).click();
    await page.locator('[data-component="overview-tier-mix"] details.local-tier-details > summary').click();
    const colors: Record<string, { ring: string; name: string; routing: string }> = {};
    for (const name of names) {
      const ring = page.locator('.ins-ring').filter({ has: page.getByText(name, { exact: true }) });
      await expect(ring).toHaveCount(1);
      const ringColor = await ring.locator('circle.od-ring').evaluate(el => getComputedStyle(el).stroke);
      const nameColor = await ring.locator('.ins-ring-name').evaluate(el => getComputedStyle(el).color);
      const routing = page.locator('.local-routing-model-row').filter({ hasText: name }).locator('.local-model-identity');
      await expect(routing).toHaveCount(1);
      const routingColor = await routing.evaluate(el => getComputedStyle(el).color);
      colors[name] = { ring: ringColor, name: nameColor, routing: routingColor };
      expect(nameColor, `${name}: model label and chart mark`).toBe(ringColor);
      expect(routingColor, `${name}: same model in routing and chart`).toBe(ringColor);
    }
    await page.screenshot({ path: info.outputPath('model-identity-overview.png'), fullPage: true, animations: 'disabled' });
    await info.attach('model-colors', { body: JSON.stringify({ theme: selectedTheme, colors }), contentType: 'application/json' });
  });
}
