// @vitest-environment jsdom
// OMN-22168: the run table defects Jonah's review found on 2026-11-06, each beside a control that would pass the defect.
//   J1 money is cut, never rounded up: two decimals from $1, up to four under $1, and a non-zero amount never shows $0
//      ("$0.30 when it is $0.2999 overstates the cost"; dev printed every served digit).
//   J2 every run row shows its date beside its clock ("Only the first time column has a date"; dev wrote the day on the
//      first row of each day only), while a rule above a day's first run still groups the days.
// J3, a long model name on one line at 1440px, is measured on the page in
// tests/e2e/design-system-dashboard-polish.omn22168.spec.ts L12.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDashboardUsd } from '@/lib/dashboard-currency';
import { RunsTable } from '@/pages/LocalDashboardPage';

describe('J1: dashboard money is cut, never rounded up', () => {
  it.each([
    [1, '$1.00'],
    [1.999, '$1.99'],
    [12.349, '$12.34'],
    [1234.5, '$1,234.50'],
    [0.5, '$0.50'],
    [0.12345, '$0.1234'],
    [0.99999, '$0.9999'],
    [0.0012, '$0.0012'],
    [-12.349, '-$12.34'],
    ['0.12345', '$0.1234'],
  ] as const)('%s reads %s', (value, shown) => {
    expect(formatDashboardUsd(value)).toBe(shown);
  });

  it('a non-zero amount below $0.0001 shows $0.0001, never $0', () => {
    expect(formatDashboardUsd(0.00009)).toBe('$0.0001');
    expect(formatDashboardUsd(0)).toBe('$0.00');
  });

  it('control: rounding would have shown each of these higher', () => {
    for (const [value, rounded] of [[1.999, '$2.00'], [0.99999, '$1.00'], [12.349, '$12.35']] as const) {
      expect(formatDashboardUsd(value)).not.toBe(rounded);
    }
  });
});

const NOW = Date.parse('2026-11-06T12:00:00Z');
function run(id: string, at: string): Record<string, unknown> {
  return {
    correlation_id: id, created_at: at, written_at: at, model_name: 'model-a', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 900, tokens_input: 200, tokens_output: 20,
  };
}

describe('J2: every run row shows its date', () => {
  // Three runs on Nov 6 and two on Nov 5, newest first.
  const decisions = [
    run('j2-a', '2026-11-06T10:05:00Z'), run('j2-b', '2026-11-06T09:05:00Z'), run('j2-c', '2026-11-06T08:05:00Z'),
    run('j2-d', '2026-11-05T22:05:00Z'), run('j2-e', '2026-11-05T21:05:00Z'),
  ];

  function timeCells() {
    const table = screen.getAllByRole('table').find(t => within(t).queryAllByRole('columnheader').some(h => h.textContent?.trim() === 'Time'))!;
    const index = within(table).getAllByRole('columnheader').findIndex(h => h.textContent?.trim() === 'Time');
    const rows = within(table).getAllByRole('row').slice(1);
    return { rows, cells: rows.map(row => within(row).getAllByRole('cell')[index]!) };
  }

  it('each row writes its day beside its clock', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { cells } = timeCells();
    expect(cells).toHaveLength(5);
    const days = cells.map(cell => cell.querySelector('.local-run-day')?.textContent ?? null);
    expect(days).toEqual(['Nov 6', 'Nov 6', 'Nov 6', 'Nov 5', 'Nov 5']);
    for (const cell of cells) expect(cell.querySelector('.local-run-clock')?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('control: the rule above a day still marks only each day\'s first run', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { rows } = timeCells();
    expect(rows.map(row => row.hasAttribute('data-day-start'))).toEqual([true, false, false, true, false]);
  });
});
