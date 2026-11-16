// @vitest-environment jsdom
// OMN-24616 AC1: no local page computes a window figure from a partial page of rows.
// The audit found Usage analysis computing spend, pass rate, p50 and p95 from the newest 500 runs, and Overview's
// "Why runs failed" counting 205 failures from those rows while the store had 576.
// Failure modes:
//   A1  Usage reads only the newest page of decisions, so its analysis covers a partial page (decision D1: walk all)
//   A2  Overview's failure list counts the served page of rows instead of the quality gate's served counts
//   A3  a quality row that serves no categories hides the row-counted list instead of falling back to it
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { decisionsWalkFor } from '@/contracts/local-read-budget';
import { InsightsSection, servedFailureCategories } from '@/pages/local/insight-charts';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const decision = (index: number, failed: boolean) => ({
  id: index, correlation_id: `run-${index}`, created_at: new Date(NOW - index * 60_000).toISOString(),
  written_at: new Date(NOW - index * 60_000).toISOString(), terminal_ok: failed ? 0 : 1, quality_gate_passed: failed ? 0 : 1,
  terminal_failure_cause: failed ? 'quality_gate_refused' : null, latency_ms: 1000, cost_usd: '0.01', model_name: 'm', task_type: 'document',
});
const rows = Array.from({ length: 501 }, (_, index) => decision(index, index < 205));

describe('OMN-24616 AC1: window figures from served aggregates', () => {
  it('A1: Usage walks every page of decisions on open and on Refresh, as Runs does', () => {
    expect(decisionsWalkFor('usage', 'mount', undefined)).toBeUndefined();
    expect(decisionsWalkFor('usage', 'manual', undefined)).toBeUndefined();
    expect(decisionsWalkFor('overview', 'mount', undefined)).toEqual({ maxPages: 0 });
  });

  it('A2: Overview\'s failure list shows the quality gate\'s served counts, not the page of rows', () => {
    const served = servedFailureCategories(JSON.stringify([{ category: 'missing tests', count: 576, pct_of_failures: 1 }]));
    render(<InsightsSection decisions={rows} now={NOW} view="summary" complete={false} servedFailures={served} />);
    const list = screen.getByRole('list', { name: 'Failure causes' });
    expect(within(list).getByText('576')).toBeInTheDocument();
    expect(within(list).queryByText('205')).toBeNull();
  });

  it('A3: with no served categories the row-counted list stays', () => {
    expect(servedFailureCategories(undefined)).toBeNull();
    render(<InsightsSection decisions={rows} now={NOW} view="summary" complete={false} servedFailures={null} />);
    expect(within(screen.getByRole('list', { name: 'Failure causes' })).getByText('205')).toBeInTheDocument();
  });
});
