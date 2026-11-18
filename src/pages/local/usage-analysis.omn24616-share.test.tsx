// @vitest-environment jsdom
// OMN-24616 AC6: a pass rate follows the one share rule (formatShare) wherever it is drawn.
// The audit found a share shown with 0, 1 or 2 decimals depending on the page. Usage and Runs wrote their pass rate
// with their own arithmetic, which reads a real, tiny rate as "0.0%".
// Failure modes:
//   S1  Runs' totals line rounds 1 passed of 4,000 to "0.0% passed", hiding a nonzero rate
//   S2  an ordinary rate stops reading to one decimal
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunsTotals } from './usage-analysis';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const run = (index: number, passed: boolean) => ({
  correlation_id: `run-${index}`, written_at: new Date(NOW - index * 1000).toISOString(),
  created_at: new Date(NOW - index * 1000).toISOString(), terminal_ok: 1, quality_gate_passed: passed ? 1 : 0,
  latency_ms: 1000, cost_usd: '0.01', model_name: 'm', cost_tier_name: 'local', task_type: 'document',
});

afterEach(() => cleanup());

describe('OMN-24616 AC6: one share rule for pass rates', () => {
  it('S1: a tiny nonzero rate reads <0.1%, never 0.0%', () => {
    const rows = Array.from({ length: 4000 }, (_, index) => run(index, index === 0));
    render(<RunsTotals rows={rows} sample={4000} complete />);
    expect(screen.getByText(/passed \(1 of 4000\)/).textContent).toBe('<0.1% passed (1 of 4000)');
  });

  it('S2: 806 of 1000 reads 80.6%', () => {
    const rows = Array.from({ length: 1000 }, (_, index) => run(index, index < 806));
    render(<RunsTotals rows={rows} sample={1000} complete />);
    expect(screen.getByText(/passed \(806 of 1000\)/).textContent).toBe('80.6% passed (806 of 1000)');
  });
});
