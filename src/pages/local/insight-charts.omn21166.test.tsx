// @vitest-environment jsdom
// OMN-21166 AC26/AC31 (mockup build, approved 2026-10-18): the Overview's insight charts over served decision rows.
//
// Failure modes, each with a test below:
//   C1  a chart is missing, or two charts share an icon so they cannot be told apart at a glance
//   C2  a day's bar reads other numbers than the rows of that UTC day
//   C3  the range control does not change what the charts count
//   C4  a run with no recorded verdict is shown as passed
//   C5  a task with no recorded type disappears from the task mix
//   C6  a chart can only be read by pointer: no focusable mark carries its numbers
//   C7  with no rows in the window the section draws empty charts instead of saying so
//   C8  a single day of runs draws no pass-rate mark at all (a line needs two points; Chrome walk 2026-10-18)
//   C9  on the page, the section ignores the page's one window and keeps a second switch of its own
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext } from './insight-charts';

const NOW = Date.parse('2026-10-18T09:30:00Z');

function row(at: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    written_at: at, quality_gate_passed: 1, quality_gate_detail: 'completed', latency_ms: 500, tokens_input: 200,
    tokens_output: 20, cost_usd: 0, cost_tier_name: 'local', task_type: 'document',
    model_name: 'Qwen3.8-27B', ...extra,
  };
}

const ROWS = [
  row('2026-10-18T08:00:00Z'),
  row('2026-10-18T08:05:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: invalid syntax', task_type: 'code_generation' }),
  row('2026-10-18T08:10:00Z', { quality_gate_passed: null, task_type: null }),
  row('2026-10-16T22:11:00Z', { latency_ms: 2400, model_name: 'gemini-3.5-flash-lite', cost_tier_name: 'cheap_cloud', cost_usd: 0.0012 }),
  row('2026-10-09T12:00:00Z'),
];

const TITLES = ['Runs per day', 'Pass rate per day', 'When runs happen', 'Tasks', 'How long runs take', 'Model scoreboard', 'Why runs failed', 'Tokens per day'];

describe('OMN-21166: Overview insight charts', () => {
  it('C1: all eight charts render, each with its own Lucide icon', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const icons = TITLES.map((title) => {
      const heading = screen.getByRole('heading', { name: title });
      const svg = heading.querySelector('svg');
      return [...(svg?.classList ?? [])].find(name => name.startsWith('lucide-') && name !== 'lucide-icon');
    });
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(TITLES.length);
  });

  it('C2, C4, C6: focusing a day reads that UTC day: passed, failed and not recorded apart', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const chart = screen.getByRole('group', { name: 'Runs per day' });
    const today = within(chart).getByRole('button', { name: /^Oct 18:/ });
    expect(today).toHaveAccessibleName('Oct 18: 3 runs, 1 passed, 1 failed, 1 not recorded');
    fireEvent.focus(today);
    expect(screen.getByTestId('runs-per-day-readout')).toHaveTextContent('Oct 18 · 3 runs · 1 passed · 1 failed · 1 not recorded');
  });

  it('C3: the range control changes what is counted', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('4 runs');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 runs');
    fireEvent.click(screen.getByRole('button', { name: '14 days' }));
    expect(screen.getByTestId('insights-total')).toHaveTextContent('5 runs');
  });

  it('C5: a run with no task type is listed under Not recorded', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const tasks = screen.getByRole('list', { name: 'Tasks' });
    expect(within(tasks).getByText('Not recorded')).toBeInTheDocument();
    expect(within(tasks).getByText('document')).toBeInTheDocument();
  });

  it('C7: with no rows in the window the section says so', () => {
    render(<InsightsSection decisions={[row('2026-09-01T00:00:00Z')]} now={NOW} />);
    expect(screen.getByRole('status', { name: 'Insights' })).toHaveTextContent('No runs in the last 7 days');
  });

  it('C8: one day of runs still shows its pass rate as a mark', () => {
    const { container } = render(<InsightsSection decisions={[row('2026-10-16T22:11:00Z'), row('2026-10-16T22:12:00Z', { quality_gate_passed: 0 })]} now={NOW} />);
    const plot = screen.getByRole('img', { name: 'Pass rate per day' }).parentElement!;
    expect(plot.querySelectorAll('.ins-dot')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="Oct 16: 50.0% passed"]')).not.toBeNull();
  });

  it('C9: on the page it follows the page window and has no switch of its own', () => {
    const { rerender } = render(<InsightsWindowContext.Provider value="today"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 runs today');
    expect(screen.queryByRole('group', { name: 'Range' })).toBeNull();
    rerender(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('5 runs in the last 10 days (all time)');
  });
});
