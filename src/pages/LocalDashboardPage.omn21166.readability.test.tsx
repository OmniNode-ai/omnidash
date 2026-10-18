// @vitest-environment jsdom
// OMN-21166 AC16 (Lakshman, 2026-10-18 "dashbaord still nto good"): in a Chrome walk of the populated 21-run store at
// 1440 wide, the Overview's Time column wrapped each served timestamp over three lines. The cell still shows the served
// text whole (OMN-21015 I8); it is now laid out as two lines, its date and then its time from the T.
//
// Failure modes, each with a test below:
//   R1  the timestamp is laid out as one run of text that the column breaks wherever it likes
//   R2  laying it out changes the text: a character added, dropped or converted, or the served value lost
//   R3  a timestamp in another form is forced into the two-line layout instead of being shown as served
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecentRunsTable } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-18T08:00:00Z');
const SERVED_TIME = '2026-10-16T22:11:37.719174+00:00';

function decision(id: string, writtenAt: string): Record<string, unknown> {
  return {
    correlation_id: id, written_at: writtenAt, created_at: writtenAt, model_name: 'Qwen3.8-27B',
    quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 531, tokens_input: 269, tokens_output: 13,
  };
}

function timeCell(): HTMLElement {
  const row = screen.getAllByRole('row')[1]!;
  const table = row.closest('table')!;
  const index = within(table).getAllByRole('columnheader').findIndex(cell => cell.textContent?.trim() === 'Time');
  return within(row).getAllByRole('cell')[index]!;
}

describe('OMN-21166: a served timestamp on two lines, its text unchanged', () => {
  it('R1, R2: the date is one line and the time from the T is the next; the text and datetime are the served text', () => {
    render(<RecentRunsTable now={NOW} decisions={[decision('run-a', SERVED_TIME)]} sessions={[]} />);
    const cell = timeCell();
    expect(cell.textContent).toBe(SERVED_TIME);
    const time = cell.querySelector('time.local-cell-time');
    expect(time?.getAttribute('datetime')).toBe(SERVED_TIME);
    // Its own text is the served text (so it is found as that text), broken once, after the date.
    expect([...time!.childNodes].map(node => node.nodeName === 'BR' ? 'BR' : node.textContent)).toEqual([
      '2026-10-16', 'BR', 'T22:11:37.719174+00:00',
    ]);
    expect(within(cell).getByText(SERVED_TIME)).toBe(time);
  });

  it('R3: a time in another form is shown as served, with no two-line layout', () => {
    render(<RecentRunsTable now={NOW} decisions={[decision('run-a', 'yesterday at noon')]} sessions={[]} />);
    const cell = timeCell();
    expect(cell.textContent).toBe('yesterday at noon');
    expect(cell.querySelector('time')).toBeNull();
    expect(within(cell).getByText('yesterday at noon')).toBeInTheDocument();
  });
});
