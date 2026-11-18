// @vitest-environment jsdom
// OMN-24616 AC2: every rate is held on one scale, a 0-1 share, and shown once as a percent.
//
// Failure modes, each with a test below:
//   R1  the run summary holds the pass rate as a percent (80.6) while the served aggregates hold a share (0.806)
//   R2  the table view of Pass rate per day formats a percent as a share again: 80.6% reads 8064.5%
//   R3  the chart's own label and its table read two different numbers for one day
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { InsightsSection } from './insight-charts';
import { summary, toInsightRuns } from './insights';

const NOW = Date.parse('2026-10-18T09:30:00Z');

function row(at: string, passed: 0 | 1): Record<string, unknown> {
  return {
    written_at: at, quality_gate_passed: passed, quality_gate_detail: 'completed', latency_ms: 500, tokens_input: 200,
    tokens_output: 20, cost_usd: 0, cost_tier_name: 'local', task_type: 'document', model_name: 'Qwen3.8-27B',
  };
}

// 25 passed and 6 failed on one UTC day: 25 / 31 = 0.806.
const DECISIONS = Array.from({ length: 31 }, (_, index) =>
  row(`2026-10-18T08:${String(index).padStart(2, '0')}:00Z`, index < 25 ? 1 : 0));

it('R1: the run summary holds the pass rate as a 0-1 share', () => {
  expect(summary(toInsightRuns(DECISIONS)).passRate).toBeCloseTo(25 / 31, 6);
});

it('R2, R3: Pass rate per day reads 80.6% in its chart label and in its table, never 8064.5%', () => {
  const { container } = render(<InsightsSection decisions={DECISIONS} now={NOW} />);
  expect(container.querySelector('button[aria-label^="Oct 18: 80.6% passed"]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show as table: Pass rate per day' }));
  expect(screen.queryByText('8064.5%')).toBeNull();
  expect(screen.getAllByRole('cell', { name: '80.6%' }).length).toBeGreaterThan(0);
});
