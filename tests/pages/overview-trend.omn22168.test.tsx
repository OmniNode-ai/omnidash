// @vitest-environment jsdom
/**
 * OMN-22168 (Lakshman 2026-11-04: "one linear chart to show runs, models, tokens etc.", then "legend and one line chart
 * for all ... with hover numbers"; a full-width row under the cards). Every metric the page declares as a column is a
 * line on one chart, from metering-summary.v1's served day rows. Failure modes, each a test below:
 *   T1 a day with no served row is drawn as a gap, never as 0;  T2 each day names every metric's served value in its
 *   declared format (currency or a full count), and the legend hides and shows a line (the last one stays);
 *   T3 the Overview window limits the days drawn, as the other charts do;
 *   T4 a day served by two rows (a baseline change) is a gap, never one of the two values;  T5 no day rows shows an
 *   empty state, and an all-time row is never drawn as a day.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import { OverviewTrendPanel } from '@/pages/LocalDashboardPage';

const NOW = Date.UTC(2026, 10, 4, 18, 0, 0);
const COLUMNS = [
  { key: 'runs_total', header: 'Runs', format: 'number' },
  { key: 'tokens_in', header: 'Tokens in', format: 'number' },
  { key: 'spend_usd', header: 'Spend', format: 'currency' },
];
const day = (date: string, runs: number | null, tokens: number, spend: number, extra: Record<string, unknown> = {}) => ({
  window_kind: 'day', window_start: `${date}T00:00:00Z`, window_end: `${date}T23:59:59Z`, runs_total: runs, tokens_in: tokens, spend_usd: spend, ...extra });
const ROWS = [
  day('2026-11-01', 120, 50_000, 0.01), day('2026-11-02', 300, 120_000, 0.05),
  /* no row for 2026-11-03 */ day('2026-11-04', 1234, 900_000, 0.12),
  { window_kind: 'all', window_start: null, runs_total: 99999, tokens_in: 1, spend_usd: 9 },
];

function draw(rows: readonly unknown[], window: 'all' | `range:${string}` = 'all') {
  const { hook, searchHook } = memoryLocation({ path: '/overview' });
  return render(<Router hook={hook} searchHook={searchHook}><OverviewTrendPanel rows={rows} columns={COLUMNS} window={window} now={NOW} /></Router>);
}
const points = () => [...document.querySelectorAll('figure.local-chart .ins-hit')].map(point => point.getAttribute('aria-label'));

describe('Overview trend', () => {
  it('T1: every day from the first served day to today, a day with no row a gap', () => {
    draw(ROWS);
    expect(points()).toEqual([
      'Nov 1: 120 runs, 50,000 tokens in, $0.01 spend', 'Nov 2: 300 runs, 120,000 tokens in, $0.05 spend',
      'Nov 3: not recorded', 'Nov 4: 1,234 runs, 900,000 tokens in, $0.12 spend']);
    // Three lines, each with a break at Nov 3 (two segments: "M .. L .." then "M ..").
    const paths = [...document.querySelectorAll('figure.local-chart svg path')].map(path => path.getAttribute('d') ?? '');
    expect(paths).toHaveLength(3);
    for (const d of paths) expect(d.match(/M/g)).toHaveLength(2);
  });

  it('T2: the legend hides and shows a line, the last line stays, and focus reads the day', () => {
    draw(ROWS);
    const legend = screen.getByRole('group', { name: 'Trend lines' });
    fireEvent.click(within(legend).getByRole('button', { name: 'Runs' }));
    fireEvent.click(within(legend).getByRole('button', { name: 'Tokens in' }));
    expect(points()[3]).toBe('Nov 4: $0.12 spend');
    expect(document.querySelectorAll('figure.local-chart svg path')).toHaveLength(1);
    fireEvent.click(within(legend).getByRole('button', { name: 'Spend' }));
    expect(document.querySelectorAll('figure.local-chart svg path')).toHaveLength(1);
    fireEvent.click(within(legend).getByRole('button', { name: 'Runs' }));
    fireEvent.focus(document.querySelectorAll('figure.local-chart .ins-hit')[3]!);
    expect(screen.getByRole('figure', { name: 'Daily trend' }).textContent).toContain('Nov 4 · 1.23K runs · $0.12 spend');
  });

  it('T3: the Overview window limits the days drawn', () => {
    draw(ROWS, 'range:2026-11-03..2026-11-04');
    expect(points()).toEqual(['Nov 3: not recorded', 'Nov 4: 1,234 runs, 900,000 tokens in, $0.12 spend']);
  });

  it('T4: a day served by two rows is a gap, never one of the two values', () => {
    draw([...ROWS, day('2026-11-02', 7, 7, 7)]);
    expect(points()[1]).toBe('Nov 2: not recorded (two rows for this day)');
  });

  it('T5: no day rows shows an empty state, and the all-time row is never a day', () => {
    draw([ROWS[3]]);
    expect(screen.getByText('No day rows served yet')).toBeTruthy();
    expect(document.querySelector('figure.local-chart')).toBeNull();
  });
});
