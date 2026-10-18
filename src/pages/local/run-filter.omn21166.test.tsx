// @vitest-environment jsdom
// OMN-21166 (Lakshman, 2026-10-18: "let's fix overview page" from the approved mockup): the Overview's latest runs
// filter by result, a failure cause in the trends filters them to that cause, and "Show the failures" on the
// last-visit line sets them to Failed.
//
// Failure modes, each with a test below:
//   F1  the result buttons count or keep rows other than the served verdicts say
//   F2  a run with no recorded verdict is counted as passed or failed
//   F3  clicking a cause leaves other causes, or passed runs, in the table; or the filter cannot be cleared
//   F4  "Show the failures" does not narrow the table to failed runs
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecentRunsTable } from '../LocalDashboardPage';
import { InsightsSection } from './insight-charts';
import { RunFilterProvider } from './run-filter';
import { LAST_VISIT_KEY, SinceLastVisit } from './since-last-visit';

const NOW = Date.parse('2026-10-18T09:30:00Z');
function run(id: string, minute: number, passed: unknown, detail = 'completed'): Record<string, unknown> {
  const at = `2026-10-18T08:${String(minute).padStart(2, '0')}:00Z`;
  return { correlation_id: id, written_at: at, created_at: at, quality_gate_passed: passed, quality_gate_detail: detail,
    model_name: 'Qwen3.8-27B', latency_ms: 400, tokens_input: 200, tokens_output: 20, task_type: 'document' };
}
const RUNS = [
  run('run-pass-1', 1, 1), run('run-pass-2', 2, 1),
  run('run-mal', 3, 0, 'MALFORMED: invalid syntax'), run('run-task', 4, 0, 'TASK_MISMATCH: no code'),
  run('run-none', 5, null),
];
const ids = () => within(screen.getByRole('table')).queryAllByRole('link').map(link => link.getAttribute('title') ?? link.textContent);

describe('OMN-21166: Overview run filter', () => {
  it('F1, F2: result buttons count by served verdict and narrow the rows', () => {
    render(<RecentRunsTable decisions={RUNS} sessions={[]} now={NOW} />);
    const group = screen.getByRole('group', { name: 'Filter runs by result' });
    expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(['All 5', 'Passed 2', 'Failed 2']);
    fireEvent.click(within(group).getByRole('button', { name: /^Failed/ }));
    expect(ids().sort()).toEqual(['run-mal', 'run-task']);
    fireEvent.click(within(group).getByRole('button', { name: /^Passed/ }));
    expect(ids().sort()).toEqual(['run-pass-1', 'run-pass-2']);
  });

  it('F3: a cause in the trends narrows the latest runs to it, and can be cleared', () => {
    render(<RunFilterProvider><InsightsSection decisions={RUNS} now={NOW} /><RecentRunsTable decisions={RUNS} sessions={[]} now={NOW} /></RunFilterProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show runs failed by MALFORMED' }));
    expect(ids()).toEqual(['run-mal']);
    expect(screen.getByRole('button', { name: 'Show runs failed by MALFORMED' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear cause MALFORMED' }));
    expect(ids()).toHaveLength(5);
  });

  it('F4: "Show the failures" sets the latest runs to Failed', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.parse('2026-10-18T07:00:00Z')));
    render(<RunFilterProvider><SinceLastVisit decisions={RUNS} now={NOW} /><RecentRunsTable decisions={RUNS} sessions={[]} now={NOW} /></RunFilterProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show the failures' }));
    expect(ids().sort()).toEqual(['run-mal', 'run-task']);
    window.localStorage.clear();
  });
});
