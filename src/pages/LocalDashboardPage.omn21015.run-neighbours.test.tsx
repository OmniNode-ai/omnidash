// @vitest-environment jsdom
// OMN-21015: on Workflow, a run that is among the served runs has links to the run before it and the run after it,
// so a reader walks the runs without going back to the list (Lakshman, chat 2026-10-13: "improve more?").
//
// Failure modes, each with a test below:
//   W1  a link opens another run than the neighbour in the list's newest-first order, or follows the wire's order;
//   W2  the newest run offers a newer run, or the oldest an older one;
//   W3  a run that is not among the served runs (a pasted id) gets links to runs it has no place between;
//   W4  a run with no recorded id is offered as a neighbour, though it has nothing to open;
//   W5  with one served run an empty navigation is drawn.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunNeighbours } from './LocalDashboardPage';
import { workflowHref } from '@/navigation/workflow-url-state';

const run = (id: string | null, minute: number) => ({ correlation_id: id, written_at: `2026-10-04T06:${String(minute).padStart(2, '0')}:00Z`, created_at: `2026-10-04T06:${String(minute).padStart(2, '0')}:00Z` });
// Served out of order on purpose.
const RUNS = [run('run-b', 20), run('run-d', 40), run('run-a', 10), run('run-c', 30)];
function links(): Record<string, string | null> {
  const nav = screen.queryByRole('navigation', { name: 'Neighbouring runs' });
  if (nav === null) return {};
  return Object.fromEntries(within(nav).getAllByRole('link').map((link) => [link.textContent ?? '', link.getAttribute('href')]));
}

describe('OMN-21015: from one run to the next', () => {
  it('W1: a run in the middle links to the newer and the older run of the newest-first list', () => {
    render(<RunNeighbours decisions={RUNS} runId="run-b" />);
    expect(links()).toEqual({ 'Newer run': workflowHref('run-c'), 'Older run': workflowHref('run-a') });
  });

  it('W2: the newest run has no newer run and the oldest no older run', () => {
    const { unmount } = render(<RunNeighbours decisions={RUNS} runId="run-d" />);
    expect(links()).toEqual({ 'Older run': workflowHref('run-c') });
    unmount();
    render(<RunNeighbours decisions={RUNS} runId="run-a" />);
    expect(links()).toEqual({ 'Newer run': workflowHref('run-b') });
  });

  it('W3: a run that is not among the served runs has no neighbours', () => {
    render(<RunNeighbours decisions={RUNS} runId="run-pasted" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('W4: a run with no recorded id is not a neighbour; the next run with one is', () => {
    render(<RunNeighbours decisions={[...RUNS, run(null, 25), run('', 15)]} runId="run-b" />);
    expect(links()).toEqual({ 'Newer run': workflowHref('run-c'), 'Older run': workflowHref('run-a') });
  });

  it('W5: with one served run there is no navigation', () => {
    render(<RunNeighbours decisions={[run('run-a', 10)]} runId="run-a" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
