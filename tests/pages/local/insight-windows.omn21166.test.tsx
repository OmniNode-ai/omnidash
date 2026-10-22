// @vitest-environment jsdom
// OMN-21166 AC40: the insight windows All, 1/7/15/30 days and a custom UTC range, opening on All. Moved from
// src/pages/local/insight-charts.omn21166.test.tsx so the hosted merge-base control (which overlays only paths under
// tests/) can lay it over the merge base and see it fail there.
// Failure modes: the section opens on a preset instead of All; a preset is missing; a custom range drops a boundary day;
// an end before the start, or a range with no served rows, shows a zero instead of a typed empty state.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection } from '@/pages/local/insight-charts';

const NOW = Date.parse('2026-10-18T09:30:00Z');

function row(at: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    written_at: at, quality_gate_passed: 1, quality_gate_detail: 'completed', latency_ms: 500, tokens_input: 200,
    tokens_output: 20, cost_usd: 0, cost_tier_name: 'local', task_type: 'document',
    model_name: 'Qwen3.8-27B', ...extra,
  };
}

const ROWS = [
  row('2026-10-18T08:00:00Z'),
  row('2026-10-18T08:05:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: invalid syntax', task_type: 'code_generation' }),
  row('2026-10-18T08:10:00Z', { quality_gate_passed: null, task_type: null }),
  row('2026-10-16T22:11:00Z', { latency_ms: 2400, model_name: 'gemini-3.5-flash-lite', cost_tier_name: 'cheap_cloud', cost_usd: 0.0012 }),
  row('2026-10-09T12:00:00Z'),
];

describe('OMN-21166 AC40: insight windows', () => {
  it('AC40: opens on All and offers each approved UTC window', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const all = screen.getByRole('button', { name: /^All$/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['1 day', '7 days', '15 days', '30 days']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeInTheDocument();
    }
    expect(screen.getByTestId('insights-total')).toHaveTextContent('Latest 5 served runs');
  });

  it('AC40: custom UTC dates include both boundaries and invalid or empty ranges stay typed', () => {
    render(<InsightsSection decisions={ROWS} now={NOW} />);
    const start = screen.getByLabelText('Start date (UTC)');
    const end = screen.getByLabelText('End date (UTC)');
    fireEvent.change(start, { target: { value: '2026-10-16' } });
    fireEvent.change(end, { target: { value: '2026-10-18' } });
    expect(screen.getByTestId('insights-total')).toHaveTextContent('4 of the latest 5 served runs');
    fireEvent.change(end, { target: { value: '2026-10-15' } });
    expect(screen.getByRole('status', { name: 'Insights' })).toHaveTextContent('End date must be on or after the start date');
    expect(screen.queryByRole('figure', { name: 'Runs per day' })).toBeNull();
    fireEvent.change(start, { target: { value: '2026-10-01' } });
    fireEvent.change(end, { target: { value: '2026-10-02' } });
    expect(screen.getByRole('status', { name: 'Insights' })).toHaveTextContent('No runs in this date range');
  });
});
