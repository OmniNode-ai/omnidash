import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, recentDay, serveCharts } from './omn21166-chart-fixtures';

/**
 * OMN-22168: the chart and table defects a live review of every page found on 2026-11-04, each measured on the page as
 * a reader sees it. Every case fails on dev 27eeafb0 and passes with the fix.
 *   L1 Pass rate per day draws its line all the way to the last day (it stopped part-way: a stroke dash measured with
 *      pathLength under vector-effect: non-scaling-stroke);
 *   L2 a long model name stays inside its Usage table cell (white-space: nowrap beat the wrap rule);
 *   L3 the run charts fill the Analysis views tab (a 12-column span made 11 empty grid columns);
 *   L4 a chart tooltip takes the dark theme (the chart library's white box);
 *   L5 an idle Inspect run select is not drawn in the focus colour;
 *   L6 a per-run chart keeps its value labels apart (eight labels stacked into 90px).
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

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))));
}

async function openAnalysis(page: Page) {
  await page.goto('/runs');
  await page.getByText('More analysis', { exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Pass rate per day', exact: true })).toBeVisible();
}

async function useTheme(page: Page, theme: 'light' | 'dark') {
  const current = await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (current !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test('L1: Pass rate per day draws its line to the last day', async ({ page }, info) => {
  await openAnalysis(page);
  const plot = page.getByRole('figure', { name: 'Pass rate per day', exact: true }).locator('.ins-plot');
  await plot.scrollIntoViewIfNeeded();
  await settle(page);
  const geometry = await plot.evaluate(el => {
    const box = el.getBoundingClientRect();
    const dots = [...el.querySelectorAll('.ins-dot')].map(dot => {
      const r = dot.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });
    return { dots, stroke: getComputedStyle(el.querySelector('path')!).stroke, width: box.width, height: box.height };
  });
  expect(geometry.dots.length, 'one dot per day with a value').toBe(4);
  const shot = await plot.screenshot({ path: info.outputPath('pass-rate-line.png') });
  // Along the last segment, between its two dots (clear of each dot's ring), the line's own colour must be drawn.
  const [from, to] = geometry.dots.slice(-2);
  const samples = [0.3, 0.5, 0.7].map(t => ({ x: from!.x + (to!.x - from!.x) * t, y: from!.y + (to!.y - from!.y) * t }));
  const drawn = await page.evaluate(async ({ bytes, samples, stroke, width }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const scale = bitmap.width / width;
    const [r, g, b] = stroke.match(/\d+/g)!.map(Number);
    return samples.map(({ x, y }) => {
      for (let dy = -4; dy <= 4; dy += 1) {
        const [pr, pg, pb] = context.getImageData(Math.round(x * scale), Math.round((y + dy) * scale), 1, 1).data;
        if (Math.abs(pr! - r!) + Math.abs(pg! - g!) + Math.abs(pb! - b!) < 60) return true;
      }
      return false;
    });
  }, { bytes: [...shot], samples, stroke: geometry.stroke, width: geometry.width });
  expect(drawn, `the line is drawn at 30%, 50% and 70% of its last segment (stroke ${geometry.stroke})`).toEqual([true, true, true]);
});

test('L2: a long model name stays inside its Usage table cell', async ({ page }) => {
  await page.goto('/usage');
  const names = page.getByRole('table', { name: 'Usage by model', exact: true }).locator('tbody th[scope="row"]');
  await expect(names.filter({ hasText: LONG })).toHaveCount(1);
  const overflow = await names.evaluateAll(cells => cells.map(cell => ({ name: cell.textContent, extra: cell.scrollWidth - cell.clientWidth })));
  expect(overflow.filter(cell => cell.extra > 0), 'no name runs past its cell').toEqual([]);
});

test('L3: the run charts fill the Analysis views tab', async ({ page }) => {
  await openAnalysis(page);
  const widths = await page.locator('.local-runs-analysis .local-dashboard-tabpanel').first().evaluate(tab => ({
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
    const chart = page.getByRole('figure', { name, exact: true }).locator('.local-chart-canvas');
    await chart.scrollIntoViewIfNeeded();
    const labels = await chart.evaluate(el => {
      const box = el.getBoundingClientRect();
      // The value axis is the column of labels left of the plot.
      return [...el.querySelectorAll('svg text')].map(text => text.getBoundingClientRect())
        .filter(r => r.right - box.left < 70).map(r => r.top).sort((a, b) => a - b);
    });
    expect(labels.length, `${name}: value labels`).toBeGreaterThan(1);
    expect(labels.length, `${name}: at most five value labels`).toBeLessThanOrEqual(5);
    const gaps = labels.slice(1).map((top, i) => top - labels[i]!);
    expect(Math.min(...gaps), `${name}: labels at least 20px apart`).toBeGreaterThanOrEqual(20);
  }
});
