// @vitest-environment jsdom
// OMN-21015: on Runs, a run's model and backend in its row are buttons that set that filter, and one button clears
// every filter. The filters are the ones the row of selects already has; this is a second way to set them, from the
// value a reader is looking at (Lakshman, chat 2026-10-13: interactive pages; "improve more?").
//
// Failure modes, each with a test below:
//   Q1  a click on a model or backend sets another filter, or another value than the one clicked;
//   Q2  the list does not narrow to that value, or the select does not show it;
//   Q3  the pager stays on a later page of the old list;
//   Q4  a run with no recorded backend cannot be filtered to from its row;
//   Q5  Clear filters is offered when no filter is set, or missing when one is;
//   Q6  Clear filters leaves a filter set;
//   Q7  with the address in step, the address does not carry the filter the click set.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));

import { RunsTable } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-04T07:00:00Z');
function decision(id: string, minute: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const at = `2026-10-04T06:${String(minute).padStart(2, '0')}:00Z`;
  return {
    correlation_id: id, written_at: at, created_at: at, model_name: 'model-a', quality_gate_passed: true, quality_gate_detail: 'completed',
    latency_ms: 813, tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: 0.92,
    backend_id: 'local-coder', host: 'lab-host', ...extra,
  };
}
const RUNS = [
  decision('run-1', 10),
  decision('run-2', 20, { model_name: 'model-b', backend_id: 'byok' }),
  decision('run-3', 30, { backend_id: null }),
  decision('run-4', 40, { model_name: 'model-b' }),
];
const rowIds = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent ?? '');
const select = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;
function rowOf(id: string): HTMLElement {
  return within(screen.getByRole('table')).getAllByRole('row').find((row) => row.querySelector('td')?.textContent === id)!;
}

beforeEach(() => { window.history.replaceState(null, '', '/runs'); });

describe('OMN-21015: a run\'s model and backend set the filter from its row', () => {
  it('Q1, Q2: a click on a model filters the list to that model and the select shows it', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    // A filter chosen before the click stays: the click sets one filter and touches no other.
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'passed' } });
    fireEvent.click(within(rowOf('run-2')).getByRole('button', { name: 'Show only runs of model model-b' }));
    expect(rowIds()).toEqual(['run-4', 'run-2']);
    expect([select('Model'), select('Backend'), select('Status'), select('Cause'), select('Window')]).toEqual(['model-b', 'all', 'passed', 'all', 'all']);
  });

  it('Q1, Q2: a click on a backend filters the list to that backend, on top of a model already chosen', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    fireEvent.click(within(rowOf('run-2')).getByRole('button', { name: 'Show only runs of model model-b' }));
    fireEvent.click(within(rowOf('run-2')).getByRole('button', { name: 'Show only runs of backend byok' }));
    expect(rowIds()).toEqual(['run-2']);
    expect([select('Model'), select('Backend')]).toEqual(['model-b', 'byok']);
  });

  it('Q3: the pager goes back to the first page of the narrowed list', () => {
    // One run a page, so the narrowed list (run-3, run-1) still has a second page to be left on by mistake.
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} pageSize={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rowIds()).toEqual(['run-3']);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rowIds()).toEqual(['run-1']);
    fireEvent.click(within(rowOf('run-1')).getByRole('button', { name: 'Show only runs of model model-a' }));
    expect(rowIds()).toEqual(['run-3']);
    expect(screen.getByText('Runs 1–1 of 2')).toBeTruthy();
  });

  it('Q4: a run with no recorded backend filters to the runs with none', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    fireEvent.click(within(rowOf('run-3')).getByRole('button', { name: 'Show only runs of backend Not recorded' }));
    expect(rowIds()).toEqual(['run-3']);
    expect(select('Backend')).toBe('Not recorded');
  });

  it('Q5, Q6: Clear filters is there only while a filter is set, and clears every one', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'passed' } });
    fireEvent.click(within(rowOf('run-2')).getByRole('button', { name: 'Show only runs of model model-b' }));
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'today' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect([select('Model'), select('Backend'), select('Status'), select('Cause'), select('Window')]).toEqual(['all', 'all', 'all', 'all', 'all']);
    expect(rowIds()).toEqual(['run-4', 'run-3', 'run-2', 'run-1']);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it.each([
    ['Status', 'passed'], ['Model', 'model-b'], ['Backend', 'byok'], ['Window', 'today'],
  ])('Q5: Clear filters is offered when only %s is set', (label, value) => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('Q5: Clear filters is offered when only a cause is set', () => {
    render(<RunsTable now={NOW} decisions={[...RUNS, decision('run-5', 50, { quality_gate_passed: false, quality_gate_detail: 'quality_gate_failed' })]} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Cause'), { target: { value: 'quality_gate_failed' } });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('Q5: when the filters leave no run, Clear filters is still offered', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    expect(screen.getByRole('status').textContent).toBe('No runs match these filters');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rowIds()).toHaveLength(4);
  });

  it('Q7: with the address in step, a click writes the filter into the address', () => {
    render(<RunsTable now={NOW} decisions={RUNS} sessions={[]} syncUrl />);
    fireEvent.click(within(rowOf('run-2')).getByRole('button', { name: 'Show only runs of backend byok' }));
    expect(new URLSearchParams(window.location.search).get('backend')).toBe('byok');
    expect(rowIds()).toEqual(['run-2']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(new URLSearchParams(window.location.search).get('backend')).toBeNull();
  });
});
