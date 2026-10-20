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
//   C10 without page rows the hero line draws something anyway, changing the Quality panel on its own
//   C9  on the page, the section ignores the page's one window and keeps a second switch of its own
//   C12 a capped latest-row response is described as complete seven-day/all-time activity
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext, OverviewRunsContext, PassRateSparkline } from './insight-charts';

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

const TITLES = ['Runs per day', 'When runs happen', 'Tasks', 'How long runs take', 'Model scoreboard', 'Why runs failed', 'Tokens per day'];

describe('OMN-21166: Overview insight charts', () => {
  it('C12: capped served rows disclose their actual UTC span, not complete seven-day activity', () => {
    const start = Date.parse('2026-10-18T06:00:00Z');
    const capped = Array.from({ length: 500 }, (_, index) => row(new Date(start + index * 1000).toISOString())).reverse();
    render(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={capped} now={NOW} /></InsightsWindowContext.Provider>);
    const caption = screen.getByTestId('insights-total');
    expect(caption).toHaveTextContent('Latest 500 served runs');
    expect(caption).toHaveTextContent('2026-10-18 06:00:00–2026-10-18 06:08:19 UTC');
    expect(caption).toHaveTextContent('Earlier activity is not included');
    expect(caption).not.toHaveTextContent(/last 7 days|all time/i);
    expect(within(screen.getByRole('group', { name: 'Runs per day' })).getByRole('button', { name: /^Oct 18:/ })).toHaveAccessibleName('Oct 18: 500 runs, 500 passed, 0 failed');
  });

  // Review failures: the30-day drawing cap must not imply all served rows are
  // plotted; undated rows cannot silently vanish; partial token days are not totals.
  it('C13: discloses the plotted subset when all-time served rows exceed30days', () => {
    render(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={[row('2026-09-01T08:00:00Z'), row('2026-10-18T08:00:00Z')]} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('1 of the latest 2 served runs');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('last 30 UTC days');
  });
  it('C14: keeps undated rows in the served denominator and names their exclusion', () => {
    render(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={[row('2026-10-18T08:00:00Z'), row('not-a-time')]} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('1 of the latest 2 served runs');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('1 undated row excluded');
  });
  it('C15: a partial token day labels each measured subtotal and its missing-run count', () => {
    render(<InsightsSection decisions={[row('2026-10-18T08:00:00Z'), row('2026-10-18T08:01:00Z', { tokens_input: null, tokens_output: 5 })]} now={NOW} />);
    const figure = screen.getByRole('figure', { name: /^Tokens per day$/ });
    const bar = within(screen.getByRole('group', { name: 'Tokens per day' })).getByRole('button', { name: /^Oct 18:/ });
    expect(bar).toHaveAccessibleName('Oct 18: 200 in (partial: 1 run not recorded), 25 out');
    fireEvent.focus(bar);
    expect(figure.querySelector('[aria-live="polite"]')).toHaveTextContent('200 in (partial: 1 run not recorded)');
    expect(figure.querySelector('[aria-live="polite"]')).toHaveTextContent('25 out');
  });

  // Review failure: heatmap spans expose their values only on pointer hover.
  it('C11: heatmap values are reachable by one tab stop, arrows, focus and activation', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const chart = screen.getByRole('group', { name: /Runs by UTC hour over the last 7 days/ });
    const cells = within(chart).getAllByRole('button');
    expect(cells).toHaveLength(168);
    expect(cells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);
    act(() => cells[0]!.focus());
    fireEvent.keyDown(cells[0]!, { key: 'ArrowRight' });
    expect(cells[1]).toHaveFocus();
    fireEvent.keyDown(cells[1]!, { key: 'ArrowDown' });
    expect(cells[25]).toHaveFocus();
    fireEvent.keyDown(cells[25]!, { key: 'Home' });
    expect(cells[24]).toHaveFocus();
    fireEvent.keyDown(cells[24]!, { key: 'ArrowLeft' });
    expect(cells[24]).toHaveFocus();
    const populated = within(chart).getByRole('button', { name: 'Sun 08:00 UTC · 3 runs' });
    fireEvent.click(populated);
    expect(screen.getByTestId('activity-hour-readout')).toHaveTextContent('Sun 08:00 UTC · 3 runs');
    expect(cells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);
    const empty = within(chart).getByRole('button', { name: 'Sun 09:00 UTC · 0 runs' });
    fireEvent.focus(empty);
    expect(screen.getByTestId('activity-hour-readout')).toHaveTextContent('Sun 09:00 UTC · 0 runs');
  });

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
    expect(screen.getByTestId('insights-total')).toHaveTextContent('4 of the latest 5 served runs');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 of the latest 5 served runs');
    fireEvent.click(screen.getByRole('button', { name: '14 days' }));
    expect(screen.getByTestId('insights-total')).toHaveTextContent('5 of the latest 5 served runs');
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

  it('C8: one day of runs still shows its pass rate as a mark (in the Quality hero)', () => {
    const decisions = [row('2026-10-16T22:11:00Z'), row('2026-10-16T22:12:00Z', { quality_gate_passed: 0 })];
    const { container } = render(<OverviewRunsContext.Provider value={{ decisions, now: NOW }}><PassRateSparkline /></OverviewRunsContext.Provider>);
    const plot = screen.getByRole('img', { name: 'Pass rate per day' }).parentElement!;
    expect(plot.querySelectorAll('.ins-dot')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="Oct 16: 50.0% passed"]')).not.toBeNull();
  });

  it('C10: without page rows the hero line draws nothing, so Quality alone is unchanged', () => {
    const { container } = render(<PassRateSparkline />);
    expect(container).toBeEmptyDOMElement();
  });

  it('C9: on the page it follows the page window and has no switch of its own', () => {
    const { rerender } = render(<InsightsWindowContext.Provider value="today"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 of the latest 5 served runs · today');
    expect(screen.queryByRole('group', { name: 'Range' })).toBeNull();
    rerender(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('Latest 5 served runs');
  });
});
