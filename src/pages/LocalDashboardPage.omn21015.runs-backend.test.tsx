// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { RunsTable } from './LocalDashboardPage';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch } from '@/navigation/runs-url-state';

// OMN-21015 AC8 (requirement RU-1): the Runs list filters by backend as well as by status, cause, model and window.
// The backend is the served `backend_id` of delegation.decisions.v1; nothing here is derived from it.
//
// Failure modes these tests are written against:
//   - a row of another backend is still listed after one backend is chosen (the criterion's falsifier)
//   - a run whose backend was not served is matched under some other backend, or cannot be found at all
//   - the backend filter replaces another filter instead of narrowing with it
//   - a filter change leaves the reader on a page that no longer exists
//   - the filter is not in the address, so a filtered view cannot be shared or reloaded
//   - an address naming a backend the data no longer has shows an empty select instead of saying so

const NOW = Date.parse('2026-10-02T10:12:00Z');

function decision(id: string, writtenAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id,
    written_at: writtenAt,
    created_at: writtenAt,
    model_name: 'Qwen3.8-27B',
    backend_id: 'local-qwen-coder',
    quality_gate_passed: true,
    quality_gate_detail: 'completed',
    tokens_input: 162,
    tokens_output: 52,
    ...extra,
  };
}

const decisions = [
  decision('run-local-1', '2026-10-02T10:07:00Z'),
  decision('run-gemini', '2026-10-02T09:30:00Z', { backend_id: 'byok-gemini', model_name: 'gemini-3.5-flash-lite' }),
  decision('run-local-2', '2026-10-02T09:00:00Z', { model_name: 'qwen3-coder' }),
  decision('run-unserved', '2026-10-02T08:00:00Z', { backend_id: null }),
];

function listedRuns(): string[] {
  return screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
}

describe('RunsTable filters by backend (OMN-21015 AC8, RU-1)', () => {
  it('offers each served backend once, and the unserved one by its typed name', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const options = [...(screen.getByLabelText('Backend') as HTMLSelectElement).options].map((option) => option.value);
    expect(options).toEqual(['all', 'Not recorded', 'byok-gemini', 'local-qwen-coder']);
  });

  it('lists no row of another backend once one is chosen', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'local-qwen-coder' } });
    const rows = listedRuns();
    expect(rows).toHaveLength(2);
    expect(rows.every((text) => text.includes('run-local-'))).toBe(true);
    expect(rows.some((text) => text.includes('run-gemini') || text.includes('run-unserved'))).toBe(false);
  });

  it('finds the run whose backend was not served under Not recorded, and only there', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'Not recorded' } });
    const rows = listedRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('run-unserved');
  });

  it('narrows together with the model filter', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'local-qwen-coder' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'qwen3-coder' } });
    const rows = listedRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('run-local-2');
  });

  it('goes back to the first page when the backend changes', () => {
    const many = Array.from({ length: 5 }, (_, index) => decision(`run-${index}`, `2026-10-02T0${index}:00:00Z`));
    render(<RunsTable now={NOW} decisions={[...many, decisions[1]!]} sessions={[]} pageSize={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText(/^Runs 3–4 of 6$/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'local-qwen-coder' } });
    expect(screen.getByText(/^Runs 1–2 of 5$/)).toBeInTheDocument();
  });

  it('says so when no run has the chosen backend', () => {
    render(<RunsTable now={NOW} decisions={[decisions[0]!]} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'Not recorded' } });
    expect(screen.getByText('No runs match these filters')).toBeInTheDocument();
  });
});

describe('Runs address carries the backend filter (OMN-21015 AC8)', () => {
  it('reads all when the address names no backend', () => {
    expect(readRunsSearch('').backend).toBe('all');
    expect(DEFAULT_RUNS_VIEW.backend).toBe('all');
  });

  it('reads the backend the address names, beside the other filters', () => {
    const view = readRunsSearch('?backend=byok-gemini&status=failed&window=today');
    expect(view).toMatchObject({ backend: 'byok-gemini', status: 'failed', span: 'today' });
  });

  it('writes the backend, omits it when it is all, and keeps unrelated parameters', () => {
    expect(writeRunsSearch('?tenant=acme', { ...DEFAULT_RUNS_VIEW, backend: 'local-qwen-coder' }))
      .toBe('tenant=acme&backend=local-qwen-coder');
    expect(writeRunsSearch('?tenant=acme&backend=local-qwen-coder', DEFAULT_RUNS_VIEW)).toBe('tenant=acme');
  });

  it('round-trips a backend whose name needs encoding', () => {
    const written = writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, backend: 'lab host/coder & co' });
    expect(readRunsSearch(`?${written}`).backend).toBe('lab host/coder & co');
  });
});

describe('Runs address and table agree (OMN-21015 AC8)', () => {
  function atAddress(path: string, rows: Record<string, unknown>[]) {
    const { hook, searchHook, history } = memoryLocation({ path, record: true });
    render(
      <Router hook={hook} searchHook={searchHook}>
        <RunsTable now={NOW} decisions={rows} sessions={[]} syncUrl />
      </Router>,
    );
    return history;
  }

  it('filters by the backend the address names', () => {
    atAddress('/runs?backend=byok-gemini', decisions);
    const rows = listedRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('run-gemini');
  });

  it('names a backend the data does not have instead of showing an empty choice', () => {
    atAddress('/runs?backend=retired-backend', decisions);
    const select = screen.getByLabelText('Backend') as HTMLSelectElement;
    expect(select.value).toBe('retired-backend');
    expect(select.selectedOptions[0]?.textContent).toBe('retired-backend (not in current data)');
    expect(screen.getByText('No runs match these filters')).toBeInTheDocument();
  });

  it('puts the chosen backend in the address', () => {
    const history = atAddress('/runs', decisions);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'local-qwen-coder' } });
    expect(history?.at(-1)).toBe('/runs?backend=local-qwen-coder');
  });
});
