import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, recentDay, serveCharts } from './omn21166-chart-fixtures';
import { chooseChartTab } from './chart-tabs';

/**
 * OMN-22168: the chart and table defects a live review of every page found on 2026-11-04, each measured on the page as
 * a reader sees it. Every case fails on dev 27eeafb0 and passes with the fix. The pass-rate line that stopped short of its
 * last day (fixed in the same change) is not here: headless Chromium drew dev's line whole even at devicePixelRatio 2, so
 * no case could be shown to fail on it; src/styles/motion.omn21970.test.tsx M4 holds the draw mechanism instead.
 *   L2 a long model name stays inside its Usage table cell (white-space: nowrap beat the wrap rule);
 *   L3 the run charts fill the Analysis views tab (a 12-column span made 11 empty grid columns);
 *   L4 a chart tooltip takes the dark theme (the chart library's white box);
 *   L5 an idle Inspect run select is not drawn in the focus colour;
 *   L6 a per-run chart keeps its value labels apart (12.6px apart in the 128px Runs override; 24px at the kit's 210px).
 *   L7 Routing columns adds its three columns to the run list and keeps the others (position rules hid them and swapped
 *      Cost, Task type and Duration for six other columns).
 *   L8 the Runs filter glyphs and the two export buttons carry their own colours in both themes (Lakshman 2026-11-04 chose
 *      colour for these controls over the 10-27 one grey; the page's grey-icon rule had painted them all grey).
 *   L9 Overview's Model usage breaks a model name only at its joins (Lakshman 2026-11-04, "widen the model usage columns
 *      so names don't break"; the 64px columns broke thinkingmachines mid-word). The plot scrolls inside its panel.
 *   L10 every Recent runs column header has its own glyph and its own colour (Lakshman 2026-11-04, "all should be in
 *      different color and different icons"), each its concept's canonical glyph and colour, never the interface grey.
 *   L11 each sidebar page has its own colour, and the page title's icon is that page's glyph in that colour, drawn big
 *      (Lakshman 2026-11-04, "side bar each page should have own color and icons ... icons should be Big in actual page").
 *   L12 at 1440px every Runs header, model name and time stays on one line (Jonah 2026-11-06, "column wrapping when there is
 *      plenty of room between the other columns"; dev's 252px model column broke a long name over two lines, and dev wrote
 *      a day above its clock).
 */
const LONG = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const template = chartRows[prefix + 'delegation.decisions.v1'][0] as Record<string, unknown>;
// Four days, six runs each, a falling pass rate, so the line has three segments.
const runs = [3, 2, 1, 0].flatMap((ago, d) => Array.from({ length: 6 }, (_, r) => {
  const at = `${recentDay(ago)}T0${r}:1${d}:00Z`;
  return { ...template, correlation_id: `polish-${d}-${r}`, created_at: at, written_at: at,
    model_name: r % 2 ? LONG : 'model-a', quality_gate_passed: r < 5 - d, latency_ms: 4_000 + r * 5_000 + d * 1_000,
    tokens_input: 400 + r * 100, tokens_output: 90 + r * 10 };
}));
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: runs };

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(async ({ page }) => { await serveCharts(page, rows); });

async function openAnalysis(page: Page) {
  await page.goto('/runs');
  // OMN-22168: Run analysis is a row of tabs; Pass rate per day is chosen first.
  await chooseChartTab(page, 'Pass rate per day');
  await expect(page.getByRole('figure', { name: 'Pass rate per day', exact: true })).toBeVisible();
}

async function useTheme(page: Page, theme: 'light' | 'dark') {
  // The light theme is the page's default and may carry no data-theme attribute at all.
  const current = await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (current !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
  if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
}

test('L2: a long model name stays inside its Usage table cell', async ({ page }) => {
  await page.goto('/usage');
  const names = page.getByRole('table', { name: 'Usage by model', exact: true }).locator('tbody th[scope="row"]');
  await expect(names.filter({ hasText: LONG })).toHaveCount(1);
  const overflow = await names.evaluateAll(cells => cells.map(cell => ({ name: cell.textContent, extra: cell.scrollWidth - cell.clientWidth })));
  expect(overflow.filter(cell => cell.extra > 0), 'no name runs past its cell').toEqual([]);
});

// OMN-22168: the "Analysis views" frame is gone; the run charts are their own panel of tabs, and a chart fills its tab.
test('L3: a run chart fills its tab', async ({ page }) => {
  await openAnalysis(page);
  const widths = await page.locator('.local-run-charts-panel .local-dashboard-tabpanel').first().evaluate(tab => ({
    tab: tab.getBoundingClientRect().width,
    children: [...tab.children].filter(child => child.getBoundingClientRect().height > 0).map(child => child.getBoundingClientRect().width),
  }));
  expect(widths.children.length).toBeGreaterThan(0);
  for (const width of widths.children) expect(Math.abs(width - widths.tab), `a ${width}px child in a ${widths.tab}px tab`).toBeLessThanOrEqual(1);
});

test('L4: a chart tooltip takes the dark theme', async ({ page }) => {
  await openAnalysis(page);
  await useTheme(page, 'dark');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true }).locator('.local-chart-canvas');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tip = page.getByRole('figure', { name: 'Duration per run', exact: true }).locator('div').filter({ hasText: /^.*Duration: / }).last();
  await expect(tip).toBeVisible();
  const lightness = await tip.evaluate(el => {
    const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number);
    return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  });
  expect(lightness, 'the tooltip is a dark box in the dark theme').toBeLessThan(0.3);
});

test('L5: an idle Inspect run select is not drawn in the focus colour', async ({ page }) => {
  await openAnalysis(page);
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme);
    const select = page.getByRole('figure', { name: 'Duration per run', exact: true }).getByLabel('Inspect run', { exact: true });
    const colours = await select.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ds-hue-blue)';
      document.body.append(probe);
      const focus = getComputedStyle(probe).color;
      probe.remove();
      return { border: getComputedStyle(el).borderTopColor, focus };
    });
    expect(colours.border, `${theme}: the idle border`).not.toBe(colours.focus);
  }
});

test('L6: a per-run chart keeps its value labels apart', async ({ page }) => {
  await openAnalysis(page);
  for (const name of ['Duration per run', 'Tokens per run']) {
    // OMN-22168: the run charts are tabs; each is chosen in turn.
    await chooseChartTab(page, name);
    const chart = page.getByRole('figure', { name, exact: true }).locator('.local-chart-canvas');
    await chart.scrollIntoViewIfNeeded();
    const labels = await chart.evaluate(el => {
      const box = el.getBoundingClientRect();
      // The value axis is the column of labels left of the plot.
      return [...el.querySelectorAll('svg text')].map(text => text.getBoundingClientRect())
        .filter(r => r.right - box.left < 70).map(r => r.top).sort((a, b) => a - b);
    });
    expect(labels.length, `${name}: value labels`).toBeGreaterThan(1);
    const gaps = labels.slice(1).map((top, i) => top - labels[i]!);
    expect(Math.min(...gaps), `${name}: labels at least 20px apart`).toBeGreaterThanOrEqual(20);
  }
});

test('L7: Routing columns adds its three columns and keeps the rest', async ({ page }) => {
  await page.goto('/runs');
  const table = page.locator('.local-runs-wrap table').first();
  // Wait for the run list to draw before reading its header.
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const shown = () => table.locator('thead th').evaluateAll(cells => cells
    .filter(cell => getComputedStyle(cell).display !== 'none').map(cell => cell.textContent?.trim()));
  const plain = await shown();
  expect(plain).toEqual(expect.arrayContaining(['Model', 'Cost', 'Duration']));
  await page.getByLabel('Routing columns', { exact: true }).check();
  const routing = await shown();
  const added = ['Requested model', 'Finish reason', 'Escalations'];
  expect(routing.filter(name => !added.includes(name!)), 'the plain columns stay as they were').toEqual(plain);
  expect(routing, 'the routing columns show').toEqual(expect.arrayContaining(added));
  const firstRow = await table.locator('tbody tr').first().locator('td, th').evaluateAll(cells => cells
    .filter(cell => getComputedStyle(cell).display !== 'none').length);
  expect(firstRow, 'every shown header has its cell').toBe(routing.length);
});

test('L8: each Runs filter glyph and both export buttons keep their own colour', async ({ page }) => {
  await page.goto('/runs');
  await expect(page.locator('.local-runs-wrap tbody tr').first()).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme);
    const read = () => page.evaluate(() => {
      const color = (el: Element | null) => (el ? getComputedStyle(el).color : 'missing');
      return {
        // The interface grey token itself: since L11 the sidebar icons draw their page's colour, not this grey.
        grey: (() => { const probe = document.createElement('i'); probe.style.color = 'var(--ds-ink-3)'; document.body.append(probe);
          const value = getComputedStyle(probe).color; probe.remove(); return value; })(),
        filters: [...document.querySelectorAll('.local-dashboard-filters .ds-dropdown-trigger')]
          .map(button => color(button.querySelector('.ds-dropdown-mark svg'))),
        exports: [...document.querySelectorAll('.local-runs-export button[data-export]')]
          .map(button => ({ text: color(button), icon: color(button.querySelector('svg')) })),
      };
    });
    const seen = await read();
    expect(seen.filters, `${theme}: seven filter glyphs`).toHaveLength(7);
    expect(seen.filters.filter(paint => paint === seen.grey || paint === 'missing'), `${theme}: no filter glyph is the interface grey`).toEqual([]);
    expect(new Set(seen.filters).size, `${theme}: each filter its own colour`).toBe(7);
    expect(seen.exports, `${theme}: CSV and JSON`).toHaveLength(2);
    for (const { text, icon } of seen.exports) {
      expect(icon, `${theme}: an export glyph is not the interface grey`).not.toBe(seen.grey);
      expect(text, `${theme}: an export's word matches its glyph`).toBe(icon);
    }
    expect(seen.exports[0]!.icon, `${theme}: CSV and JSON differ`).not.toBe(seen.exports[1]!.icon);
  }
});

// L8b (Lakshman 2026-11-05, "make all pages uniform"): Delegation Evidence's CSV and JSON exports are the Runs exports,
// glyph and colour alike, in both themes. Fails if Evidence's exports go back to plain grey buttons, lose a glyph, or take
// any colour other than the one Runs draws for the same format.
test('L8b: Evidence exports draw the Runs exports, glyph and colour', async ({ page }) => {
  const read = (selector: string) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(button => ({
    format: button.getAttribute('data-export'), text: getComputedStyle(button).color,
    icon: button.querySelector('svg') ? getComputedStyle(button.querySelector('svg')!).color : 'missing',
    border: getComputedStyle(button).borderTopColor, height: Math.round(button.getBoundingClientRect().height) })), selector);
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/runs');
    await expect(page.locator('.local-runs-wrap tbody tr').first()).toBeVisible();
    await useTheme(page, theme);
    const runs = await read('.local-runs-export button[data-export]');
    await page.goto('/delegation-evidence');
    await expect(page.locator('.ev-decision-export-actions button').first()).toBeVisible();
    await useTheme(page, theme);
    const evidence = await read('.ev-decision-export-actions button[data-export]');
    expect(runs.map(b => b.format), `${theme}: Runs has CSV and JSON`).toEqual(['csv', 'json']);
    expect(evidence, `${theme}: Evidence's exports are the Runs exports`).toEqual(runs);
  }
});

// The served names of the live review, the longest one-word parts first.
const WORDY = ['thinkingmachines/inkling:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'poolside/laguna-xs-2.1:free',
  'apodex/apodex-1.1-mini:free', 'google/gemma-4-31b-it:free', 'gemini-3.5-flash-lite', 'Qwen3.8-27B'];
for (const width of [1440, 390] as const) {
  test(`L9: Model usage breaks a model name only at its joins at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const routingKey = prefix + 'delegation.model-routing.v1';
    const routing = { ...(chartRows[routingKey][0] as Record<string, unknown>), total_delegations: 70,
      by_model: WORDY.map((model_name, index) => ({ model_name, total_count: 16 - index * 2, pct_of_total: (16 - index * 2) / 70 })) };
    await serveCharts(page, { ...rows, [routingKey]: [routing] });
    await page.goto('/overview');
    await chooseChartTab(page, 'Model usage');
    const names = page.locator('[aria-label="Model usage"] .rb-name');
    await expect(names).toHaveCount(WORDY.length);
    // Each part between joins is its own text node; one drawn on two lines was broken inside a word.
    const broken = await names.evaluateAll(elements => elements.flatMap(name => [...name.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim())
      .flatMap(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
        return lines.size > 1 ? [`${name.textContent}: "${node.textContent}" on ${lines.size} lines`] : [];
      })));
    expect(broken).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'the page never scrolls sideways').toBeLessThanOrEqual(0);
  });
}

test('L10: each Recent runs column header has its own glyph and colour', async ({ page }) => {
  await page.goto('/runs');
  await expect(page.locator('.local-runs-wrap tbody tr').first()).toBeVisible();
  await page.getByLabel('Show all run fields', { exact: true }).check();
  await page.getByLabel('Routing columns', { exact: true }).check();
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme);
    const heads = await page.locator('.local-runs-wrap table').first().locator('thead th').evaluateAll(cells => {
      const probe = document.createElement('i'); probe.style.color = 'var(--ds-ink-3)'; document.body.append(probe);
      const grey = getComputedStyle(probe).color; probe.remove();
      return cells.filter(cell => getComputedStyle(cell).display !== 'none').map(cell => {
        const icons = [...cell.querySelectorAll('svg')];
        const glyph = icons[0] ? [...icons[0].classList].find(name => name.startsWith('lucide-') && name !== 'lucide-icon') ?? 'unnamed' : 'none';
        return { name: cell.textContent?.trim() ?? '', count: icons.length, glyph, color: icons[0] ? getComputedStyle(icons[0]).color : 'none', grey };
      });
    });
    expect(heads.length, `${theme}: every column shown`).toBe(19);
    expect(heads.filter(head => head.count !== 1).map(head => `${head.name}: ${head.count} glyphs`), `${theme}: one glyph each`).toEqual([]);
    expect(heads.filter(head => head.color === head.grey).map(head => head.name), `${theme}: no header glyph is the interface grey`).toEqual([]);
    const sharedGlyph = heads.filter(head => heads.some(other => other !== head && other.glyph === head.glyph));
    expect(sharedGlyph.map(head => `${head.name}: ${head.glyph}`), `${theme}: no two headers share a glyph`).toEqual([]);
    const sharedColour = heads.filter(head => heads.some(other => other !== head && other.color === head.color));
    expect(sharedColour.map(head => `${head.name}: ${head.color}`), `${theme}: no two headers share a colour`).toEqual([]);
  }
});

const DESTINATIONS = [['/overview', 'local-overview'], ['/runs', 'local-runs'], ['/workflow', 'local-workflow'],
  ['/usage', 'local-usage'], ['/settings', 'local-settings'], ['/delegation-evidence', 'delegation-evidence']] as const;
test('L11: each sidebar page has its own colour, and its title icon is big in that colour', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.locator('main h1')).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme);
    const seen: Record<string, { glyph: string; color: string }> = {};
    for (const [path, destination] of DESTINATIONS) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      const read = await page.evaluate(destination => {
        const glyph = (svg: Element | null) => (svg ? [...svg.classList].find(name => name.startsWith('lucide-') && name !== 'lucide-icon') ?? '' : 'none');
        const nav = document.querySelector(`.sidebar a[data-destination="${destination}"] svg`);
        const head = document.querySelector('main :is(.local-dashboard-page-icon, .ev-title-icon) svg');
        const h1 = document.querySelector('main h1');
        return {
          nav: { glyph: glyph(nav), color: nav ? getComputedStyle(nav).color : 'none' },
          head: { glyph: glyph(head), color: head ? getComputedStyle(head).color : 'none', size: head ? head.getBoundingClientRect().width : 0 },
          h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
        };
      }, destination);
      expect(read.head, `${theme} ${path}: the title icon is the sidebar's glyph and colour`).toMatchObject(read.nav);
      expect(read.head.size, `${theme} ${path}: the title icon is big (at least half the title's size)`).toBeGreaterThanOrEqual(read.h1 / 2);
      seen[destination] = read.nav;
    }
    const colours = Object.values(seen).map(item => item.color);
    expect(new Set(colours).size, `${theme}: six pages, six colours ${JSON.stringify(seen)}`).toBe(6);
    // The interface grey of each theme (OMN-21308 part 28a) is what the sidebar drew before.
    const grey = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--ds-ink-3)'; document.body.append(probe);
      const value = getComputedStyle(probe).color; probe.remove(); return value; });
    expect(colours.filter(colour => colour === grey), `${theme}: no page icon is the interface grey`).toEqual([]);
  }
});

test('L12: at 1440px every Runs header, model name and time stays on one line', async ({ page }) => {
  await page.goto('/runs');
  const table = page.locator('.local-runs-wrap table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  await expect(table.locator('tbody td[data-label="Model"]').filter({ hasText: LONG }).first()).toBeVisible();
  // A cell's text lines, counted from its text's line boxes: two boxes more than 8px apart vertically are two lines.
  const wrapped = await table.locator('thead th, tbody td[data-label="Model"], tbody td[data-label="Time"]').evaluateAll(cells => cells
    .filter(cell => getComputedStyle(cell).display !== 'none' && (cell.textContent ?? '').trim() !== '')
    .map(cell => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const tops = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(rect => rect.top).sort((a, b) => a - b);
      const lines = tops.reduce((count, top, i) => count + (i > 0 && top - tops[i - 1]! > 8 ? 1 : 0), tops.length ? 1 : 0);
      return { text: (cell.textContent ?? '').trim(), lines };
    })
    .filter(cell => cell.lines > 1));
  expect(wrapped, 'no header, model name or time wraps').toEqual([]);
});
