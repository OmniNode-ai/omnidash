/**
 * OMN-26623 AC3: proves the Usage page renders the delegation quality weekly
 * figures for the last eight weeks and that task type/model filters change them.
 * Falsifier: the automated Chrome check fails if any figure differs from the
 * exposure or a filter changes nothing.
 * Serves the row omnimarket's delegation.quality-weekly.v1 exposure produced
 * for 58 recorded runs (tests/fixtures/omn26623/quality-weekly.recorded.json).
 * Every expected figure is computed here from that row's cells, independently
 * of the page code. Each test title starts with delegation_quality_weekly so
 * `-g delegation_quality_weekly` runs them all.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Locator } from 'playwright/test';
import { keepRealClock, prefix, serveCharts } from './omn21166-chart-fixtures';

type Cell = { iso_week: string; task_type: string | null; model_id: string | null; runs: number; first_try_passes: number; moved_down_chain: number };

const TOPIC = prefix + 'delegation.quality-weekly.v1';
const RECORDED = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/omn26623/quality-weekly.recorded.json'), 'utf8')) as { rows: Array<{ cells: Cell[] }> };
const CELLS = RECORDED.rows[0].cells;
const NOW = '2026-11-26T12:00:00Z';
const WEEKS = ['2026-W48', '2026-W47', '2026-W46', '2026-W45', '2026-W44', '2026-W43', '2026-W42', '2026-W41'];
const NO_RUNS = 'no runs';

function sums(week: string, taskType = '', model = ''): { runs: number; passes: number; moved: number } {
  let runs = 0;
  let passes = 0;
  let moved = 0;
  for (const cell of CELLS) {
    if (cell.iso_week !== week) continue;
    if (taskType && cell.task_type !== taskType) continue;
    if (model && cell.model_id !== model) continue;
    runs += cell.runs;
    passes += cell.first_try_passes;
    moved += cell.moved_down_chain;
  }
  return { runs, passes, moved };
}

function share(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function open(page: Page): Promise<Locator> {
  keepRealClock(page);
  await page.clock.setFixedTime(new Date(NOW));
  await serveCharts(page, { [TOPIC]: RECORDED.rows });
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-delegation-quality"]');
  await expect(panel).toBeVisible();
  return panel;
}

async function figures(panel: Locator): Promise<Record<string, [string, string, string]>> {
  const out: Record<string, [string, string, string]> = {};
  for (const week of WEEKS) {
    const runs = await panel.locator(`tr[data-week="${week}"] td[data-figure="runs"]`).innerText();
    const firstTry = await panel.locator(`tr[data-week="${week}"] td[data-figure="first-try"]`).innerText();
    const moved = await panel.locator(`tr[data-week="${week}"] td[data-figure="moved"]`).innerText();
    out[week] = [runs, firstTry, moved];
  }
  return out;
}

function expected(taskType = '', model = ''): Record<string, [string, string, string]> {
  const out: Record<string, [string, string, string]> = {};
  for (const week of WEEKS) {
    const s = sums(week, taskType, model);
    out[week] = [
      String(s.runs),
      s.runs === 0 ? NO_RUNS : share(s.passes, s.runs),
      s.runs === 0 ? NO_RUNS : share(s.moved, s.runs),
    ];
  }
  return out;
}

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('delegation_quality_weekly: the Usage page shows the last eight weeks, every figure as the exposure serves it', async ({ page }) => {
  const panel = await open(page);
  const dataWeeks = await panel.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-week') ?? ''));
  expect(dataWeeks).toEqual(WEEKS);

  const rendered = await figures(panel);
  expect(rendered).toEqual(expected());
  expect(Object.values(rendered).some(([runs]) => +runs > 0)).toBe(true);
  expect(Object.values(rendered).some(([, firstTry, moved]) => firstTry === NO_RUNS || moved === NO_RUNS)).toBe(true);

  await panel.screenshot({ path: 'test-results/omn26623-delegation-quality.png' });
});

test('delegation_quality_weekly: the task type filter changes the figures to the exposure for that task type', async ({ page }) => {
  const taskTypes = [...new Set(CELLS.map((cell) => cell.task_type).filter((value): value is string => value !== null))];
  const taskType = taskTypes
    .map((type) => ({ type, runs: sums('2026-W47', type, '').runs }))
    .filter((item) => item.runs > 0)
    .sort((a, b) => a.runs - b.runs)[0].type;

  expect(expected(taskType)).not.toEqual(expected());

  const panel = await open(page);
  await choose(page, 'Task type', taskType);
  expect(await figures(panel)).toEqual(expected(taskType));
});

test('delegation_quality_weekly: the model filter changes the figures to the exposure for that model', async ({ page }) => {
  const models = [...new Set(CELLS.map((cell) => cell.model_id).filter((value): value is string => value !== null))];
  const model = models
    .map((id) => ({ id, runs: CELLS.filter((cell) => cell.model_id === id).reduce((total, cell) => total + cell.runs, 0) }))
    .filter((item) => item.runs > 0)
    .sort((a, b) => a.runs - b.runs)[0].id;

  expect(expected('', model)).not.toEqual(expected());

  const panel = await open(page);
  await choose(page, 'Model', model);
  expect(await figures(panel)).toEqual(expected('', model));
});

test('delegation_quality_weekly: a week with no runs reads no runs, never 0%', async ({ page }) => {
  const panel = await open(page);
  const rendered = await figures(panel);
  expect(rendered['2026-W45'][1]).toBe(NO_RUNS);
  expect(rendered['2026-W45'][2]).toBe(NO_RUNS);
  expect(rendered['2026-W45'][1]).not.toContain('%');
  expect(rendered['2026-W45'][2]).not.toContain('%');
});
