import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts, keepRealClock } from './omn21166-chart-fixtures';
// This spec dates its rows from the real clock, so the browser keeps it (see FIXTURE_NOW).
test.beforeEach(({ page }) => keepRealClock(page));

// OMN-21166 part 9 AC46 asked that each run class under the run figure be its own labelled count in its own shared
// colour, with unknown never in the failed tone. Since OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering") the
// card reads metering-summary.v1, whose classes are the measured runs, every run, and the runs left out for having no
// token counts or no spend; OMN-23330 AC27 colours each in its own tone. Failure modes, carried over:
//   C1  two classes share one colour, or a left-out run reads in the failed tone (in either theme);
//   C2  a zero left-out class is still drawn ("0 runs without spend");
//   C3  a missing count is drawn as a number instead of "Not recorded";
//   C4  a measured 0 is dropped instead of drawn as a value.
const MISSING = { timeout: 3000 };
const METERING = prefix + 'metering-summary.v1';

function meteringRow(counts: Record<string, unknown>) {
  return [{ window_kind: 'all', window_start: '', as_of: new Date().toISOString(), baseline_model: 'baseline-a',
    pricing_manifest_version: 'fixture-1', baseline_state: 'resolved', spend_usd: '0.25', counterfactual_usd: '1.00',
    savings_usd: '0.75', tokens_in: 100, tokens_out: 20, runs_total: 14, runs_measured: 9, runs_unknown_tokens: 3,
    runs_unknown_spend: 2, ...counts }];
}

async function card(page: Page, counts: Record<string, unknown>) {
  await serveCharts(page, { ...chartRows, [METERING]: meteringRow(counts) });
  await page.goto('/');
  const measured = page.locator('[data-component="overview-measured"]');
  await expect(measured.locator('.local-dashboard-metric')).toBeVisible();
  return measured;
}

/** Each toned caption part of the Agent calls card, with its computed colour, and the failed tone's colour. */
async function paint(page: Page) {
  return page.evaluate(() => {
    const parts = [...document.querySelectorAll<HTMLElement>('[data-component="overview-measured"] .local-caption-tone[data-field-tone]')];
    const fail = getComputedStyle(document.documentElement).getPropertyValue('--field-fail').trim();
    const probe = document.createElement('span');
    probe.style.color = fail;
    document.body.append(probe);
    const failColour = getComputedStyle(probe).color;
    probe.remove();
    return { failColour, parts: parts.map(p => ({ tone: p.dataset.fieldTone, text: p.textContent, colour: getComputedStyle(p).color })) };
  });
}

test('C1: measured, every run and the runs left out wear three colours, never the failed one, in both themes', async ({ page }) => {
  const measured = await card(page, {});
  await expect(measured).toContainText('9 of 14 runs measured');
  await expect(measured).toContainText('Not counted: 3 runs without token counts, 2 runs without spend');
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') ?? 'light') !== theme) {
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    }
    const { failColour, parts } = await paint(page);
    expect(parts.map(p => [p.tone, p.text])).toEqual(expect.arrayContaining([['calls', '9'], ['count', '14'], ['run-unknown', '3'], ['run-unknown', '2']]));
    const colour = (tone: string) => parts.find(p => p.tone === tone)?.colour;
    expect(new Set(['calls', 'count', 'run-unknown'].map(colour)).size, `${theme}: one colour per class`).toBe(3);
    expect(colour('run-unknown'), `${theme}: a left-out run is not a failure`).not.toBe(failColour);
  }
});

test('C2: a zero left-out class is not drawn', async ({ page }) => {
  const measured = await card(page, { runs_unknown_spend: 0 });
  await expect(measured).toContainText('Not counted: 3 runs without token counts', MISSING);
  await expect(measured).not.toContainText('without spend');
});

test('C2 control: with nothing left out there is no Not counted line', async ({ page }) => {
  const measured = await card(page, { runs_measured: 14, runs_unknown_tokens: 0, runs_unknown_spend: 0 });
  await expect(measured).toContainText('14 of 14 runs measured', MISSING);
  await expect(measured).not.toContainText('Not counted');
});

test('C3: a missing count reads Not recorded, never a number', async ({ page }) => {
  const measured = await card(page, { runs_unknown_spend: null });
  await expect(measured).toContainText('runs without spend: Not recorded', MISSING);
});

test('C4: a measured 0 is a value', async ({ page }) => {
  const measured = await card(page, { runs_measured: 0, runs_total: 3, runs_unknown_tokens: 3, runs_unknown_spend: 0 });
  await expect(measured.locator('.local-dashboard-metric')).toHaveText('0');
  await expect(measured).toContainText('0 of 3 runs measured', MISSING);
});
