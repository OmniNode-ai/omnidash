// @vitest-environment jsdom
// OMN-21015 AC3: the Runs list shows each run's modelled saving against its named baseline, and a typed not-measured
// state for a run that was not measured, never 0. The figure and its labels are served per run on
// delegation.decisions.v1 (Jonah, 2026-10-13T06:59Z and 2026-10-14T04:50Z); the page formats them and computes nothing.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { RunsTable } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-10-14T06:00:00Z');

// Constructed rows in the served decisions.v1 shape, with the four per-run fields the backend serves.
function run(id: string, at: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id, written_at: at, created_at: at, model_name: 'Qwen3.8-27B', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 800, tokens_input: 1000, tokens_output: 200, task_type: 'research',
    cost_tier_name: 'local', cost_usd: '0', backend_id: 'local-coder', data_source: 'real',
    modelled_savings_usd: null, savings_baseline_model: null, savings_pricing_manifest_version: null,
    savings_measurement: null,
    ...extra,
  };
}

function savingCell(rowName: RegExp): string {
  const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
  const column = headers.indexOf('Modelled saving');
  expect(column, `headers: ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
  return within(screen.getByRole('row', { name: rowName })).getAllByRole('cell')[column]!.textContent ?? '';
}

describe('OMN-21015 AC3: savings per run on the Runs list', () => {
  it('R1: a measured run shows its served saving and names the baseline it was priced against', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('measured-run', '2026-10-14T05:00:00Z', {
      modelled_savings_usd: '0.012345', savings_baseline_model: 'claude-sonnet-5-5', savings_measurement: 'measured',
    })]} />);
    expect(savingCell(/measured-run/)).toBe('$0.012345 vs claude-sonnet-5-5');
  });

  it('R2: a run whose tokens were not recorded says so, and shows no number', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('no-tokens', '2026-10-14T05:00:00Z', {
      savings_measurement: 'unknown_tokens',
    })]} />);
    expect(savingCell(/no-tokens/)).toBe('Not measured: tokens not recorded');
  });

  it('R3: a run whose cost was not recorded says so, and shows no number', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('no-cost', '2026-10-14T05:00:00Z', {
      savings_measurement: 'unknown_spend',
    })]} />);
    expect(savingCell(/no-cost/)).toBe('Not measured: cost not recorded');
  });

  it('R11: a run whose baseline could not be resolved says so, and shows no number', () => {
    // The backend serves this state when the run has tokens and cost but no baseline model to price it against.
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('no-baseline', '2026-10-14T05:00:00Z', {
      savings_measurement: 'baseline_unresolved',
    })]} />);
    const text = savingCell(/no-baseline/);
    expect(text).toBe('Not measured: baseline not resolved');
    expect(text).not.toMatch(/\d/);
  });

  it('R12: a run with no recorded time says so, and shows no number', () => {
    // The backend cannot pick a pricing manifest without the run's time, so it serves this state with no figure.
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('no-time', '2026-10-14T05:00:00Z', {
      savings_measurement: 'unknown_timestamp',
    })]} />);
    const text = savingCell(/no-time/);
    expect(text).toBe('Not measured: time not recorded');
    expect(text).not.toMatch(/\d/);
  });

  it('R4: a run served with no figure and no measurement state reads Not measured, never 0', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('unstamped', '2026-10-14T05:00:00Z')]} />);
    const text = savingCell(/unstamped/);
    expect(text).toBe('Not measured');
    expect(text).not.toMatch(/\d/);
  });

  it('R5: a measured saving of zero is shown as zero, because it was measured', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('zero', '2026-10-14T05:00:00Z', {
      modelled_savings_usd: '0', savings_baseline_model: 'claude-sonnet-5-5', savings_measurement: 'measured',
    })]} />);
    expect(savingCell(/zero/)).toBe('$0.00 vs claude-sonnet-5-5');
  });

  it('R8: the served decimal is shown digit for digit, never through a binary float', () => {
    // Found by independent review: Number('123456789.123456789') prints 123456789.12345679.
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('precise', '2026-10-14T05:00:00Z', {
      modelled_savings_usd: '123456789.123456789', savings_baseline_model: 'claude-sonnet-5-5', savings_measurement: 'measured',
    })]} />);
    expect(savingCell(/precise/)).toBe('$123456789.123456789 vs claude-sonnet-5-5');
  });

  it('R9: a negative saving (the run cost more than its baseline) keeps its sign before the dollar', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('dearer', '2026-10-14T05:00:00Z', {
      modelled_savings_usd: '-0.5', savings_baseline_model: 'claude-sonnet-5-5', savings_measurement: 'measured',
    })]} />);
    expect(savingCell(/dearer/)).toBe('-$0.50 vs claude-sonnet-5-5');
  });

  it('R10: a served value that is not a decimal is not shown as a figure', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('garbled', '2026-10-14T05:00:00Z', {
      modelled_savings_usd: '1e3', savings_baseline_model: 'claude-sonnet-5-5', savings_measurement: 'measured',
    })]} />);
    expect(savingCell(/garbled/)).toBe('Not measured');
  });

  it('R6: the column sits beside the run\'s cost', () => {
    render(<RunsTable now={NOW} sessions={[]} decisions={[run('any', '2026-10-14T05:00:00Z')]} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers.indexOf('Modelled saving')).toBe(headers.indexOf('Local cost') + 1);
  });

  it('R7: the Runs page declares the served figure and the two labels it shows, on its decisions binding', () => {
    const runs = loadLocalPageConfig('runs');
    const decisions = runs.components.flatMap((c) => c.data_bindings ?? []).find((b) => b.binding_id === 'runs-decisions');
    expect(decisions?.required_fields).toEqual(expect.arrayContaining(['modelled_savings_usd', 'savings_baseline_model', 'savings_measurement']));
    const columns = runs.dashboard.widgets.flatMap((w) => ((w.config ?? {}) as { columns?: Array<{ key: string; header: string }> }).columns ?? []);
    expect(columns).toEqual(expect.arrayContaining([{ key: 'modelled_savings_usd', header: 'Modelled saving' }]));
  });
});
