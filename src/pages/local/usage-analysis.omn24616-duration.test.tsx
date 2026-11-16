// @vitest-environment jsdom
// OMN-24616 AC6: one duration rule, formatDuration's, on every page, and the one missing-value word.
// The audit found one duration written four ways. Runs' totals and Usage analysis wrote seconds to one decimal
// however long the run, Overview's median and its comparison wrote their own seconds, and Delegation Evidence wrote
// a missing latency as a dash.
// Failure modes:
//   D1  a 75-second p95 reads "75.0 s" on Runs while every other page reads "1 min 15 s"
//   D2  Delegation Evidence writes a missing latency as "—" instead of the one missing-value word
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunsTotals } from './usage-analysis';
import { fmtLatency } from '@/components/dashboard/event-dash/primitives';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const run = (index: number) => ({
  correlation_id: `run-${index}`, written_at: new Date(NOW - index * 1000).toISOString(),
  created_at: new Date(NOW - index * 1000).toISOString(), terminal_ok: 1, quality_gate_passed: 1,
  latency_ms: 75_000, cost_usd: '0.01', model_name: 'm', cost_tier_name: 'local', task_type: 'document',
});

afterEach(() => cleanup());

describe('OMN-24616 AC6: one duration rule', () => {
  it('D1: Runs totals write a 75 s p95 as every page does', () => {
    render(<RunsTotals rows={Array.from({ length: 4 }, (_, index) => run(index))} sample={4} complete />);
    expect(screen.getByText(/^p95 /).textContent).toBe('p95 1 min 15 s');
  });

  it('D2: a missing Evidence latency reads Not measured', () => {
    expect(fmtLatency(null)).toBe('Not measured');
    expect(fmtLatency(undefined)).toBe('Not measured');
    expect(fmtLatency(12_181)).toBe('12.2 s');
  });
});
