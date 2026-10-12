// @vitest-environment jsdom
// OMN-19987: the Workflow page shows one run's steps as run-trace.v1 serves them. The order is the exposure's
// (the step sequence the delegate orchestrator assigned); the browser renders rows in the order it was given.
//
// Failure modes, each with a test below:
//   T1  the timeline re-orders what it was served (by step number, by time, or any other way);
//   T2  a step loses its time, duration or outcome, or a duration that was never measured reads 0 ms;
//   T3  a failed run marks the terminal, or nothing, instead of the step the terminal names, or hides its cause (WF-2);
//   T4  a run that succeeded after an earlier failed step is shown as having a failing step;
//   T5  the routing step drops its candidates, chosen backend or reason (WF-1);
//   T6  a run with no served steps renders a blank instead of a typed state;
//   T7  a step kind this page does not know is dropped instead of shown as served;
//   T8  a terminal that names a step that was not served marks some other step.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from './LocalDashboardPage';
import recordedChain from './local/omn19987.run-trace.recorded.json';

// The step events one real delegation emitted on a lab host on 2026-10-11 (run eb99e731), as published.
const recorded = recordedChain as Array<Record<string, unknown>>;

const base = { tenant_id: 't', correlation_id: 'r' };
const failedRun = [
  { ...base, step_sequence: 1, step_kind: 'request', started_at: '2026-10-11T10:00:00+00:00', duration_ms: null, outcome: 'succeeded', reason: 'research' },
  { ...base, step_sequence: 2, step_kind: 'routing_decision', started_at: '2026-10-11T10:00:00+00:00', duration_ms: null, outcome: 'succeeded', backend_id: 'local-coder', model_id: 'm', candidates: ['local', 'cheap_cloud'], reason: 'first choice: tier local' },
  { ...base, step_sequence: 3, step_kind: 'provider_call', started_at: '2026-10-11T10:00:01+00:00', duration_ms: 240000, outcome: 'failed', failure_cause: 'timeout', backend_id: 'local-coder', model_id: 'm', attempt_number: 1 },
  { ...base, step_sequence: 4, step_kind: 'terminal', started_at: '2026-10-11T10:04:01+00:00', duration_ms: 241000, outcome: 'failed', failure_cause: 'timeout', failing_step_sequence: 3 },
];

function items(): HTMLElement[] {
  return screen.getAllByRole('listitem');
}

function kinds(): string[] {
  return items().map((item) => item.querySelector('strong')?.textContent ?? '');
}

describe('OMN-19987 run timeline', () => {
  it('T1: renders the recorded run in the order it was served', () => {
    render(<RunTimeline steps={recorded} />);
    expect(kinds()).toEqual(['Request', 'Routing decision', 'Provider call', 'Quality gate', 'Terminal']);
  });

  it('T1: does not re-order rows served in another order', () => {
    // Served deliberately out of step order and out of time order: the page must show exactly this.
    const served = [recorded[4], recorded[0], recorded[2], recorded[1], recorded[3]];
    render(<RunTimeline steps={served} />);
    expect(kinds()).toEqual(['Terminal', 'Request', 'Provider call', 'Routing decision', 'Quality gate']);
  });

  it('T2: each step shows its time, duration and outcome as served', () => {
    render(<RunTimeline steps={recorded} />);
    const call = items()[2];
    expect(call.textContent).toContain(String(recorded[2].started_at));
    expect(call.textContent).toContain(`${String(recorded[2].duration_ms)} ms`);
    expect(call.textContent).toContain('succeeded');
  });

  it('T2: a duration that was not measured reads Not recorded, never 0 ms', () => {
    render(<RunTimeline steps={recorded} />);
    const request = items()[0];
    expect(request.textContent).toContain('Not recorded');
    expect(request.textContent).not.toContain('0 ms');
  });

  it('T3: a timed-out run marks the provider call the terminal names, with its cause, not the terminal', () => {
    render(<RunTimeline steps={failedRun} />);
    const [, , call, terminal] = items();
    expect(call.getAttribute('data-failing-step')).toBe('true');
    expect(within(call).getByText('Failed here')).toBeTruthy();
    expect(call.textContent).toContain('timeout');
    expect(terminal.getAttribute('data-failing-step')).toBeNull();
    expect(within(terminal).queryByText('Failed here')).toBeNull();
    expect(screen.getAllByText('Failed here')).toHaveLength(1);
  });

  it('T4: a run that succeeded after a failed step marks no failing step', () => {
    const recovered = [
      failedRun[0],
      failedRun[1],
      failedRun[2],
      { ...failedRun[1], step_sequence: 4, backend_id: 'glm-coder', reason: 'tier cheap_cloud, after timeout on local-coder' },
      { ...failedRun[2], step_sequence: 5, outcome: 'succeeded', failure_cause: null, backend_id: 'glm-coder', attempt_number: 2 },
      { ...failedRun[3], step_sequence: 6, outcome: 'succeeded', failure_cause: null, failing_step_sequence: null },
    ];
    render(<RunTimeline steps={recovered} />);
    expect(screen.queryByText('Failed here')).toBeNull();
    // The earlier failure is still shown on its own step.
    expect(items()[2].textContent).toContain('failed');
    expect(items()[2].textContent).toContain('timeout');
  });

  it('T5: the routing step shows its candidates in the order served, the chosen backend and the reason', () => {
    render(<RunTimeline steps={recorded} />);
    const routing = items()[1];
    const candidates = recorded[1].candidates as string[];
    expect(routing.textContent).toContain(candidates.join(', '));
    expect(routing.textContent).toContain(String(recorded[1].backend_id));
    expect(routing.textContent).toContain(String(recorded[1].reason));
  });

  it('T6: a run with no served steps says so', () => {
    render(<RunTimeline steps={[]} />);
    expect(screen.getByRole('status').textContent).toContain('No steps recorded for this run');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('T7: a step kind this page does not know is shown as served, not dropped', () => {
    render(<RunTimeline steps={[...recorded.slice(0, 2), { ...recorded[2], step_kind: 'cache_lookup' }]} />);
    expect(kinds()).toEqual(['Request', 'Routing decision', 'cache_lookup']);
  });

  it('T8: a terminal naming a step that was not served marks nothing', () => {
    const missing = [failedRun[0], failedRun[1], { ...failedRun[3], failing_step_sequence: 3 }];
    render(<RunTimeline steps={missing} />);
    expect(screen.queryByText('Failed here')).toBeNull();
    // The cause is still on the terminal row itself.
    expect(items()[2].textContent).toContain('timeout');
  });
});
