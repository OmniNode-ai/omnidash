// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of the Runs table, 2026-11-11: "when we click any row that should open as popup in
// center with full details"). A row opened a narrow side panel beside the table that squeezed it and listed some fields.
// It now opens the kit's dialog, centred over the page, with every recorded field of the run.
// Failure modes:
//   R1  a row opens no modal dialog, or the dialog leaves out a recorded field (backend, host, requested model, ...);
//   R2  Escape does not close it, or focus is not returned to the row that opened it;
//   R3  the Close button or a click on the backdrop does not close it;
//   R4  the old side panel is still drawn beside the table.
//   R5  when the run leaves the shown runs (a refresh or a filter), the dialog switches to another run instead of closing
//       (the side panel's rule: a reader of the dialog would be shown a run they did not open).
//   R6  the dialog's fields do not follow the table's columns (operator 2026-11-11: with both switches off it shows what
//       the table shows; "Show all run fields" and "Routing columns" add their fields to it as they add columns).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunsTable } from '@/pages/LocalDashboardPage';

afterEach(cleanup);
const NOW = Date.parse('2026-10-24T06:00:00Z');
const run: Record<string, unknown> = {
  correlation_id: 'ab728126-ec55-473c-b544-cd206379fa32', task_type: 'document', model_name: 'Qwen3.8-27B',
  requested_model: 'qwen-coder', backend_id: 'local-coder', host: 'lab-201', cost_tier_name: 'local', latency_ms: 1800,
  quality_gate_passed: 1, quality_gate_detail: 'completed', terminal_ok: 1, terminal_failure_cause: null, actual_score: '1.000',
  required_bar: '0.8', tokens_input: 604, tokens_output: 102, data_source: 'real',
  created_at: '2026-10-24T05:10:00Z', written_at: '2026-10-24T05:10:00Z',
};

const terms = (dialog: HTMLElement) => [...dialog.querySelectorAll('dt')].map(term => term.textContent);

function openRun() {
  render(<RunsTable now={NOW} decisions={[run]} sessions={[]} />);
  const row = screen.getAllByRole('row').slice(1)[0]!;
  row.focus();
  fireEvent.click(row.cells[2]!);
  return row;
}

describe('OMN-23330: a run row opens a centred dialog with the full run', () => {
  it('R1 R4: a modal dialog names the run and lists the fields the table shows; no side panel', () => {
    openRun();
    const dialog = screen.getByRole('dialog', { name: 'Selected run' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('ab728126-ec55-473c-b544-cd206379fa32');
    expect(terms(dialog)).toEqual(['Cause', 'Model', 'Tokens in', 'Tokens out', 'Cost', 'Modelled saving', 'Duration']);
    for (const [term, value] of [['Model', 'Qwen3.8-27B'], ['Duration', '1.8 s'], ['Tokens in', '604'], ['Tokens out', '102']] as const) {
      expect(within(dialog).getByText(term, { selector: 'dt' }).closest('div')!.textContent, term).toContain(value);
    }
    expect(screen.queryByRole('complementary', { name: 'Selected run' })).toBeNull();
  });

  it('R6: each switch adds its columns\' fields to the dialog, in the table\'s order', () => {
    openRun();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all run fields' }));
    fireEvent.click(screen.getAllByRole('row').slice(1)[0]!.cells[2]!);
    expect(terms(screen.getByRole('dialog'))).toEqual(['Cause', 'Model', 'Tokens in', 'Tokens out', 'Cost', 'Modelled saving', 'Duration',
      'Backend', 'Host', 'Baseline model', 'Basis', 'Task', 'Tokens to compliance', 'Route tier', 'Quality score', 'Required bar']);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Routing columns' }));
    fireEvent.click(screen.getAllByRole('row').slice(1)[0]!.cells[2]!);
    const all = terms(screen.getByRole('dialog'));
    expect(all.slice(-3)).toEqual(['Requested model', 'Finish reason', 'Escalations']);
    expect(within(screen.getByRole('dialog')).getByText('Requested model', { selector: 'dt' }).closest('div')!.textContent).toContain('qwen-coder');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all run fields' }));
    fireEvent.click(screen.getAllByRole('row').slice(1)[0]!.cells[2]!);
    expect(terms(screen.getByRole('dialog'))).toEqual(['Cause', 'Model', 'Tokens in', 'Tokens out', 'Cost', 'Modelled saving', 'Duration',
      'Requested model', 'Finish reason', 'Escalations']);
  });

  it('R2: Escape closes the dialog and returns focus to the row', () => {
    const row = openRun();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Selected run' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('R3: the Close button and a click on the backdrop close the dialog', () => {
    openRun();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Selected run' })).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('row').slice(1)[0]!.cells[2]!);
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('R5: a refresh that drops the open run closes the dialog rather than showing another run', () => {
    const other = { ...run, correlation_id: 'other-run-0000', created_at: '2026-10-24T05:20:00Z', written_at: '2026-10-24T05:20:00Z' };
    const view = render(<RunsTable now={NOW} decisions={[run, other]} sessions={[]} />);
    fireEvent.click(screen.getAllByRole('row').find(row => row.textContent?.includes('ab728126'))!.cells[2]!);
    expect(screen.getByRole('dialog', { name: 'Selected run' }).textContent).toContain('ab728126-ec55-473c-b544-cd206379fa32');
    view.rerender(<RunsTable now={NOW} decisions={[other]} sessions={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
