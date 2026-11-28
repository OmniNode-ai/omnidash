/**
 * OMN-26623, the delegation-quality section; failure modes each test catches:
 * D1 a figure on the page differs from the exposure's cells for the week and filter;
 * D2 a week with no runs reads 0% or a number instead of copy.no_runs;
 * D3 a filter changes nothing;
 * D4 the page shows other than the last copy.weeks ISO weeks, newest first, or a year boundary week is wrong;
 * D5 a word on the section does not come from the copy.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatDashboardCount, formatShare } from '@/theme/format';
// the fixture lives under tests/ because recorded model ids are not page code
import recorded from '../../../tests/fixtures/omn26623/quality-weekly.recorded.json';
import copy from './delegation-quality.config.json';
import { DelegationQualitySection, isoWeekOf, type QualityCell } from './delegation-quality';

afterEach(cleanup);

const NOW = Date.UTC(2026, 10, 26, 12);
const ROWS = recorded.rows;
const CELLS = ROWS[0].cells as QualityCell[];

const WEEKS = [
  '2026-W48',
  '2026-W47',
  '2026-W46',
  '2026-W45',
  '2026-W44',
  '2026-W43',
  '2026-W42',
  '2026-W41',
];

function direct(week: string, taskType = '', model = '') {
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

function row(week: string): HTMLTableRowElement {
  const element = document.querySelector<HTMLTableRowElement>(`tr[data-week="${week}"]`);
  expect(element).not.toBeNull();
  return element!;
}

function figure(week: string, name: string): string {
  const cell = row(week).querySelector<HTMLTableCellElement>('td[data-figure="' + name + '"]');
  expect(cell).not.toBeNull();
  return cell!.textContent ?? '';
}

function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + label + ':') }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('OMN-26623 delegation-quality section', () => {
  it("D4 'shows the last eight ISO weeks, newest first'", () => {
    const { container } = render(<DelegationQualitySection rows={ROWS} now={NOW} />);
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    expect(rows.map((tr) => tr.getAttribute('data-week'))).toEqual(WEEKS);
    expect(rows).toHaveLength(copy.weeks);
  });

  it("D1 'every figure equals the exposure for every week'", () => {
    render(<DelegationQualitySection rows={ROWS} now={NOW} />);
    let hasRuns = false;
    for (const week of WEEKS) {
      const figures = direct(week);
      expect(figure(week, 'runs')).toBe(formatDashboardCount(figures.runs));
      if (figures.runs > 0) {
        hasRuns = true;
        expect(figure(week, 'first-try')).toBe(formatShare(figures.passes / figures.runs));
        expect(figure(week, 'moved')).toBe(formatShare(figures.moved / figures.runs));
      }
    }
    expect(hasRuns).toBe(true);
  });

  it("D2 'a week with no runs reads no runs, never 0%'", () => {
    render(<DelegationQualitySection rows={ROWS} now={NOW} />);
    expect(figure('2026-W45', 'first-try')).toBe(copy.no_runs);
    expect(figure('2026-W45', 'first-try')).not.toContain('%');
    expect(figure('2026-W45', 'moved')).toBe(copy.no_runs);
    expect(figure('2026-W45', 'moved')).not.toContain('%');
    expect(figure('2026-W45', 'runs')).toBe(formatDashboardCount(0));
  });

  it("D3 'the task type filter changes the figures'", () => {
    const runsByTaskType = new Map<string, number>();
    for (const cell of CELLS) {
      if (cell.iso_week !== '2026-W47' || cell.task_type === null) continue;
      runsByTaskType.set(
        cell.task_type,
        (runsByTaskType.get(cell.task_type) ?? 0) + cell.runs,
      );
    }

    let thatTaskType = '';
    let fewestRuns = Infinity;
    for (const [taskType, runs] of runsByTaskType) {
      if (runs > 0 && runs < fewestRuns) {
        fewestRuns = runs;
        thatTaskType = taskType;
      }
    }

    expect(direct('2026-W47', thatTaskType).runs).not.toBe(direct('2026-W47').runs);

    render(<DelegationQualitySection rows={ROWS} now={NOW} />);
    choose(copy.task_type_label, thatTaskType);
    expect(figure('2026-W47', 'runs')).toBe(
      formatDashboardCount(direct('2026-W47', thatTaskType).runs),
    );
    if (direct('2026-W48', thatTaskType).runs === 0) {
      expect(figure('2026-W48', 'first-try')).toBe(copy.no_runs);
    }
  });

  it("D3 'the model filter changes the figures'", () => {
    const runsByModel = new Map<string, number>();
    for (const cell of CELLS) {
      if (
        (cell.iso_week !== '2026-W47' && cell.iso_week !== '2026-W48') ||
        cell.model_id === null
      ) {
        continue;
      }
      runsByModel.set(
        cell.model_id,
        (runsByModel.get(cell.model_id) ?? 0) + cell.runs,
      );
    }

    let thatModel = '';
    let fewestRuns = Infinity;
    for (const [model, runs] of runsByModel) {
      if (runs > 0 && runs < fewestRuns) {
        fewestRuns = runs;
        thatModel = model;
      }
    }

    render(<DelegationQualitySection rows={ROWS} now={NOW} />);
    choose(copy.model_label, thatModel);
    expect(figure('2026-W48', 'runs')).toBe(
      formatDashboardCount(direct('2026-W48', '', thatModel).runs),
    );
    expect(figure('2026-W47', 'runs')).toBe(
      formatDashboardCount(direct('2026-W47', '', thatModel).runs),
    );
  });

  it("D5 'every word comes from the copy'", () => {
    const planted = Object.fromEntries(
      Object.entries(copy).map(([key, value]) => [
        key,
        typeof value === 'string' ? 'planted ' + key : value,
      ]),
    ) as typeof copy;

    const { container } = render(
      <DelegationQualitySection rows={ROWS} now={NOW} words={planted} />,
    );

    expect(screen.getByRole('columnheader', { name: planted.week_header })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: planted.runs_header })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: planted.first_try_header })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: planted.moved_header })).toBeTruthy();
    expect(screen.getByRole('table', { name: planted.table_label })).toBeTruthy();
    expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(planted.title);
    expect(screen.getByRole('button', { name: new RegExp('^planted task_type_label:') })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp('^planted model_label:') })).toBeTruthy();
    expect(screen.queryByText(copy.first_try_header)).toBeNull();
  });

  it("D4 'isoWeekOf is right across year boundaries'", () => {
    expect(isoWeekOf(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeekOf(Date.UTC(2024, 11, 30))).toBe('2025-W01');
    expect(isoWeekOf(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeekOf(Date.UTC(2026, 10, 22))).toBe('2026-W47');
    expect(isoWeekOf(Date.UTC(2026, 10, 23))).toBe('2026-W48');
  });
});
