import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts, keepRealClock } from './omn21166-chart-fixtures';
// OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the window radios sit in one dropdown; chooseWindow opens it and proves it closed.
import { chooseWindow } from './overview-window-menu';
// This spec dates its rows from the real clock, so the browser keeps it (see FIXTURE_NOW).
test.beforeEach(({ page }) => keepRealClock(page));

// OMN-21166 part 21 edge cases (Lakshman 2026-10-26: "check all edge cases"). Written by claude-920f62a6 after the onex
// delegate draft timed out (run d5cad0e0). Failure modes, each checked on every case below:
//   E1  the page scrolls sideways, or a chart panel or headline card cuts its content off;
//   E2  day labels, model names or bar values overlap or leave their column;
//   E3  OMN-22168 (Lakshman 2026-11-04, "these 4 into one ... with tab and full size"): the four charts are one row of
//       tabs; a chart does not take the panel's full width, or a tab is missing (was: two per row, 340px at most);
//   E4  a chart prints NaN, undefined, null or Infinity, or draws a bar for a run or count that is not there;
//   E5  the limit line shows when every run is drawn, or is missing at 500 runs or for undated runs;
//   E6  the readout keeps a day after focus leaves the chart;
//   E7  part 24 AC144: a model name is cut, a model is left out, or a model bar turns horizontal.
// Every check runs on each of the four tabs in turn.
test.use({ reducedMotion: 'reduce', trace: 'on' });
// OMN-21970 AC9/AC10 (Lakshman 2026-11-02): cards and panels now rise in and figures count up unless reduced motion is
// asked for. On the lab (Playwright 1.59.1, Chromium 147) test.use({ reducedMotion }) reached the page as false while
// page.emulateMedia did not, so the measurements below would read panels mid-animation; ask for it on the page too.
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

const DAY = 86_400_000;
const decisionsTopic = prefix + 'delegation.decisions.v1';
const routingTopic = prefix + 'delegation.model-routing.v1';
const base = chartRows[decisionsTopic][0] as Record<string, unknown>;

function runs(count: number, over: (index: number) => Record<string, unknown> = () => ({}), days = 30) {
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.now() - (index % days) * DAY - 60_000).toISOString();
    return { ...base, correlation_id: `edge-${index}`, created_at: at, written_at: at, quality_gate_passed: index % 4 !== 0, ...over(index) };
  });
}
const LONG_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'qwen/qwen3.8-coder-480b-a35b-instruct', 'gemini-3.5-flash-lite',
  'claude-sonnet-5-5', 'gpt-oss-120b', 'deepseek/deepseek-v4-0324', 'meta-llama/llama-5-405b-instruct', 'mistral/devstral-2-24b',
  'qwen3.8-27b-local', 'z-ai/glm-5.1-air', 'moonshotai/kimi-k3', 'openrouter/auto'];
const routing = (byModel: unknown[], tiers: unknown[], notTier = 0) => [{ total_delegations: 4000, by_model: byModel,
  by_tier: { total_tasks: 4000, tier_routed_total: 4000 - notTier, not_tier_routed_count: notTier, tiers } }];
const twelveModels = LONG_MODELS.map((name, index) => ({ model_name: name, total_count: [4000, 1200, 800, 333, 120, 60, 25, 9, 4, 3, 2, 1][index], pct_of_total: 0.08 }));

const TABS = ['runs', 'tokens', 'models', 'tiers'] as const;
type ChartTab = typeof TABS[number];
const chartsPanel = (page: Page) => page.locator('.local-overview-charts-panel');
const tabPanel = (page: Page) => chartsPanel(page).locator('.local-dashboard-tabpanel');
/** Chooses one chart's tab (only the chosen chart is drawn) and returns the panel that draws it. */
async function showTab(page: Page, id: ChartTab) {
  const tab = chartsPanel(page).locator(`[role="tab"][data-tab="${id}"]`);
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return tabPanel(page);
}

/** E1-E4 and E7 on every chart tab Overview shows now, the chosen tab first; the chosen tab is chosen again after. */
async function invariants(page: Page, label: string, opts: { twoColumns?: boolean; manyModels?: boolean } = {}) {
  // The layout options of the two-per-row grid no longer change what is checked: every tab is one full-width chart.
  void opts;
  await expect(chartsPanel(page).getByRole('tab'), `${label}: four chart tabs`).toHaveCount(4);
  const chosen = (await chartsPanel(page).locator('[role="tab"][aria-selected="true"]').getAttribute('data-tab')) as ChartTab;
  const reports = [];
  for (const id of [chosen, ...TABS.filter(tab => tab !== chosen)]) {
    await showTab(page, id);
    const at = `${label} (${id})`;
    const report = await page.evaluate(() => {
      const overlaps = (boxes: DOMRect[]) => boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom && b.top < a.bottom));
      const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (el.textContent ?? '').trim() !== ''; };
      const frame = document.querySelector('.local-overview-charts-panel') as HTMLElement;
      const chartPanels = [...document.querySelectorAll('.local-overview-charts-panel .local-dashboard-tabpanel')] as HTMLElement[];
      const cards = [...document.querySelectorAll('.local-overview-summary > .local-dashboard-panel')] as HTMLElement[];
      const style = getComputedStyle(frame);
      const inner = frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return {
        drawn: chartPanels.length,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cutOff: [...chartPanels, ...cards].map(el => ({ name: el.querySelector('h2')?.textContent?.trim() ?? '', extra: el.scrollWidth - el.clientWidth })).filter(x => x.extra > 0),
        notFull: chartPanels.filter(el => el.getBoundingClientRect().width < inner - 2).map(el => Math.round(el.getBoundingClientRect().width) + ' of ' + Math.round(inner)),
        labelOverlap: chartPanels.filter(el => overlaps([...el.querySelectorAll('.ds-day-axis-label, .gdb-name-label')].filter(visible).map(x => x.getBoundingClientRect()))).map(el => el.querySelector('h2')?.textContent),
        nameOverlap: chartPanels.filter(el => overlaps([...el.querySelectorAll('.rb-name')].filter(visible).map(x => x.getBoundingClientRect()))).map(el => el.querySelector('h2')?.textContent),
        valueOut: chartPanels.flatMap(el => [...el.querySelectorAll('[data-ranked-item]')].flatMap(item => {
          const box = item.getBoundingClientRect();
          return [...item.querySelectorAll('.rb-value, .rb-name')].filter(visible).filter(v => { const r = v.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; })
            .map(v => (v.textContent ?? '').trim());
        })),
        badText: chartPanels.flatMap(el => (el.innerText.match(/\b(NaN|undefined|null|Infinity)\b/g) ?? [])),
        cutNames: [...document.querySelectorAll<HTMLElement>('.local-model-usage .rb-name')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
          || getComputedStyle(el).textOverflow === 'ellipsis' || getComputedStyle(el).webkitLineClamp !== 'none').map(el => el.textContent),
      };
    });
    expect(report.drawn, `${at}: one chart drawn at a time`).toBe(1);
    expect(report.sideways, `${at}: no sideways scroll`).toBeLessThanOrEqual(0);
    expect(report.cutOff, `${at}: nothing cut off`).toEqual([]);
    expect(report.notFull, `${at}: the chart takes the panel's full width`).toEqual([]);
    expect(report.labelOverlap, `${at}: day labels never overlap`).toEqual([]);
    expect(report.nameOverlap, `${at}: model and tier names never overlap`).toEqual([]);
    expect(report.valueOut, `${at}: names and values stay in their column`).toEqual([]);
    expect(report.badText, `${at}: no NaN/undefined/null/Infinity`).toEqual([]);
    expect(report.cutNames, `${at}: no model name is cut`).toEqual([]);
    reports.push(report);
  }
  await showTab(page, chosen);
  return reports[0]!;
}

async function open(page: Page, rows: Record<string, unknown[]>, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await serveCharts(page, { ...chartRows, ...rows });
  await page.goto('/overview');
  await expect(chartsPanel(page).getByRole('tab')).toHaveCount(4);
}
// Runs per day is the tab Overview opens on; the other charts are chosen first.
const runsPanel = (page: Page) => tabPanel(page);
const tokensPanel = (page: Page) => showTab(page, 'tokens');
async function shot(page: Page, info: { outputPath: (name: string) => string }, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test('E1 no runs and no routing: empty states, no bars, no line', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: [], [routingTopic]: routing([], []) });
  for (const id of TABS) await expect((await showTab(page, id)).locator('.gdb-bar, .rb-bar'), id).toHaveCount(0);
  await showTab(page, 'runs');
  await expect(page.getByTestId('insights-total')).toHaveCount(0);
  await invariants(page, 'no runs', { twoColumns: true });
  await shot(page, info, 'e1-no-runs');
});

test('E2 exactly one run on one day', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(1) });
  // The day axis keeps at least seven days; exactly one of them holds the run, and only it draws a bar.
  await expect(runsPanel(page).locator('.gdb-day', { has: page.locator('.gdb-bar') })).toHaveCount(1);
  await expect(runsPanel(page).locator('.gdb-day', { has: page.locator('.gdb-bar') })).toHaveAccessibleName(/: 1 run\b/);
  await invariants(page, 'one run', { twoColumns: true });
  await shot(page, info, 'e2-one-run');
});

test('E5 499 or 500 runs draw with no read-limit line, even when the walk could not finish', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(499) });
  await expect(runsPanel(page).getByTestId('insights-total')).toHaveCount(0);
  await invariants(page, '499 runs', { twoColumns: true });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // OMN-21970 AC3 (committed 801bf845) replaced "Showing the latest 500 runs": the page walks every page of runs, and
  // only a walk that could not finish says so. Here every page is truncated and its next_cursor never moves, so the walk
  // stops at the 500 runs it read.
  // The daily totals topic (OMN-21970 AC2) is declared, empty, as a current runtime serves it, so the panel carries only
  // this case's own line and not also the "Not available yet: daily run totals" notice of an older runtime.
  await open(page, { [decisionsTopic]: runs(500), [prefix + 'delegation.daily.v1']: [] });
  await expect(runsPanel(page).getByTestId('insights-total'), 'a complete read of 500 runs has no limit line').toHaveCount(0);
  const stuck = runs(500);
  await page.route(url => decodeURIComponent(url.pathname).endsWith(`/${decisionsTopic}`), route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ rows: stuck, row_count: stuck.length, data_freshness: 'stale', truncated: true, next_cursor: 'e5-cursor-that-never-moves' }) }));
  await page.reload();
  // OMN-22168 (Lakshman 2026-11-04, "remove the 500 runs line from Runs per day"): a read that stops at 500 runs draws
  // them with no read-limit line.
  await expect(runsPanel(page).locator('.gdb-day').first()).toBeVisible();
  await expect(runsPanel(page).getByText(/runs read; the rest could not be read/)).toHaveCount(0);
  await invariants(page, '500 runs', { twoColumns: true });
  await shot(page, info, 'e5-500-runs');
});

test('E5 every run undated: the line counts them and no day bar is drawn', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(3, () => ({ created_at: null, written_at: null })) });
  await expect(runsPanel(page).getByTestId('insights-total')).toHaveText('3 runs have no date and are not drawn');
  await expect(runsPanel(page).locator('.gdb-bar')).toHaveCount(0);
  await invariants(page, 'all undated', { twoColumns: true });
  await shot(page, info, 'e5-undated');
});

for (const outcome of [false, true]) {
  test(`E4 only ${outcome ? 'passed' : 'failed'} runs draw one series and never a bar for the other`, async ({ page }, info) => {
    await open(page, { [decisionsTopic]: runs(40, () => ({ quality_gate_passed: outcome })) });
    const days = runsPanel(page).locator('.gdb-day');
    await expect(days.first()).toHaveAccessibleName(outcome ? /: \d+ runs?\b.*\b0 failed/ : /: \d+ runs?\b.*\b0 passed/);
    await invariants(page, `only ${outcome ? 'passed' : 'failed'}`, { twoColumns: true });
    await shot(page, info, `e4-only-${outcome ? 'passed' : 'failed'}`);
  });
}

test('E2 huge token counts stay inside their chart', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(60, () => ({ tokens_input: 9_876_543_210, tokens_output: 1_234_567_890 })) });
  await invariants(page, 'huge tokens', { twoColumns: true });
  await shot(page, info, 'e2-huge-tokens');
});

test('E4 every token count not recorded: no token bar, and the day says not recorded', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(20, () => ({ tokens_input: null, tokens_output: null })) });
  await expect((await tokensPanel(page)).locator('.gdb-bar')).toHaveCount(0);
  await expect((await tokensPanel(page)).locator('.gdb-day').first()).toHaveAccessibleName(/not recorded in, not recorded out/);
  await invariants(page, 'tokens not recorded', { twoColumns: true });
  await shot(page, info, 'e4-tokens-not-recorded');
});

test('E2 twelve models with long names fit the Model usage chart', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(300), [routingTopic]: routing(twelveModels, [{ cost_tier_name: 'local', count: 3000, tier_routed: true, pct_of_tier_routed: 0.75 },
    { cost_tier_name: 'cheap_cloud', count: 900, tier_routed: true, pct_of_tier_routed: 0.225 }, { cost_tier_name: 'frontier', count: 100, tier_routed: true, pct_of_tier_routed: 0.025 }]) });
  await expect((await showTab(page, 'models')).locator('.local-model-usage--upright .rb-chart--vertical [data-ranked-item]')).toHaveCount(12);
  for (const name of LONG_MODELS) await expect(tabPanel(page).locator('.rb-name', { hasText: name })).toHaveCount(1);
  await invariants(page, 'twelve models', { twoColumns: true, manyModels: true });
  await shot(page, info, 'e2-twelve-models');
  // Control: names clamped to one line must be caught as cut.
  await page.addStyleTag({ content: '.local-model-usage .rb-name { display: -webkit-box !important; -webkit-line-clamp: 1 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; width: 60px !important; }' });
  let caught = '';
  try { await invariants(page, 'clamped control', { twoColumns: true, manyModels: true }); } catch (error) { caught = String(error); }
  expect(caught, 'control: a clamped name is caught').toContain('no model name is cut');
});

test('E4 only not-tier-routed runs: Tier mix gives no share', async ({ page }, info) => {
  await open(page, { [routingTopic]: routing([{ model_name: 'model-a', total_count: 10, pct_of_total: 1 }], [{ cost_tier_name: 'not_tier_routed', count: 10, tier_routed: false, pct_of_tier_routed: null }], 10) });
  await expect((await showTab(page, 'tiers')).locator('.rb-bar[data-pattern="hatched"]')).toHaveCount(0);
  await invariants(page, 'not tier-routed only', { twoColumns: true });
  await shot(page, info, 'e4-not-tier-routed');
});

test('E3 every window keeps the layout and draws only its days', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(300) });
  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the windows are in one dropdown, and Last 90 days joined them.
  for (const [name, days] of [['Today (UTC)', 1], ['Last 7 days (UTC)', 7], ['Last 15 days (UTC)', 15], ['Last 30 days (UTC)', 30], ['Last 90 days (UTC)', 90], ['All time', 30]] as const) {
    await chooseWindow(page, name);
    await expect(runsPanel(page).locator('.gdb-day'), name).toHaveCount(days);
    await invariants(page, name, { twoColumns: true });
  }
  await shot(page, info, 'e3-windows');
});

test('E1 every read refused: messages in the panels, layout intact', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveCharts(page);
  await page.route('**/projection/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'tenant_conflict' }) }));
  await page.goto('/overview');
  await expect(chartsPanel(page).getByRole('tab')).toHaveCount(4);
  for (const id of TABS) await expect((await showTab(page, id)).locator('.gdb-bar, .rb-bar'), id).toHaveCount(0);
  await showTab(page, 'runs');
  await invariants(page, 'refused', { twoColumns: true });
  await shot(page, info, 'e1-refused');
});

for (const [width, height, two] of [[1920, 1080, true], [1100, 900, true], [1099, 900, false], [768, 1024, false], [320, 640, false]] as const) {
  test(`E3 ${width}px wide: each chart tab full width, nothing cut off`, async ({ page }, info) => {
    await open(page, { [decisionsTopic]: runs(300), [routingTopic]: routing(twelveModels, [{ cost_tier_name: 'local', count: 3000, tier_routed: true, pct_of_tier_routed: 0.75 },
      { cost_tier_name: 'cheap_cloud', count: 1000, tier_routed: true, pct_of_tier_routed: 0.25 }]) }, width, height);
    await invariants(page, `${width}px`, { twoColumns: two, manyModels: true });
    await shot(page, info, `e3-width-${width}`);
  });
}

for (const width of [1440, 320] as const) {
  test(`E2 six long model names stay upright and fit at ${width}px`, async ({ page }, info) => {
    await open(page, { [decisionsTopic]: runs(60), [routingTopic]: routing(twelveModels.slice(0, 6), []) }, width, width === 320 ? 640 : 900);
    await expect((await showTab(page, 'models')).locator('.local-model-usage--upright [data-ranked-item]')).toHaveCount(6);
    // Part 22 AC144 as amended (Lakshman 2026-10-26, "Grow whenever names need it"): these long names wrap to several
    // lines under upright bars, so the Model usage row may grow; names stay whole and Runs/Tokens keep 340px.
    await invariants(page, `six models ${width}px`, { twoColumns: width >= 1100, manyModels: true });
    await shot(page, info, `e2-six-models-${width}`);
  });
}

test('E2 dark theme with twelve long model names', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('omnidash.theme.v1', 'dark'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, { [decisionsTopic]: runs(300), [routingTopic]: routing(twelveModels, []) });
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await invariants(page, 'dark', { twoColumns: true, manyModels: true });
  await shot(page, info, 'e2-dark');
});

test('E6 keyboard: focus walks the days, the readout follows, and clears when focus leaves', async ({ page }) => {
  await open(page, { [decisionsTopic]: runs(70, () => ({}), 7) });
  await chooseWindow(page, 'Last 7 days (UTC)');
  const days = runsPanel(page).locator('.gdb-day');
  await expect(days).toHaveCount(7);
  const readout = page.getByTestId('runs-per-day-readout');
  await days.first().focus();
  const firstName = (await days.first().getAttribute('aria-label'))!.split(':')[0]!;
  await expect(readout).toContainText(firstName);
  await page.keyboard.press('Tab');
  const secondName = (await days.nth(1).getAttribute('aria-label'))!.split(':')[0]!;
  await expect(days.nth(1)).toBeFocused();
  await expect(readout).toContainText(secondName);
  await days.last().focus();
  await page.keyboard.press('Tab');
  await expect(days.last()).not.toBeFocused();
  // OMN-23330 AC8: leaving the chart brings back the newest served day, never a blank readout.
  await expect(readout).toHaveText(/ · \d+ runs?/);
  await expect(runsPanel(page).locator('.gdb-day[data-dim="true"]')).toHaveCount(0);
});

test('controls: the checks catch overlapping labels, a cut-off panel and NaN', async ({ page }) => {
  await open(page, { [decisionsTopic]: runs(300) });
  await page.addStyleTag({ content: '.local-dashboard-page--overview .ds-day-axis-label { left: -40px !important; right: auto !important; transform: none !important; }' });
  await page.evaluate(() => {
    const panel = document.querySelector('.local-overview-charts-panel .local-dashboard-tabpanel')!;
    const wide = document.createElement('div'); wide.style.width = '4000px'; wide.textContent = 'NaN'; panel.append(wide);
  });
  let failures: string[] = [];
  try { await invariants(page, 'control', { twoColumns: true }); } catch (error) { failures = [String(error)]; }
  expect(failures.join(' '), 'the invariants fail on planted defects').toMatch(/nothing cut off|day labels never overlap|NaN/);
  writeFileSync(test.info().outputPath('control.txt'), failures.join('\n'));
});
