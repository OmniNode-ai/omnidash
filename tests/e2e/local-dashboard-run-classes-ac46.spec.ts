import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-21166 part 9 AC46: the run breakdown under Measured runs shows measured, estimated and unknown as separate
// labelled counts, each in its own colour from the shared field identity (OMN-21308), in both themes. Unknown means no
// measurement, so it reads in the not-measured tone and never in the failed tone; the label carries the meaning, not
// the colour. Visibility is unchanged: the line appears only when an estimated or unknown run is served, a zero
// estimated or unknown class is left out, and a measured 0 is a value.
const MISSING = { timeout: 3000 };

const OVERVIEW = prefix + 'cost.savings-overview.v1';

function overviewRow(counts: Record<string, unknown>) {
  return [{ window: 'all', captured_at: new Date().toISOString(), total_cost_usd: 0.25, total_baseline_cost_usd: 1,
    total_savings_usd: 0.75, tokens_total: 120, run_count: 14, ...counts }];
}

async function classes(page: Page, counts: Record<string, unknown>) {
  await serveCharts(page, { ...chartRows, [OVERVIEW]: overviewRow(counts) });
  await page.goto('/');
  const card = page.locator('[data-component="overview-measured"]');
  await expect(card.locator('.local-dashboard-metric')).toBeVisible();
  return { card, spans: card.locator('[data-run-class]') };
}

/** Each class span's label and computed colour, plus the failed tone's colour under the same theme. */
async function paint(page: Page) {
  return page.evaluate(() => {
    const spans = [...document.querySelectorAll<HTMLElement>('[data-component="overview-measured"] [data-run-class]')];
    const fail = getComputedStyle(document.documentElement).getPropertyValue('--field-fail').trim();
    const probe = document.createElement('span');
    probe.style.color = fail;
    document.body.append(probe);
    const failColour = getComputedStyle(probe).color;
    probe.remove();
    return { failColour, spans: spans.map(s => ({ run: s.dataset.runClass, text: s.textContent, colour: getComputedStyle(s).color })) };
  });
}

test('AC46 all three classes served: three labelled spans, three colours, unknown never in the failed tone, both themes', async ({ page }) => {
  const { card, spans } = await classes(page, { measured_run_count: 9, estimated_run_count: 2, unknown_run_count: 3 });
  await expect(spans).toHaveCount(3, MISSING);
  await expect(card).toContainText('9 measured · 2 estimated · 3 unknown');
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') ?? 'light') !== theme) {
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    }
    const { failColour, spans: drawn } = await paint(page);
    expect(drawn.map(s => [s.run, s.text])).toEqual([['measured', '9 measured'], ['estimated', '2 estimated'], ['unknown', '3 unknown']]);
    expect(new Set(drawn.map(s => s.colour)).size, `${theme}: one colour per class`).toBe(3);
    expect(drawn.find(s => s.run === 'unknown')?.colour, `${theme}: unknown is not a failure`).not.toBe(failColour);
  }
});

test('AC46 estimated absent: measured and unknown only', async ({ page }) => {
  const { spans } = await classes(page, { measured_run_count: 9, unknown_run_count: 3 });
  await expect(spans).toHaveCount(2, MISSING);
  await expect(spans.nth(0)).toHaveText('9 measured');
  await expect(spans.nth(1)).toHaveText('3 unknown');
});

test('AC46 unknown 0: measured and estimated only, no 0 unknown', async ({ page }) => {
  const { card, spans } = await classes(page, { measured_run_count: 9, estimated_run_count: 2, unknown_run_count: 0 });
  await expect(spans).toHaveCount(2, MISSING);
  await expect(spans.nth(1)).toHaveText('2 estimated');
  await expect(card).not.toContainText('0 unknown');
});

test('AC46 measured 0 is a value beside a served unknown', async ({ page }) => {
  const { spans } = await classes(page, { measured_run_count: 0, estimated_run_count: 0, unknown_run_count: 3 });
  await expect(spans).toHaveCount(2, MISSING);
  await expect(spans.nth(0)).toHaveText('0 measured');
  await expect(spans.nth(1)).toHaveText('3 unknown');
});

test('AC46 a malformed count is left out, never shown as a number', async ({ page }) => {
  const { card, spans } = await classes(page, { measured_run_count: 9, estimated_run_count: 'abc', unknown_run_count: 3 });
  await expect(spans).toHaveCount(2, MISSING);
  await expect(card.locator('[data-run-class="estimated"]')).toHaveCount(0);
  await expect(card).not.toContainText('NaN');
});

test('AC46 only measured runs served: no breakdown line (control)', async ({ page }) => {
  const { card, spans } = await classes(page, { measured_run_count: 9, estimated_run_count: 0, unknown_run_count: 0 });
  await expect(card.locator('.local-dashboard-metric')).not.toHaveText('');
  await expect(spans).toHaveCount(0);
  await expect(card).not.toContainText('estimated');
});
