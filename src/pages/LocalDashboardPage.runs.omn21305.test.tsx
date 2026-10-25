// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunsTable } from './LocalDashboardPage';

// OMN-21305 AC3: the keyless fresh-HOME run, refused before dispatch, appears on Runs under status=failed with its
// correlation id and its cause. The fixture is the decisions.v1 row the lab served for that run on 2026-10-24
// (correlation 7c785ca1, omnimarket 29b6bcf4), trimmed to the fields the Runs reader reads.
//
// Failure modes, each with a test below:
//   R1  the refused row is missing from status=failed (its terminal_ok 0 not read as failed)
//   R2  the row loses its correlation id, or the id is not the link into its run
//   R3  the cause shows the raw code, the long refusal detail, Not recorded, or nothing, instead of its label
//   R4  the cause filter does not offer the refusal cause, or choosing it keeps other runs
const NOW = Date.parse('2026-10-24T13:00:00Z');
const REFUSED_ID = '7c785ca1-52c0-471f-bcba-3df77bdab1bd';

const refusedRow: Record<string, unknown> = {
  correlation_id: REFUSED_ID,
  task_type: 'document',
  model_name: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  quality_gate_passed: 0,
  quality_gate_detail:
    '[ONEX_CORE_041_INVALID_CONFIGURATION] No local model is declared on this machine: no local rung has an endpoint.',
  latency_ms: 0,
  tokens_input: 0,
  tokens_output: 0,
  terminal_ok: 0,
  terminal_failure_cause: 'refused_before_dispatch',
  cost_usd: 0,
  data_source: 'real',
  created_at: '2026-10-24T05:12:26.182642+00:00',
  written_at: '2026-10-24T05:12:26.184758+00:00',
};

const passedRow: Record<string, unknown> = {
  correlation_id: 'run-passed-control',
  task_type: 'document',
  model_name: 'Qwen3.8-27B',
  quality_gate_passed: 1,
  quality_gate_detail: 'completed',
  terminal_ok: 1,
  terminal_failure_cause: null,
  tokens_input: 162,
  tokens_output: 52,
  data_source: 'real',
  created_at: '2026-10-24T05:10:00Z',
  written_at: '2026-10-24T05:10:00Z',
};

// A long correlation id is shown shortened; its run link carries the whole id as title and accessible name.
const listed = () =>
  (screen.getAllByRole('row').slice(1) as HTMLTableRowElement[]).map(
    (row) => row.cells[0]!.querySelector('a')?.getAttribute('title') ?? row.cells[0]!.textContent,
  );
const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());

describe('OMN-21305 AC3: a run refused before dispatch shows on Runs under status=failed', () => {
  it('R1, R2: status=failed lists the refused run by its correlation id, linked into its run', () => {
    render(<RunsTable now={NOW} decisions={[refusedRow, passedRow]} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    expect(listed()).toEqual([REFUSED_ID]);
    const row = screen.getByRole('row', { name: new RegExp(`^${REFUSED_ID}`) });
    expect(within(row).getByRole('link', { name: REFUSED_ID })).toHaveAttribute(
      'href',
      `/workflow?correlation_id=${REFUSED_ID}`,
    );
    expect(within(row).getAllByRole('cell')[headers().indexOf('Status')]!.textContent).toBe('failed');
  });

  it('R3: the cause reads Refused before dispatch, never the raw code, the detail or Not recorded', () => {
    render(<RunsTable now={NOW} decisions={[refusedRow, passedRow]} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    const row = screen.getByRole('row', { name: new RegExp(`^${REFUSED_ID}`) });
    const cause = within(row).getAllByRole('cell')[headers().indexOf('Cause')]!;
    expect(within(cause).getByText('Refused before dispatch')).toBeInTheDocument();
    expect(cause.textContent).not.toContain('refused_before_dispatch');
    expect(cause.textContent).not.toBe('Not recorded');
  });

  it('R4: the cause filter offers the refusal cause and keeps only the refused run', () => {
    render(<RunsTable now={NOW} decisions={[refusedRow, passedRow]} sessions={[]} />);
    const options = within(screen.getByLabelText('Cause')).getAllByRole('option').map((option) => option.getAttribute('value'));
    expect(options).toContain('refused_before_dispatch');
    fireEvent.change(screen.getByLabelText('Cause'), { target: { value: 'refused_before_dispatch' } });
    expect(listed()).toEqual([REFUSED_ID]);
  });

  it('control: without the refused row, status=failed lists no run', () => {
    render(<RunsTable now={NOW} decisions={[passedRow]} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    expect(screen.queryByRole('row', { name: new RegExp(`^${REFUSED_ID}`) })).not.toBeInTheDocument();
  });
});
