import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
import { withAllTime, withAnalysis, withTrace } from './omn21166-redesign-fixtures';

// OMN-21166 part 29, revision 6 (Lakshman 2026-10-27: "based on delegation data you can redesign all pages and make a best
// dashboard", benchmarked against 20 platforms; Codex critique MSGs cf609ee2, 02a3961e, c8abbf3f). Journeys, not one
// spec per criterion. Failure modes declared before the code:
//   J1  a headline card still opens a hover popover over the next chart, or its caption runs past two lines (AC191);
//   J2  the full basis leaves the page when the popover goes, so a screen reader loses the pricing and exclusions (AC191);
//   J3  a caption makes cards in one row different heights (AC191);
//   J4  a model on Usage opens nothing, or opens Runs without the filter, or the filter drops on reload (AC193);
//   J5  a UTC day with no runs opens an error instead of a zero-result list (AC193, AC85);
//   J6  a sample figure reads as the canonical total: no sample size or coverage on the analysis (AC194, AC195, AC196);
//   J7  a rate over the wrong denominator: a run with no verdict counted as failed, a missing latency as 0 ms (AC194);
//   J8  a day before the sample's coverage drawn as 0 in the sparkline (AC194);
//   J9  a measured $0 model hidden, or an unmeasured model drawn at 0 on the cost-versus-quality chart (AC195);
//   J10 the Runs totals line does not follow the filter (AC196);
//   J11 a waterfall bar drawn for a step without both a start and a duration, or at a wrong offset or width (AC197);
//   J12 a window summed over days on two pricing versions names one version (AC200, Codex MSG a9bd908d).
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const HEADLINE_PAGES = ['/overview', '/runs', '/usage', '/delegation-evidence'];


async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
}

test('AC191 headline cards carry a short caption under the figure instead of a hover popover', async ({ page }, info) => {
  await serveCharts(page, withAllTime);
  const receipt: Record<string, unknown>[] = [];
  for (const path of HEADLINE_PAGES) {
    await settle(page, path);
    const cards = page.locator('.local-overview-summary > .local-dashboard-panel');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count, `${path} has headline cards`).toBeGreaterThanOrEqual(4);
    // J1: hovering a card opens nothing; the old popover node is gone from every card.
    await cards.first().hover();
    await expect(page.locator('.local-overview-summary [role="tooltip"]'), `${path}: no popover`).toHaveCount(0);
    const read = await cards.evaluateAll(els => els.map(el => {
      const basis = el.querySelector('.local-card-caption');
      const visible = basis ? [...basis.children].filter(child => getComputedStyle(child).position !== 'absolute' && (child as HTMLElement).offsetHeight > 0) : [];
      const first = visible[0] as HTMLElement | undefined;
      return {
        label: el.querySelector('h2')?.textContent ?? '',
        height: Math.round(el.getBoundingClientRect().height), top: Math.round(el.getBoundingClientRect().top),
        lines: basis ? basis.children.length : 0, visibleLines: visible.length,
        captionLines: first ? Math.round(first.getBoundingClientRect().height / parseFloat(getComputedStyle(first).lineHeight)) : 0,
        captionSize: first ? getComputedStyle(first).fontSize : null,
        cut: first ? first.scrollHeight > first.clientHeight + 1 : false,
        basisText: basis?.textContent ?? '',
      };
    }));
    receipt.push({ path, read });
    const withBasis = read.filter(card => card.lines > 0);
    expect(withBasis.length, `${path}: cards with a basis`).toBeGreaterThan(0);
    for (const card of withBasis) {
      expect(card.visibleLines, `${path} ${card.label}: one visible caption`).toBe(1);
      expect(card.captionLines, `${path} ${card.label}: at most two lines`).toBeLessThanOrEqual(2);
      expect(card.captionSize, `${path} ${card.label}: 12px caption`).toBe('12px');
      // Lakshman 2026-10-27 ('in cards why text big so it ...?'): a caption is short enough to show whole, never cut with '...'.
      expect(card.cut, `${path} ${card.label}: caption shown whole`).toBe(false);
    }
    // J2: every basis line stays in the page text even when only the first is drawn.
    for (const card of withBasis.filter(item => item.lines > 1)) expect(card.basisText.length, `${path} ${card.label}: full basis kept`).toBeGreaterThan(20);
    // J3: cards on one row share one height.
    const rows = new Map<number, number[]>();
    for (const card of read) rows.set(card.top, [...(rows.get(card.top) ?? []), card.height]);
    for (const heights of rows.values()) expect(Math.max(...heights) - Math.min(...heights), `${path}: equal heights in a row`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`captions${path.replaceAll('/', '-')}.png`) });
  }
  writeFileSync(info.outputPath('ac191-captions.json'), JSON.stringify(receipt, null, 2));
});

test('AC193 a model on Usage opens Runs filtered to it, the filter survives a reload, and a no-run day is a zero result', async ({ page }, info) => {
  await serveCharts(page, withAllTime);
  await settle(page, '/usage');
  const link = page.locator('main a.rb-link[aria-label*="Opens Runs filtered to"]').first();
  await expect(link, 'a Usage model links to Runs').toBeVisible();
  const label = await link.getAttribute('aria-label');
  const model = /Opens Runs filtered to (.+)$/.exec(label ?? '')?.[1];
  expect(model, 'the link names its model').toBeTruthy();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/runs\\?.*model=${encodeURIComponent(model!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  const filtered = async () => {
    await expect(page.locator('main h1')).toHaveText('Runs');
    const names = await page.locator('[data-component="recent-runs"] tbody button.local-cell-filter[aria-label^="Show only runs of model"]').allTextContents();
    expect(names.length, 'filtered rows').toBeGreaterThan(0);
    for (const name of names) expect(name.trim()).toBe(model);
  };
  await filtered();
  await page.reload();
  await filtered();
  // J5: a day with no runs in the served rows is a valid filter with zero results, not an error.
  await settle(page, '/runs?day=2026-01-01');
  await expect(page.locator('[data-component="recent-runs"] [role="alert"]')).toHaveCount(0);
  await expect(page.locator('[data-component="recent-runs"] tbody button.local-cell-filter[aria-label^="Show only runs of model"]')).toHaveCount(0);
  await expect(page.locator('[data-component="recent-runs"]')).toContainText(/no runs|0 runs|No matching runs/i);
  await page.screenshot({ path: info.outputPath('ac193-zero-day.png') });
});

test('AC194 AC195 Usage analysis groups the served sample with its own denominators, coverage and cost-versus-quality points', async ({ page }, info) => {
  await serveCharts(page, withAnalysis);
  await settle(page, '/usage');
  const analysis = page.locator('[data-usage-analysis]');
  await expect(analysis).toBeVisible();
  // J6: the scope is stated, not implied.
  await expect(analysis).toContainText('latest 6 served runs, covering Oct 15 to Oct 17');
  const row = (name: string) => analysis.locator('table[data-analysis-table] tbody tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${name}$`) }) });
  await expect(analysis.locator('table[data-analysis-table] tbody tr')).toHaveCount(3);
  // J7: own denominators per rate; a missing verdict is not a failure and a missing latency is not 0 ms.
  await expect(row('model-a')).toContainText('3');
  await expect(row('model-a').locator('[data-cell="spend"]')).toHaveText('$0.006 (2 of 3 measured)');
  await expect(row('model-a').locator('[data-cell="pass"]')).toHaveText('66.7% (2 of 3)');
  await expect(row('model-a').locator('[data-cell="p50"]')).toHaveText('300 ms');
  await expect(row('model-a').locator('[data-cell="p95"]')).toHaveText('500 ms');
  await expect(row('model-b').locator('[data-cell="spend"]')).toHaveText('$0.00 (2 of 2 measured)');
  await expect(row('model-b').locator('[data-cell="pass"]')).toHaveText('100.0% (1 of 1)');
  await expect(row('model-b').locator('[data-cell="p95"]')).toHaveText('200 ms');
  await expect(row('Not recorded').locator('[data-cell="spend"]')).toHaveText('Not measured');
  // J8: days before the coverage are not covered, never 0.
  const spark = row('model-a').locator('[data-cell="spark"] [data-day]');
  await expect(spark).toHaveCount(14);
  await expect(row('model-a').locator('[data-cell="spark"] [data-day][data-covered="false"]')).toHaveCount(11);
  await expect(row('model-a').locator('[data-cell="spark"] [data-day="2026-10-15"]')).toHaveAttribute('data-runs', '1');
  // Group by tier: one group for the six local runs.
  await analysis.getByRole('radio', { name: 'Tier', exact: true }).check();
  await expect(analysis.locator('table[data-analysis-table] tbody tr')).toHaveCount(1);
  // J9: cost versus quality; a measured $0 model is a real point at the left edge, the unrecorded model is listed.
  const points = analysis.locator('[data-quality-point]');
  await expect(points).toHaveCount(2);
  await expect(analysis.locator('[data-quality-point="model-b"]')).toHaveAttribute('data-cost', '0');
  await expect(analysis.locator('[data-quality-point="model-a"]')).toHaveAttribute('aria-label', /model-a: \$0\.003 per measured run, 66\.7% passed \(2 of 3\), 3 runs/);
  await analysis.locator('[data-quality-point="model-a"]').focus();
  await expect(analysis.locator('[data-quality-point="model-a"]')).toBeFocused();
  await expect(analysis.locator('[data-quality-unplotted]')).toContainText('Not recorded');
  await page.screenshot({ path: info.outputPath('ac194-usage-analysis.png'), fullPage: true });
});

test('AC196 Runs states its totals for the current filter, labelled as the served sample', async ({ page }) => {
  await serveCharts(page, withAnalysis);
  await settle(page, '/runs');
  const line = page.locator('[data-runs-totals]');
  await expect(line).toContainText('current filter · latest 6 served runs');
  await expect(line.locator('[data-total="runs"]')).toHaveText('6 runs');
  await expect(line.locator('[data-total="pass"]')).toHaveText('60.0% passed (3 of 5)');
  await expect(line.locator('[data-total="p95"]')).toHaveText('p95 500 ms');
  // J10: the line follows the filter.
  await settle(page, '/runs?model=model-a');
  await expect(line.locator('[data-total="runs"]')).toHaveText('3 runs');
  await expect(line.locator('[data-total="pass"]')).toHaveText('66.7% passed (2 of 3)');
});

test('AC197 Workflow draws the run as a waterfall: bars only for steps with a start and a duration, attempts as their own rows', async ({ page }, info) => {
  await serveCharts(page, withTrace);
  await settle(page, '/workflow?correlation_id=an-1');
  const rows = page.locator('ol.local-dashboard-steps > li');
  await expect(rows).toHaveCount(6);
  const read = await rows.evaluateAll(items => items.map(item => {
    const track = item.querySelector('[data-waterfall]') as HTMLElement | null;
    const bar = item.querySelector('[data-waterfall-bar]') as HTMLElement | null;
    const box = track?.getBoundingClientRect(); const barBox = bar?.getBoundingClientRect();
    return { positioned: track?.getAttribute('data-positioned'), text: track?.textContent ?? '',
      left: box && barBox ? (barBox.left - box.left) / box.width : null, width: box && barBox ? barBox.width / box.width : null };
  }));
  writeFileSync(info.outputPath('ac197-waterfall.json'), JSON.stringify(read, null, 2));
  expect(read.map(row => row.positioned)).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
  // J11: offsets and widths on the shared 730 ms axis.
  expect(read[2]!.left!).toBeCloseTo(30 / 730, 2);
  expect(read[2]!.width!).toBeCloseTo(400 / 730, 2);
  expect(read[3]!.left!).toBeCloseTo(430 / 730, 2);
  expect(read[3]!.width!).toBeCloseTo(300 / 730, 2);
  for (const row of read.slice(4)) {
    expect(row.text).toContain('not recorded');
    expect(row.width, 'no bar without both times').toBeNull();
  }
  // Attempts are the served attempt steps, each its own row; with them present no escalation-count sentence stands in.
  await expect(rows.nth(2)).toContainText('attempt: 1');
  await expect(rows.nth(3)).toContainText('attempt: 2');
  await expect(page.locator('[data-escalation-text]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('ac197-waterfall.png'), fullPage: true });
});

test('AC200 a window summed over days on two pricing versions reads as a mixed basis, one version as that version (control)', async ({ page }) => {
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  const meteringDay = (ago: number, version: string) => ({ tenant_id: 'chart-fixture-tenant', window_kind: 'day', window_start: day(ago),
    as_of: new Date().toISOString(), baseline_model: 'baseline-a', baseline_state: 'resolved', pricing_manifest_version: version === '' ? null : version,
    spend_usd: '0.010000', counterfactual_usd: '0.050000', savings_usd: '0.040000', runs_total: 1, runs_measured: 1, runs_unknown_tokens: 0,
    runs_unknown_spend: 0, tokens_in: 10, tokens_out: 5 });
  const all = { ...meteringDay(0, '2.0.0'), window_kind: 'all', window_start: '' };
  // The metering source: the catalogue says the old aggregate has no local table, so Overview's windows read metering rows
  // (as overview-links.spec's serveMetering does); with the old aggregate a window reads 'daily totals unavailable'.
  const serve = async (versions: string[]) => {
    const rows = { ...chartRows, [prefix + 'metering-summary.v1']: [all, ...versions.map((v, i) => meteringDay(i + 1, v))] };
    await serveCharts(page, rows);
    const legacy = prefix + 'cost.savings-overview.v1';
    await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
      Object.keys(rows).map(topic => topic === legacy
        ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
        : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
  };
  // Codex MSG b53ca31a: a versioned day beside an unversioned one is a mixed basis too, never the one version it does see.
  // Codex MSG 7b7cfb30: days with no version at all are Not recorded; a window with no day rows keeps the all row's (control).
  for (const [versions, expected] of [[['1.0.0', '2.0.0'], 'pricing mixed basis (several versions)'], [['', '2.0.0'], 'pricing mixed basis (several versions)'],
    [['', ''], 'pricing Not recorded'], [['2.0.0', '2.0.0'], 'pricing v2.0.0'], [[], 'pricing v2.0.0']] as const) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await serve([...versions]);
    await settle(page, '/overview');
    await page.getByRole('radio', { name: 'Last 7 days (UTC)', exact: true }).click();
    const caption = page.locator('[data-component="overview-savings"] .local-card-caption');
    await expect(caption).toContainText(expected);
    if (versions.length === 2 && versions[0] !== versions[1] || versions.join() === ',') await expect(caption).not.toContainText(/pricing v\d/);
  }
});
