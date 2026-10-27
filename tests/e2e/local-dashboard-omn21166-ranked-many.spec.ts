import { expect, test, type Locator, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 AC213 (spec part 31c, Lakshman 2026-10-28): an upright ranked bar chart turns sideways when it has more than
// 10 items, so every model name and value stays readable. Failure modes declared before code: unserved (Not measured)
// items counted differently from the bars drawn; a long provider/model name still clipped when sideways; a chart of 10
// or fewer items turning sideways; the value overlapping the name on a phone.
test.use({ reducedMotion: 'reduce' });

const longName = (i: number) => [
  `nvidia/nemotron-super-49b-v1.5-instruct-${i}`, `qwen/qwen3.8-coder-480b-a35b-instruct-${i}`, `glm-4.6-air-${i}`,
][i % 3]!;

/** The all-time metering row Usage's "Savings by model" reads, with one by_model entry per name; the last is unserved. */
function serveModels(page: Page, count: number) {
  const models = Array.from({ length: count }, (_, i) => longName(i));
  const allTime = {
    tenant_id: 'chart-fixture-tenant', window_kind: 'all', window_start: null, as_of: '2026-10-27T18:00:00Z',
    baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved', savings_usd: '12.5', runs_total: 10 * count,
    summary_json: { by_model: models.map((model, i) => ({
      model, savings_usd: i === count - 1 ? null : ((count - i) * 0.37).toFixed(4), runs: 10, runs_measured: i === count - 1 ? 0 : 10,
    })) },
  };
  return serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [...chartRows[prefix + 'metering-summary.v1']!, allTime] });
}

// Usage's first render on a loaded lab dev server can pass the 5 s default, as delegation-live-refresh.spec.ts allows for.
const chart = (page: Page) => page.getByRole('figure', { name: 'Savings by model', exact: true });

/** No name or value is cut off, wrapped into fragments or hidden behind its neighbour. */
async function expectReadable(items: Locator) {
  const n = await items.count();
  for (let i = 0; i < n; i += 1) {
    const item = items.nth(i);
    for (const part of ['.rb-name', '.rb-value']) {
      const el = item.locator(part);
      await expect(el).toBeVisible();
      const box = await el.evaluate(node => ({ sw: node.scrollWidth, cw: node.clientWidth, sh: node.scrollHeight, ch: node.clientHeight }));
      expect(box.sw, `${part} of item ${i} is clipped sideways`).toBeLessThanOrEqual(box.cw + 1);
      expect(box.sh, `${part} of item ${i} is clipped downwards`).toBeLessThanOrEqual(box.ch + 1);
    }
    const name = await item.locator('.rb-name').boundingBox(), value = await item.locator('.rb-value').boundingBox();
    // On one row the value sits to the right of the name, never over it.
    expect(value!.x, `value of item ${i} overlaps its name`).toBeGreaterThanOrEqual(name!.x + name!.width - 1);
    // A readable name is at least a word wide, not the one or two letters an over-split column leaves.
    expect(name!.width, `name of item ${i} is squeezed`).toBeGreaterThan(80);
  }
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`AC213 39 models turn sideways and every name and value reads at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serveModels(page, 39);
    await page.goto('/usage');
    await expect(chart(page)).toBeVisible({ timeout: 15_000 });
    const items = chart(page).locator('.rb-plot > li');
    await expect(items).toHaveCount(39);
    // Sideways: each row's name is beside its bar, not under it.
    const first = items.first();
    const name = await first.locator('.rb-name').boundingBox(), track = await first.locator('.rb-track').boundingBox(), bar = await first.locator('.rb-bar').boundingBox();
    expect(name!.y).toBeLessThan(track!.y + track!.height);
    expect(bar!.width).toBeGreaterThan(bar!.height);
    await expectReadable(items);
    // Order, unserved last, and the unserved item still drawn as an outline.
    await expect(items.last()).toHaveAttribute('data-basis', 'unknown');
    await expect(items.first().locator('.rb-name')).toHaveText(longName(0));
  });
}

test('AC213 11 items, one of them unserved, count as 11 and turn sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveModels(page, 11);
  await page.goto('/usage');
  await expect(chart(page)).toBeVisible({ timeout: 15_000 });
  const items = chart(page).locator('.rb-plot > li');
  await expect(items).toHaveCount(11);
  const bar = await items.first().locator('.rb-bar').boundingBox();
  expect(bar!.width).toBeGreaterThan(bar!.height);
});

test('AC213 control: 7 models stay upright', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveModels(page, 7);
  await page.goto('/usage');
  await expect(chart(page)).toBeVisible({ timeout: 15_000 });
  const items = chart(page).locator('.rb-plot > li');
  await expect(items).toHaveCount(7);
  const first = items.first();
  const name = await first.locator('.rb-name').boundingBox(), track = await first.locator('.rb-track').boundingBox(), bar = await first.locator('.rb-bar').boundingBox();
  // Upright: the largest bar stands taller than it is wide and the name sits under it.
  expect(bar!.height).toBeGreaterThan(bar!.width);
  expect(name!.y).toBeGreaterThanOrEqual(track!.y + track!.height - 1);
});
