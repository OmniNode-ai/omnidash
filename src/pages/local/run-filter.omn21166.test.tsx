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
import { RunFilterProvider, causeHref, causeLabelOf } from './run-filter';
import { readRunsSearch } from '@/navigation/runs-url-state';
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

// OMN-19919 AC7: the trends' cause, the latest runs' filter and the Runs link key on one cause function: the served
// typed terminal_failure_cause, else the label the quality_gate_detail leads with, else Not recorded.
//
// Failure modes, each with a test below:
//   K1  the trends offer a typed cause the latest runs' filter cannot match (it keys on the detail head), so the
//       filtered table comes up empty or keeps runs of another cause
//   K2  a run served terminal_ok false with no verdict is missing from the Failed count and the cause filter
//   K3  the Runs link does not round-trip through the Runs URL state as status failed and that exact cause
describe('OMN-19919: one cause function for the trends, the filter and the link', () => {
  const typed = (id: string, minute: number, detail: string | null, cause: string | null, passed: unknown = 0) => ({
    ...run(id, minute, passed, detail ?? ''), quality_gate_detail: detail, terminal_ok: 0, terminal_failure_cause: cause,
  });
  const ROWS = [
    run('run-pass', 1, 1),
    typed('run-503', 2, 'HTTP 503: upstream unavailable', 'provider_error'),
    typed('run-mal', 3, 'MALFORMED: invalid syntax', 'provider_error'),
    typed('run-timeout', 4, 'MALFORMED: cut off', 'timeout'),
    typed('run-silent', 5, null, null, null),
  ];

  it('K1, K2: a typed cause in the trends narrows the latest runs to that cause only', () => {
    render(<RunFilterProvider><InsightsSection decisions={ROWS} now={NOW} /><RecentRunsTable decisions={ROWS} sessions={[]} now={NOW} /></RunFilterProvider>);
    const group = screen.getByRole('group', { name: 'Filter runs by result' });
    expect(within(group).getByRole('button', { name: /^Failed/ }).textContent).toBe('Failed 4');
    fireEvent.click(screen.getByRole('button', { name: 'Show runs failed by provider_error' }));
    expect(ids().sort()).toEqual(['run-503', 'run-mal']);
    fireEvent.click(screen.getByRole('button', { name: 'Show runs failed by Not recorded' }));
    expect(ids()).toEqual(['run-silent']);
    expect(causeLabelOf(ROWS[3]!)).toBe('timeout');
    expect(causeLabelOf(run('legacy', 6, 0, 'MALFORMED: x'))).toBe('MALFORMED');
  });

  it('K3: the Runs link carries status=failed and the exact cause through the Runs URL state', () => {
    for (const cause of ['provider_error', 'Not recorded', 'MALFORMED & co: 50%']) {
      const href = causeHref(cause);
      expect(href.startsWith('/runs?')).toBe(true);
      const view = readRunsSearch(href.slice('/runs'.length));
      expect([view.status, view.cause, view.query]).toEqual(['failed', cause, undefined]);
    }
  });
});
