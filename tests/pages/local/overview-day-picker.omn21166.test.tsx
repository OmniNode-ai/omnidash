// @vitest-environment jsdom
// OMN-21166 (Lakshman, live review 2026-10-25, "pick a day"): the calendar in Overview's window control picks one served
// UTC day, and the headline figures show that day's served row. Failure modes, each with a test below:
//   D1  a chosen day shows the all-time or today's row instead of that day's;
//   D2  the picker offers a day the runtime did not serve (its figures would be invented);
//   D3  a day with no row (no runs, Lakshman 2026-10-25) is not shown as a zero day, or a future day is offered;
//   D4  the picker's days are out of order, or repeat a day served under two baselines.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewDayPicker, pickMeteringRow, servedMeteringDays } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const day = (start: string, spend: string, over: Record<string, unknown> = {}) =>
  ({ window_kind: 'day', window_start: start, as_of: `${start}T23:00:00Z`, spend_usd: spend, ...over });
const ROWS = [
  { window_kind: 'all', window_start: '', as_of: '2026-10-25T23:00:00Z', spend_usd: '0.23' },
  day('2026-10-23', '0.05'), day('2026-10-25', '0.01'), day('2026-10-24', '0.02'),
  day('2026-10-24', '0.02', { baseline_model: 'old', as_of: '2026-10-20T00:00:00Z' }),
];

describe('pickMeteringRow with a chosen day', () => {
  it('D1: picks that day\'s row, not all time and not today', () => {
    const picked = pickMeteringRow(ROWS, 'day:2026-10-23', NOW);
    expect('row' in picked && picked.row.spend_usd).toBe('0.05');
  });

  it('D3: a day with no served row is a day with no runs: zero figures, marked as such', () => {
    const picked = pickMeteringRow(ROWS, 'day:2026-10-01', NOW);
    const row = (picked as { row: Record<string, unknown> }).row;
    expect([row.spend_usd, row.runs_measured, row.tokens_in, row.days_without_runs]).toEqual(['0', 0, 0, 1]);
  });
});

describe('servedMeteringDays', () => {
  it('D2/D4: lists each served day once, newest first', () => {
    expect(servedMeteringDays(ROWS)).toEqual(['2026-10-25', '2026-10-24', '2026-10-23']);
  });
});

describe('OverviewDayPicker (month calendar)', () => {
  it('opens on the chosen month, marks the days with runs, and picks any past day', () => {
    const onChange = vi.fn();
    render(<OverviewDayPicker days={['2026-10-25', '2026-10-24']} value="day:2026-10-24" onChange={onChange} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: /Pick a UTC day/ }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oct 24, 2026, has runs' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Oct 3, 2026, no runs' }));
    expect(onChange).toHaveBeenCalledWith('day:2026-10-03');
  });

  it('D3: a future day cannot be picked', () => {
    render(<OverviewDayPicker days={['2026-10-25']} value="all" onChange={() => {}} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: /Pick a UTC day/ }));
    expect(screen.getByRole('button', { name: 'Oct 26, 2026, future' })).toBeDisabled();
  });

  it('moves between months', () => {
    render(<OverviewDayPicker days={['2026-09-29']} value="all" onChange={() => {}} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: /Pick a UTC day/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sep 29, 2026, has runs' })).toBeInTheDocument();
  });

  it('names the chosen day on its button', () => {
    render(<OverviewDayPicker days={['2026-10-25', '2026-10-24']} value="day:2026-10-24" onChange={() => {}} now={NOW} />);
    expect(screen.getByRole('button', { name: /Pick a UTC day/ }).textContent).toContain('Oct 24');
  });
});
