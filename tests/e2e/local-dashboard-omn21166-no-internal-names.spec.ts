import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// AC39 (TI24): no user-visible text on the six core pages or Delegation Evidence
// names an internal exposure, topic, table, column or typed code. Failure modes
// covered: a populated page captions its source; a waiting state quotes the
// exposure or field it waits on; an unavailable state prints a typed code
// (CLOUD_NOT_LINKED); content hidden in a closed disclosure leaks the same names.
// The Developer area (Lab, Event Bus, Agent Workbench, Experimentation) is excluded.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const pages = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys', 'delegation-evidence'];
const exposureBases = Object.keys(chartRows).map(topic => topic.slice(prefix.length).replace(/\.v\d+$/, ''));
const matchers: [string, RegExp][] = [
  ['exposure name', /[a-z0-9-]+(\.[a-z0-9-]+)*\.v[0-9]+/g],
  ['snake_case field', /\b[a-z]+(_[a-z0-9]+)+\b/g],
  ['ALL_CAPS code', /\b[A-Z]{2,}(_[A-Z0-9]+)+\b/g],
  ['bare exposure base', new RegExp(`(?<![\\w-])(${exposureBases.map(b => b.replace(/\./g, '\\.')).join('|')})(?![\\w-])`, 'g')],
];
const offences = (text: string) => matchers.flatMap(([kind, re]) => [...text.matchAll(re)].map(m => `${kind}: ${m[0]}`));

const emptyRows = Object.fromEntries(Object.keys(chartRows).map(topic => [topic, []]));
const scenarios: Record<string, (page: Page) => Promise<void>> = {
  populated: page => serveCharts(page),
  'served but empty': page => serveCharts(page, emptyRows),
  unserved: async page => {
    await serveCharts(page, emptyRows);
    await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics: [] }) }));
  },
  // A read the backend refuses with a named code, and a store that has no table for an exposure.
  'read refused': async page => {
    await serveCharts(page);
    await page.route('**/projection/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'tenant_conflict' }) }));
  },
  'store has no table': async page => {
    await serveCharts(page);
    await page.route('**/projection/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'projection_table_missing' }) }));
  },
  'missing tenant': page => serveCharts(page, { ...chartRows, [prefix + 'tenant-credentials.v1']: [], [prefix + 'local-environment.v1']: [] }),
};

async function visibleText(page: Page) {
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('.main')?.textContent ?? 'Loading'), null, { timeout: 15000 }).catch(() => undefined);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.waitForTimeout(150);
  return page.evaluate(() => (document.querySelector('.app') as HTMLElement | null)?.innerText ?? document.body.innerText);
}

test('positive control: the matcher catches planted internal names', () => {
  expect(offences('Source: metering-summary.v1')).toEqual(expect.arrayContaining(['exposure name: metering-summary.v1']));
  expect(offences('waits on savings_per_measured_run_usd')).toContain('snake_case field: savings_per_measured_run_usd');
  expect(offences('CLOUD_NOT_LINKED')).toContain('ALL_CAPS code: CLOUD_NOT_LINKED');
  expect(offences('waits on metering-summary day rows')).toContain('bare exposure base: metering-summary');
  expect(offences('Not available yet. 42% below the baseline-a baseline (modelled)')).toEqual([]);
});

for (const [name, serve] of Object.entries(scenarios)) {
  test(`no internal names on the seven pages: ${name}`, async ({ page }) => {
    test.setTimeout(120000);
    await serve(page);
    const found: string[] = [];
    let chars = 0;
    for (const route of pages) {
      await page.goto('/' + route);
      await expect(page.locator('.breadcrumbs .cur')).not.toHaveText('');
      const text = await visibleText(page);
      chars += text.length;
      for (const line of text.split('\n')) found.push(...offences(line).map(o => `${route}: ${o} <- "${line.trim().slice(0, 110)}"`));
    }
    expect(chars, 'positive control: pages rendered real text').toBeGreaterThan(2000);
    expect([...new Set(found)]).toEqual([]);
  });
}
