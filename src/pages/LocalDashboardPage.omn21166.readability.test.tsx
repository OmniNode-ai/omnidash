// @vitest-environment jsdom
// OMN-21166 rule change R-A (Lakshman, 2026-10-18): times and run ids in the run tables are written for reading; the
// exact served text stays on the element, as its datetime and title, and as the link's target. This replaces
// OMN-21015 I8's "shown whole" for the displayed text only.
//
// Failure modes, each with a test below:
//   R1  a served timestamp prints raw (date, T, microseconds and offset) and wraps over several lines
//   R2  the served timestamp is lost when it is written for reading: it must stay on the element, exactly
//   R3  a timestamp served with another offset is converted to the reader's zone instead of keeping its offset
//   R4  a timestamp in another form is reformatted or dropped instead of shown as served
//   R5  a run id is cut so two runs cannot be told apart, or the whole id is lost from the link
//   R6  a short run id is shortened anyway
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecentRunsTable, RunsTable, readableTime } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-18T08:00:00Z');
const RUN_ID = '8cf667d9-8f09-4357-b38b-356f647c4412';
const SERVED_TIME = '2026-10-16T22:11:37.719174+00:00';

function decision(id: string, writtenAt: string): Record<string, unknown> {
  return {
    correlation_id: id, written_at: writtenAt, created_at: writtenAt, model_name: 'Qwen3.8-27B',
    quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 531, tokens_input: 269, tokens_output: 13,
  };
}

function cellUnder(header: string): HTMLElement {
  const row = screen.getAllByRole('row')[1]!;
  const table = row.closest('table')!;
  const index = within(table).getAllByRole('columnheader').findIndex(cell => cell.textContent?.trim() === header);
  return within(row).getAllByRole('cell')[index]!;
}

describe.each([
  ['Recent runs', RecentRunsTable, 'Time'],
  ['Runs', RunsTable, 'Created'],
] as const)('OMN-21166 R-A: %s writes times and ids for reading', (_name, Table, TIME) => {
  it('R1, R2: a UTC time reads "Oct 16, 22:11:37 UTC" and keeps the served text on the element', () => {
    render(<Table now={NOW} decisions={[decision(RUN_ID, SERVED_TIME)]} sessions={[]} />);
    const time = cellUnder(TIME).querySelector('time');
    expect(time?.textContent).toBe('Oct 16, 22:11:37 UTC');
    expect(time?.getAttribute('datetime')).toBe(SERVED_TIME);
    expect(time?.getAttribute('title')).toBe(SERVED_TIME);
  });

  it('R3: another offset is kept, not converted', () => {
    render(<Table now={NOW} decisions={[decision(RUN_ID, '2026-10-16T22:11:37+05:30')]} sessions={[]} />);
    expect(cellUnder(TIME).querySelector('time')?.textContent).toBe('Oct 16, 22:11:37 +05:30');
  });

  it('R4: a time in another form is shown as served', () => {
    render(<Table now={NOW} decisions={[decision(RUN_ID, 'yesterday at noon')]} sessions={[]} />);
    const cell = cellUnder(TIME);
    expect(cell.textContent).toBe('yesterday at noon');
    expect(cell.querySelector('time')).toBeNull();
  });

  it('R5: a long run id shows its head and tail; the link keeps the whole id', () => {
    render(<Table now={NOW} decisions={[decision(RUN_ID, SERVED_TIME)]} sessions={[]} />);
    const link = within(cellUnder('Run')).getByRole('link');
    expect(link.textContent).toBe('8cf667d9…4412');
    expect(link.getAttribute('title')).toBe(RUN_ID);
    expect(link.getAttribute('href')).toContain(`correlation_id=${RUN_ID}`);
  });

  it('R6: a short run id is shown whole', () => {
    render(<Table now={NOW} decisions={[decision('run-a', SERVED_TIME)]} sessions={[]} />);
    expect(within(cellUnder('Run')).getByRole('link').textContent).toBe('run-a');
  });
});

describe('OMN-21166 R-A: one readable time for every served timestamp (run tables and Workflow steps)', () => {
  it.each([
    ['2026-10-16T22:11:55.566656+00:00', 'Oct 16, 22:11:55 UTC'],
    ['2026-10-16T22:11:55Z', 'Oct 16, 22:11:55 UTC'],
    ['2026-10-16T22:11:55+05:30', 'Oct 16, 22:11:55 +05:30'],
    ['2026-13-16T22:11:55Z', null],
    ['yesterday at noon', null],
  ])('%s reads %s', (served, readable) => {
    expect(readableTime(served)).toBe(readable);
  });
});
