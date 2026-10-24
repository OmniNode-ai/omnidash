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
const bareExposurePattern = (bases: string[]) => new RegExp(
  `(?<![\\w-])(${bases.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`,
  'g',
);
const matchers: [string, RegExp][] = [
  ['exposure name', /[a-z0-9-]+(\.[a-z0-9-]+)*\.v[0-9]+/g],
  ['snake_case field', /\b[a-z]+(_[a-z0-9]+)+\b/g],
  ['ALL_CAPS code', /\b[A-Z]{2,}(_[A-Z0-9]+)+\b/g],
  ['legacy quality code', /\bMALFORMED\b/g],
  ['bare exposure base', bareExposurePattern(exposureBases)],
];
const offences = (text: string) => matchers.flatMap(([kind, re]) => [...text.matchAll(re)].map(m => `${kind}: ${m[0]}`));

const emptyRows = Object.fromEntries(Object.keys(chartRows).map(topic => [topic, []]));
const causeLabels = {
  provider_quota_exhausted: 'Provider quota exhausted', auth_failed: 'Authentication failed',
  provider_error: 'Provider error', quality_gate_refused: 'Quality gate refused', timeout: 'Timed out',
  no_terminal: 'Run completion not recorded', runtime_shutdown: 'Runtime stopped',
  refused_before_dispatch: 'Refused before dispatch', returned_to_caller: 'Returned to caller',
};
const refusalRows: Record<string, unknown>[] = Object.keys(causeLabels).map((cause, index) => ({
  ...chartRows[prefix + 'delegation.decisions.v1'][0] as object,
  correlation_id: `cause-run-${index}`, terminal_ok: false, quality_gate_passed: null,
  terminal_failure_cause: cause, quality_gate_detail: cause,
}));
refusalRows.push({ ...refusalRows[0], correlation_id: 'legacy-quality-run', terminal_failure_cause: null,
  quality_gate_passed: false, quality_gate_detail: 'MALFORMED: invalid syntax' });
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
  'typed terminal failures': page => serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: refusalRows }),
};

test('typed failure labels preserve the exact served cause filter and selected run', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: refusalRows });
  await page.goto('/runs?status=failed&cause=refused_before_dispatch');
  const cause = page.getByLabel('Cause', { exact: true });
  await expect(cause).toHaveValue('refused_before_dispatch');
  await expect(cause.locator('option:checked')).toHaveText('Refused before dispatch');
  const row = page.locator('.local-runs-wrap tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row.locator('[data-failure-cause="refused_before_dispatch"]')).toHaveText('Refused before dispatch');
  await row.click();
  const selected = page.getByRole('complementary', { name: 'Selected run' });
  await expect(selected).toContainText('cause-run-7');
  await expect(selected.locator('[data-failure-cause="refused_before_dispatch"]')).toHaveText('Refused before dispatch');
  await expect(page).toHaveURL(/cause=refused_before_dispatch/);
  // A typed enum may also be the served failure detail; titles must read
  // the same precise label, including the ordinary-word timeout enum.
  for (const [code, label] of Object.entries(causeLabels)) {
    await cause.selectOption(code);
    const causeCell = page.locator('.local-runs-wrap tbody [data-failure-cause]');
    await expect(causeCell).toHaveText(label);
    await expect.soft(causeCell).toHaveAttribute('title', label);
  }
  await cause.selectOption('MALFORMED');
  const legacyCause = page.locator('.local-runs-wrap tbody [data-failure-cause="MALFORMED"]');
  await expect(legacyCause).toHaveText('Malformed output');
  await expect.soft(legacyCause).toHaveAttribute('title', 'Malformed output: invalid syntax');
  await cause.selectOption('refused_before_dispatch');
  const labels = await cause.locator('option').allTextContents();
  for (const label of Object.values(causeLabels)) expect(labels).toContain(label);
  const leaks = await page.locator('[title], [aria-label]').evaluateAll(elements => elements.flatMap(el =>
    ['title', 'aria-label'].flatMap(name => {
      const value = el.getAttribute(name) ?? '';
      return /\b[a-z]+(?:_[a-z0-9]+)+\b/.test(value) ? [value] : [];
    })));
  expect(leaks).toEqual([]);
  await page.screenshot({ path: info.outputPath('friendly-refusal-and-raw-filter.png'), fullPage: true });
});

async function visibleText(page: Page) {
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('.main')?.textContent ?? 'Loading'), null, { timeout: 15000 }).catch(() => undefined);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.waitForTimeout(150);
  return page.evaluate(() => (document.querySelector('.app') as HTMLElement | null)?.innerText ?? document.body.innerText);
}

test('bare exposure bases match regex syntax literally', () => {
  const bases = [String.raw`tenant\name`, 'cost.savings', 'base+name', 'base?name',
    'base*name', 'base(name)', 'base[name]', 'base{name}', '^base$', 'base|name'];
  for (const base of bases) {
    expect(`waits on ${base} day rows`.match(bareExposurePattern(bases))).toEqual([base]);
  }
  expect('waits on costXsavings day rows'.match(bareExposurePattern(bases))).toBeNull();
  expect('waits on base day rows'.match(bareExposurePattern(bases))).toBeNull();
  expect('waits on prefix-cost.savings-suffix day rows'.match(bareExposurePattern(bases))).toBeNull();
});

test('positive control: the matcher catches planted internal names', () => {
  expect(offences('Source: metering-summary.v1')).toEqual(expect.arrayContaining(['exposure name: metering-summary.v1']));
  expect(offences('waits on savings_per_measured_run_usd')).toContain('snake_case field: savings_per_measured_run_usd');
  expect(offences('MALFORMED: invalid syntax')).toContain('legacy quality code: MALFORMED');
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
