// @vitest-environment jsdom
// OMN-19787 AC-3: the acceptance-eval panel shows every class of the latest eval run with its false-pass bound.
// False passes and their bound come before false refusals, and a REFUSED line reads as under-powered, never passing.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AcceptanceEvalRow } from '@/services/event-dash-api';
import { AcceptanceEvalTable, latestRunClassRows } from './AcceptanceEvalPanel';

function row(over: Partial<AcceptanceEvalRow>): AcceptanceEvalRow {
  return {
    eval_run_id: 'run-new', task_class: 'code_review', stratum: 'all', arm: 'recorded', gate_version: 'gate-v3',
    accepted_n: 114, false_pass_count: 85, false_pass_rate: 0.75, false_pass_upper_bound: 0.81,
    false_pass_line_verdict: 'missed', false_pass_required_n: 100, refused_n: 20, false_refusal_count: 4,
    false_refusal_upper_bound: 0.4, false_refusal_line_verdict: 'refused', undetermined_share: 0.1, flip_rate: null,
    observed_at: '2026-10-30T10:00:00Z',
    ...over,
  };
}

const LATEST: AcceptanceEvalRow[] = [
  row({ task_class: 'code_review' }),
  row({ task_class: 'code_review', stratum: 'accepted' }),
  row({ task_class: 'test', accepted_n: 40, false_pass_count: 2, false_pass_upper_bound: 0.15,
    false_pass_line_verdict: 'refused' }),
  row({ task_class: 'summarization', accepted_n: 300, false_pass_count: 1, false_pass_upper_bound: 0.02,
    false_pass_line_verdict: 'met' }),
  row({ task_class: 'document', false_pass_upper_bound: null, false_pass_line_verdict: 'refused', accepted_n: 0,
    false_pass_count: 0 }),
];
const OLDER: AcceptanceEvalRow[] = [
  row({ eval_run_id: 'run-old', task_class: 'planning', observed_at: '2026-10-01T10:00:00Z' }),
];

describe('latestRunClassRows', () => {
  it('keeps only the latest run, one row per class, the all-stratum rollup first', () => {
    const rows = latestRunClassRows([...OLDER, ...LATEST]);
    expect(rows.map((r) => r.task_class)).toEqual(['code_review', 'document', 'summarization', 'test']);
    expect(rows.every((r) => r.eval_run_id === 'run-new')).toBe(true);
    expect(rows.find((r) => r.task_class === 'code_review')?.stratum).toBe('all');
  });

  it('answers no rows for no rows', () => {
    expect(latestRunClassRows([])).toEqual([]);
  });
});

describe('AcceptanceEvalTable', () => {
  it('shows every class of the latest run with its false-pass bound', () => {
    render(<AcceptanceEvalTable rows={[...OLDER, ...LATEST]} />);
    const table = screen.getByTestId('acceptance-eval-table');
    const classes = within(table).getAllByTestId('acceptance-eval-class');
    expect(classes.map((c) => c.getAttribute('data-class'))).toEqual(['code_review', 'document', 'summarization', 'test']);
    // Shown in words, never as a snake_case field name.
    expect(classes.map((c) => c.textContent)).toEqual(['code review', 'document', 'summarization', 'test']);
    expect(within(table).queryByText('planning')).toBeNull();
    expect(table.textContent).toContain('≤\u00a081.0%');
    expect(table.textContent).toContain('≤\u00a02.0%');
  });

  it('puts false passes and their bound before false refusals', () => {
    render(<AcceptanceEvalTable rows={LATEST} />);
    const headers = Array.from(screen.getByTestId('acceptance-eval-table').querySelectorAll('.dt-head > div'))
      .map((h) => h.textContent ?? '').filter(Boolean);
    const fp = headers.indexOf('False passes');
    const bound = headers.indexOf('False-pass bound');
    const fr = headers.indexOf('False refusals');
    expect(fp).toBeGreaterThan(-1);
    expect(bound).toBe(fp + 1);
    expect(fr).toBeGreaterThan(bound);
  });

  it('reads a REFUSED line as under-powered, never as passing', () => {
    render(<AcceptanceEvalTable rows={LATEST} />);
    const verdicts = screen.getAllByTestId('acceptance-eval-verdict');
    const byClass = Object.fromEntries(verdicts.map((v) => [v.getAttribute('data-class'), v.textContent]));
    expect(byClass.test).toMatch(/under-powered/i);
    expect(byClass.test).not.toMatch(/met|pass/i);
    expect(byClass.summarization).toBe('Met');
    expect(byClass.code_review).toBe('Missed');
  });

  it('says a missing bound is not measured, never zero', () => {
    render(<AcceptanceEvalTable rows={LATEST} />);
    const doc = screen.getAllByTestId('acceptance-eval-bound').find((b) => b.getAttribute('data-class') === 'document');
    expect(doc?.textContent).toBe('Not measured');
  });

  it('renders an honest empty state when no run is served', () => {
    render(<AcceptanceEvalTable rows={[]} reason="HTTP 503" />);
    expect(screen.queryByTestId('acceptance-eval-table')).toBeNull();
    expect(screen.getByText(/No acceptance-eval run/)).toBeTruthy();
  });
});
