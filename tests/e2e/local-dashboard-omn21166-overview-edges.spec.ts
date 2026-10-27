import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 21 edge cases (Lakshman 2026-10-26: "check all edge cases"). Written by claude-920f62a6 after the onex
// delegate draft timed out (run d5cad0e0). Failure modes, each checked on every case below:
//   E1  the page scrolls sideways, or a chart panel or headline card cuts its content off;
//   E2  day labels, model names or bar values overlap or leave their column;
//   E3  at 1100px and wider the pairs leave their rows or a panel grows past 340px; under 1100px a chart stays half width;
//   E4  a chart prints NaN, undefined, null or Infinity, or draws a bar for a run or count that is not there;
//   E5  the limit line shows when every run is drawn, or is missing at 500 runs or for undated runs;
//   E6  the readout keeps a day after focus leaves the chart;
//   E7  part 24 AC144: a model name is cut, a model is left out, or a model bar turns horizontal;
//       only the Model usage row may pass 340px.
test.use({ reducedMotion: 'reduce', trace: 'on' });

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

function panels(page: Page) {
  return page.locator('.maple-cell--half > .local-dashboard-panel');
}

/** E1-E4 on whatever Overview shows now. */
async function invariants(page: Page, label: string, opts: { twoColumns: boolean; manyModels?: boolean }) {
  await expect(panels(page), `${label}: four chart panels`).toHaveCount(4);
  const report = await page.evaluate(() => {
    const overlaps = (boxes: DOMRect[]) => boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom && b.top < a.bottom));
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (el.textContent ?? '').trim() !== ''; };
    const chartPanels = [...document.querySelectorAll('.maple-cell--half > .local-dashboard-panel')] as HTMLElement[];
    const cards = [...document.querySelectorAll('.local-overview-summary > .local-dashboard-panel')] as HTMLElement[];
    return {
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cutOff: [...chartPanels, ...cards].map(el => ({ name: el.querySelector('h2')?.textContent?.trim() ?? '', extra: el.scrollWidth - el.clientWidth })).filter(x => x.extra > 0),
      boxes: chartPanels.map(el => { const r = el.getBoundingClientRect(); return { title: el.querySelector('h2')?.textContent?.trim() ?? '', top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; }),
      labelOverlap: chartPanels.filter(el => overlaps([...el.querySelectorAll('.gdb-day-label')].filter(visible).map(x => x.getBoundingClientRect()))).map(el => el.querySelector('h2')?.textContent),
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
  expect(report.sideways, `${label}: no sideways scroll`).toBeLessThanOrEqual(0);
  expect(report.cutOff, `${label}: nothing cut off`).toEqual([]);
  expect(report.labelOverlap, `${label}: day labels never overlap`).toEqual([]);
  expect(report.nameOverlap, `${label}: model and tier names never overlap`).toEqual([]);
  expect(report.valueOut, `${label}: names and values stay in their column`).toEqual([]);
  expect(report.badText, `${label}: no NaN/undefined/null/Infinity`).toEqual([]);
  expect(report.cutNames, `${label}: no model name is cut`).toEqual([]);
  const [a, b, c, d] = report.boxes;
  if (opts.twoColumns) {
    expect(a!.top === b!.top && c!.top === d!.top, `${label}: two charts per row`).toBe(true);
    // AC144: long upright model names may grow only the Model usage row (Model usage and Tier mix).
    for (const box of opts.manyModels ? [a!, b!] : report.boxes) expect(box.height, `${label}: ${box.title} at most 340px`).toBeLessThanOrEqual(340);
    expect(c!.height, `${label}: Model usage and Tier mix share a height`).toBe(d!.height);
  } else {
    expect(a!.top < b!.top && b!.top < c!.top && c!.top < d!.top, `${label}: one chart per row`).toBe(true);
    expect(new Set(report.boxes.map(box => box.width)).size, `${label}: full width`).toBe(1);
  }
  return report;
}

async function open(page: Page, rows: Record<string, unknown[]>, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await serveCharts(page, { ...chartRows, ...rows });
  await page.goto('/overview');
  await expect(panels(page)).toHaveCount(4);
}
const runsPanel = (page: Page) => panels(page).nth(0);
const tokensPanel = (page: Page) => panels(page).nth(1);
async function shot(page: Page, info: { outputPath: (name: string) => string }, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test('E1 no runs and no routing: empty states, no bars, no line', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: [], [routingTopic]: routing([], []) });
  await expect(page.locator('.maple-cell--half .gdb-bar')).toHaveCount(0);
  await expect(page.locator('.maple-cell--half .rb-bar')).toHaveCount(0);
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

test('E5 499 runs draw every run with no line; 500 runs say the read limit', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(499) });
  await expect(runsPanel(page).getByTestId('insights-total')).toHaveCount(0);
  await invariants(page, '499 runs', { twoColumns: true });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await open(page, { [decisionsTopic]: runs(500) });
  await expect(runsPanel(page).getByTestId('insights-total')).toHaveText('Showing the latest 500 runs');
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
  await expect(tokensPanel(page).locator('.gdb-bar')).toHaveCount(0);
  await expect(tokensPanel(page).locator('.gdb-day').first()).toHaveAccessibleName(/not recorded in, not recorded out/);
  await invariants(page, 'tokens not recorded', { twoColumns: true });
  await shot(page, info, 'e4-tokens-not-recorded');
});

test('E2 twelve models with long names fit the half-width Model usage chart', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(300), [routingTopic]: routing(twelveModels, [{ cost_tier_name: 'local', count: 3000, tier_routed: true, pct_of_tier_routed: 0.75 },
    { cost_tier_name: 'cheap_cloud', count: 900, tier_routed: true, pct_of_tier_routed: 0.225 }, { cost_tier_name: 'frontier', count: 100, tier_routed: true, pct_of_tier_routed: 0.025 }]) });
  await expect(panels(page).nth(2).locator('.local-model-usage--upright .rb-chart--vertical [data-ranked-item]')).toHaveCount(12);
  for (const name of LONG_MODELS) await expect(panels(page).nth(2).locator('.rb-name', { hasText: name })).toHaveCount(1);
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
  await expect(panels(page).nth(3).locator('.rb-bar[data-pattern="hatched"]')).toHaveCount(0);
  await invariants(page, 'not tier-routed only', { twoColumns: true });
  await shot(page, info, 'e4-not-tier-routed');
});

test('E3 every window keeps the layout and draws only its days', async ({ page }, info) => {
  await open(page, { [decisionsTopic]: runs(300) });
  const windows = page.getByRole('radiogroup', { name: 'Figures for', exact: true });
  for (const [name, days] of [['Today (UTC)', 1], ['Last 7 days (UTC)', 7], ['Last 15 days (UTC)', 15], ['Last 30 days (UTC)', 30], ['All time', 30]] as const) {
    await windows.getByRole('radio', { name, exact: true }).click();
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
  await expect(panels(page)).toHaveCount(4);
  await expect(page.locator('.maple-cell--half .gdb-bar, .maple-cell--half .rb-bar')).toHaveCount(0);
  await invariants(page, 'refused', { twoColumns: true });
  await shot(page, info, 'e1-refused');
});

for (const [width, height, two] of [[1920, 1080, true], [1100, 900, true], [1099, 900, false], [768, 1024, false], [320, 640, false]] as const) {
  test(`E3 ${width}px wide: ${two ? 'two charts per row' : 'one chart per row'}, nothing cut off`, async ({ page }, info) => {
    await open(page, { [decisionsTopic]: runs(300), [routingTopic]: routing(twelveModels, [{ cost_tier_name: 'local', count: 3000, tier_routed: true, pct_of_tier_routed: 0.75 },
      { cost_tier_name: 'cheap_cloud', count: 1000, tier_routed: true, pct_of_tier_routed: 0.25 }]) }, width, height);
    await invariants(page, `${width}px`, { twoColumns: two, manyModels: true });
    await shot(page, info, `e3-width-${width}`);
  });
}

for (const width of [1440, 320] as const) {
  test(`E2 six long model names stay upright and fit at ${width}px`, async ({ page }, info) => {
    await open(page, { [decisionsTopic]: runs(60), [routingTopic]: routing(twelveModels.slice(0, 6), []) }, width, width === 320 ? 640 : 900);
    await expect(panels(page).nth(2).locator('.local-model-usage--upright [data-ranked-item]')).toHaveCount(6);
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
  await page.getByRole('radiogroup', { name: 'Figures for', exact: true }).getByRole('radio', { name: 'Last 7 days (UTC)', exact: true }).click();
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
  await expect(readout).toHaveText('');
  await expect(runsPanel(page).locator('.gdb-day[data-dim="true"]')).toHaveCount(0);
});

test('controls: the checks catch overlapping labels, a cut-off panel and NaN', async ({ page }) => {
  await open(page, { [decisionsTopic]: runs(300) });
  await page.addStyleTag({ content: '.local-dashboard-page--overview .gdb-day-label { left: -40px !important; right: auto !important; transform: none !important; }' });
  await page.evaluate(() => {
    const panel = document.querySelector('.maple-cell--half > .local-dashboard-panel')!;
    const wide = document.createElement('div'); wide.style.width = '4000px'; wide.textContent = 'NaN'; panel.append(wide);
  });
  let failures: string[] = [];
  try { await invariants(page, 'control', { twoColumns: true }); } catch (error) { failures = [String(error)]; }
  expect(failures.join(' '), 'the invariants fail on planted defects').toMatch(/nothing cut off|day labels never overlap|NaN/);
  writeFileSync(test.info().outputPath('control.txt'), failures.join('\n'));
});
