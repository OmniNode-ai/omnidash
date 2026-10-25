// @vitest-environment jsdom
// OMN-21166 part 14, AC75 and AC76 on the Runs list itself. Failure modes:
//   W1  a header click does not reorder the rows, or the header does not say which way it sorts (aria-sort);
//   W2  the export carries only the visible page, or rows the search hides;
//   W3  the export carries the table's formatted cells instead of the served rows.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunsTable } from '@/pages/LocalDashboardPage';

const decision = (id: string, latency: number | null, model: string, minute: number) => ({
  correlation_id: id, written_at: `2026-10-25T10:${String(minute).padStart(2, '0')}:00Z`, created_at: `2026-10-25T10:${String(minute).padStart(2, '0')}:00Z`,
  quality_gate_passed: true, model_name: model, latency_ms: latency, tokens_input: 10, tokens_output: 2, task_type: 'document',
});
const DECISIONS = [decision('run-a', 900, 'local-a', 1), decision('run-b', 10000, 'local-a', 2), decision('run-c', null, 'cloud-b', 3), decision('run-d', 45000, 'local-a', 4)];

let exported: Blob[] = [];
beforeEach(() => {
  exported = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => { exported.push(blob); return 'blob:test'; }, revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const rowIds = () => screen.getAllByRole('row').slice(1).map(row => row.querySelector('a, code')?.textContent ?? row.textContent ?? '');
const readBlob = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });

describe('Runs list sort and export', () => {
  it('W1: Duration sorts largest first, then smallest first, with the unrecorded run last both times', () => {
    render(<RunsTable decisions={DECISIONS} sessions={[]} now={Date.parse('2026-10-25T12:00:00Z')} />);
    const header = () => screen.getByRole('columnheader', { name: /Duration/ });
    expect(header()).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    expect(rowIds().map(text => text.slice(0, 5))).toEqual(['run-d', 'run-b', 'run-a', 'run-c']);
    fireEvent.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(rowIds().map(text => text.slice(0, 5))).toEqual(['run-a', 'run-b', 'run-d', 'run-c']);
  });

  it('W2, W3: JSON export is every served row the search matches, across pages, as served', async () => {
    render(<RunsTable decisions={DECISIONS} sessions={[]} pageSize={1} now={Date.parse('2026-10-25T12:00:00Z')} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search runs' }), { target: { value: 'local-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    const rows = JSON.parse(await readBlob(exported[0]!)) as Array<Record<string, unknown>>;
    expect(rows.map(row => row.correlation_id).sort()).toEqual(['run-a', 'run-b', 'run-d']);
    expect(rows.find(row => row.correlation_id === 'run-a')).toEqual(DECISIONS[0]);
  });

  it('W2: CSV export follows the same rows, header first', async () => {
    render(<RunsTable decisions={DECISIONS} sessions={[]} now={Date.parse('2026-10-25T12:00:00Z')} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search runs' }), { target: { value: 'cloud-b' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export CSV' })); });
    const lines = (await readBlob(exported[0]!)).split('\r\n');
    expect(lines[0]!.split(',')).toContain('correlation_id');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('run-c');
  });
});
