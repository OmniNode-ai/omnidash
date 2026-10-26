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
import { InsightsSection, InsightsWindowContext, MeteringActivityInsights, OverviewRunsContext, PassRateSparkline } from './insight-charts';
import { durationDistribution } from './insight-aggregates';
import { toInsightRuns } from './insights';

const NOW = Date.parse('2026-10-18T09:30:00Z');

it('AC26 renders metered spend and savings only from the Overview metering rows', () => {
  render(<InsightsWindowContext.Provider value={{ window: { kind: 'days', days: 1 }, setWindow: () => undefined }}>
    <MeteringActivityInsights now={NOW} unavailable={null} window={{ kind: 'days', days: 1 }} rows={[
      { window_kind: 'all', as_of: '2026-10-18T09:00:00Z', baseline_model: 'baseline-a' },
      { window_kind: 'day', window_start: '2026-10-18', baseline_model: 'baseline-a', spend_usd: '1.25', savings_usd: '0.50', counterfactual_usd: '1.75', runs_total: 2 },
    ]} />
  </InsightsWindowContext.Provider>);
  const summary = screen.getByRole('region', { name: 'Metered spend summary for 1 UTC day' });
  expect(within(summary).getByText('$1.25')).toBeInTheDocument();
  expect(within(summary).getByText('$0.50')).toBeInTheDocument();
  expect(screen.getByRole('figure', { name: 'Spend vs all-cloud' })).toHaveTextContent('$0.50 saved');
});

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
    expect(screen.getByTestId('insights-total')).toHaveTextContent('Latest 2 served runs');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('1 of 2 selected runs plotted');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('All served dates');
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
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
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

  // OMN-21166 part 15 AC96: the day chart says nothing at rest; its words appear only for the day a reader points at.
  it('C2: at rest the Runs per day readout is empty', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    expect(screen.getByTestId('runs-per-day-readout')).toHaveTextContent(/^$/);
  });

  it('C3: the range control changes what is counted', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('Latest 5 served runs');
    fireEvent.click(screen.getByRole('button', { name: '1 day' }));
    expect(screen.getByRole('button', { name: '1 day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 of the latest 5 served runs');
    fireEvent.click(screen.getByRole('button', { name: '15 days' }));
    expect(screen.getByTestId('insights-total')).toHaveTextContent('5 of the latest 5 served runs · last 15 UTC days');
  });

  it('AC26: 7.78 second runs are visible in the 5 to 10 second duration bucket', () => {
    const distribution = durationDistribution(toInsightRuns([row('2026-10-18T08:00:00Z', { latency_ms: 7_780 })]));
    expect(distribution.labels).toContain('5 seconds to 10 seconds');
    expect(distribution.buckets[3]).toBe(1);
    expect(distribution.unrecorded).toBe(0);
  });

  it('C5: a run with no task type is listed under Not recorded', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const tasks = screen.getByRole('list', { name: 'Tasks' });
    expect(within(tasks).getByText('Not recorded')).toBeInTheDocument();
    expect(within(tasks).getByText('document')).toBeInTheDocument();
  });

  it('C7: with no rows in the window the section says so', () => {
    render(<InsightsSection decisions={[row('2026-09-01T00:00:00Z')]} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('status', { name: 'Insights' })).toHaveTextContent('No runs in the last 7 days');
  });

  it('C8: one day of runs still shows its pass rate as a mark (in the Quality hero)', () => {
    const decisions = [row('2026-10-16T22:11:00Z'), row('2026-10-16T22:12:00Z', { quality_gate_passed: 0 })];
    const { container } = render(<OverviewRunsContext.Provider value={{ decisions, now: NOW }}><PassRateSparkline /></OverviewRunsContext.Provider>);
    const plot = screen.getByRole('img', { name: 'Pass rate per day' }).parentElement!;
    expect(plot.querySelectorAll('.ins-dot')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="Oct 16: 50.0% passed (2 of 2 runs have a verdict)"]')).not.toBeNull();
  });

  it('C10: without page rows the hero line draws nothing, so Quality alone is unchanged', () => {
    const { container } = render(<PassRateSparkline />);
    expect(container).toBeEmptyDOMElement();
  });

  it('C9: on the page it follows the page window and has no switch of its own', () => {
    const { rerender } = render(<InsightsWindowContext.Provider value="today"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('3 of the latest 5 served runs · 1 UTC day');
    expect(screen.queryByRole('group', { name: 'Range' })).toBeNull();
    rerender(<InsightsWindowContext.Provider value="all"><InsightsSection decisions={ROWS} now={NOW} /></InsightsWindowContext.Provider>);
    expect(screen.getByTestId('insights-total')).toHaveTextContent('Latest 5 served runs');
  });
});

// OMN-19919 AC7 (requirement OV-7): each "Why runs failed" row shows the typed cause, its count, first seen and last
// seen, and links to Runs filtered by status=failed and that cause.
//
// Failure modes, each with a test below:
//   W1  three failed runs of one typed cause show as several rows (grouped by detail text), or as a count other than 3
//   W2  a row shows no first or last seen, or the wrong ones (not the earliest and latest run of that cause)
//   W3  a row has no link to Runs, or a link that does not carry status=failed and that cause
//   W4  a failed run with no cause has no row, or no link
describe('OMN-19919: Why runs failed rows carry count, first and last seen, and a Runs link', () => {
  const failed = (at: string, extra: Record<string, unknown>) => row(at, { terminal_ok: 0, quality_gate_passed: 0, ...extra });
  const DECISIONS = [
    failed('2026-10-18T08:20:00Z', { quality_gate_detail: 'HTTP 503: upstream unavailable', terminal_failure_cause: 'provider_error' }),
    failed('2026-10-17T22:05:00Z', { quality_gate_detail: 'MALFORMED: invalid syntax', terminal_failure_cause: 'provider_error' }),
    failed('2026-10-18T08:00:00Z', { quality_gate_passed: null, quality_gate_detail: null, terminal_failure_cause: 'provider_error' }),
    failed('2026-10-18T08:10:00Z', { quality_gate_passed: null, quality_gate_detail: null, terminal_failure_cause: null }),
    row('2026-10-18T08:30:00Z'),
  ];

  it('W1-W4: one row per typed cause with its count, first seen, last seen and a filtered Runs link', () => {
    render(<InsightsSection decisions={DECISIONS} now={NOW} />);
    const list = screen.getByRole('list', { name: 'Failure causes' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const typed = rows.find(item => item.querySelector('[data-failure-cause="provider_error"]'))!;
    expect(typed).toBeDefined();
    expect(typed.querySelector('[data-field-tone="fail"]')).toHaveTextContent(/^3$/);
    expect(typed).toHaveTextContent('First seen 2026-10-17 22:05 UTC');
    expect(typed).toHaveTextContent('Last seen 2026-10-18 08:20 UTC');
    expect(within(typed).getByRole('link', { name: 'View runs failed by Provider error' })).toHaveAttribute('href', '/runs?status=failed&cause=provider_error');
    const unrecorded = rows.find(item => item.textContent?.includes('Not recorded'))!;
    expect(unrecorded.querySelector('[data-field-tone="fail"]')).toHaveTextContent(/^1$/);
    expect(unrecorded).toHaveTextContent('First seen 2026-10-18 08:10 UTC');
    expect(within(unrecorded).getByRole('link', { name: 'View runs failed by Not recorded' })).toHaveAttribute('href', '/runs?status=failed&cause=Not+recorded');
  });
});
