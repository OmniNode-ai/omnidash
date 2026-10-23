import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Realistic failures: Evidence's legacy quality palette disagrees with shared
// pass/fail identities; baseline and actual spend use unrelated colours; saved
// money shares actual-spend green; the savings hero uses the spend amber.
// Finite, nonzero fixtures make every bar visible. Inspect actual legacy DOM
// labels/paint, not new semantic metadata that could merely assert correctness.
const rows = { ...chartRows,
  [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-23T10:00:00Z',
    total_baseline_cost_usd: 10, total_cost_usd: 2, total_savings_usd: 8,
    run_count: 8, measured_run_count: 8, unknown_run_count: 0, tokens_total: 100 }],
  [prefix + 'delegation.savings.v1']: [{ baseline_model: 'baseline-a', pricing_manifest_version: 'fixture-v1' }],
};

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

for (const theme of ['light', 'dark']) {
  test(`Evidence quality and money keep their shared concept colours in ${theme}`, async ({ page }, info) => {
    await serveCharts(page, rows);
    await page.goto('/delegation-evidence');
    await expect(page.locator('.ev-qg-stats')).toBeVisible();
    await expect(page.locator('.ev-savings-hero .big')).toHaveText('$8.00');
    if ((await page.locator('html').getAttribute('data-theme') ?? 'light') !== theme)
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));

    const targets = [
      { name: 'pass bar', token: 'pass', property: 'backgroundColor', locator: page.locator('.ev-qg-bar > .bar-fill').nth(0) },
      { name: 'fail bar', token: 'fail', property: 'backgroundColor', locator: page.locator('.ev-qg-bar > .bar-fill').nth(1) },
      ...['pass', 'fail'].map(tone => ({ name: `${tone} statistic`, token: tone, property: 'color',
        locator: page.locator('.ev-qg-stats .stat-inline').filter({ has: page.locator('.note', { hasText: new RegExp(`^${tone}$`) }) }).locator('.big') })),
      ...[
        ['Cloud baseline cost', 'baseline', '$10.00'],
        ['Local / delegated cost', 'cost', '$2.00'],
        ['Saved', 'savings', '$8.00'],
      ].map(([label, token, value]) => ({ name: label!, token: token!, property: 'backgroundColor', value,
        locator: page.locator('.barrow').filter({ has: page.locator('.lab', { hasText: new RegExp(`^${label!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('.bar-fill') })),
      { name: 'savings hero', token: 'savings', property: 'color', locator: page.locator('.ev-savings-hero .big') },
    ];
    for (const target of targets) {
      await expect(target.locator, target.name).toHaveCount(1);
      await expect(target.locator, target.name).toBeVisible();
      if ('value' in target) await expect(target.locator.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " barrow ")][1]').locator('.val')).toHaveText(target.value!);
    }
    // Wait for measured colours themselves to stop changing, without disabling
    // transitions or requiring them to converge to the expected (possibly wrong) palette.
    await page.evaluate(async () => {
      const sample = () => [...document.querySelectorAll('.ev-qg-stats .big, .ev-qg-bar .bar-fill, .barrow .bar-fill, .ev-savings-hero .big')]
        .map(el => { const s = getComputedStyle(el); return `${s.color}/${s.backgroundColor}`; }).join('|');
      let previous = sample(), stable = 0;
      const deadline = performance.now() + 2000;
      while (stable < 3) {
        if (performance.now() > deadline) throw new Error('Evidence colours did not settle within 2000ms');
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const current = sample(); stable = current === previous ? stable + 1 : 0; previous = current;
      }
    });
    const canonical = await page.locator('.ev-root').evaluate(root => {
      const probe = document.createElement('span'); root.append(probe);
      try {
        return Object.fromEntries(['pass', 'fail', 'baseline', 'cost', 'savings'].map(token => {
          const declared = getComputedStyle(root).getPropertyValue(`--field-${token}`).trim();
          if (!declared || !CSS.supports('color', declared)) throw new Error(`Missing canonical ${token} colour: ${declared}`);
          probe.style.color = `var(--field-${token})`;
          return [token, getComputedStyle(probe).color];
        }));
      } finally { probe.remove(); }
    });
    expect(new Set(Object.values(canonical)).size, 'five distinct canonical concept colours').toBe(5);
    const actual = [];
    for (const target of targets) actual.push({ name: target.name, token: target.token,
      expected: canonical[target.token], observed: await target.locator.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property === 'backgroundColor' ? 'background-color' : property), target.property) });
    writeFileSync(info.outputPath('evidence-concept-colours.json'), JSON.stringify({ theme, source: process.env.OMNIDASH_TEST_SOURCE_SHA ?? 'UNVERIFIED', data: 'governed response fixtures', canonical, actual }, null, 2));
    await page.screenshot({ path: info.outputPath(`evidence-concept-colours-${theme}.png`), fullPage: true });
    for (const reading of actual) expect.soft(reading.observed, `${theme}: ${reading.name}`).toBe(reading.expected);
  });
}
