// @vitest-environment jsdom
// OMN-24616 AC1: no local page computes a window figure from a partial page of rows.
// The audit found Usage analysis computing spend, pass rate, p50 and p95 from the newest 500 runs, and Overview's
// "Why runs failed" counting 205 failures from those rows while the store had 576.
// Failure modes:
//   A1  Usage renders history figures before the bounded reads have returned every run
//   A2  Overview's failure list counts the served page of rows instead of the quality gate's served counts
//   A3  a quality row that serves no categories hides the row-counted list instead of falling back to it
//   A4  (review of #521, finding 2) Overview's panel never reads the quality gate snapshot: the wiring in page-tables is
//       unexercised by A2 and A3, which hand the categories to the component themselves
//   A5  (review of #521, finding 1; Lakshman 2026-11-17 "label it honestly") the served list counts failed quality CHECKS
//       over all time, so it must not be titled as failed runs or read as following the Overview window
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decisionsWalkFor } from '@/contracts/local-read-budget';
import { DELEGATION_DECISIONS_TOPIC, type BoundProjectionSnapshot } from '@/layout/local-page-loader';
import { InsightsSection, servedFailureCategories } from '@/pages/local/insight-charts';
import { TableComponent } from '@/pages/local/page-tables';

afterEach(cleanup);

const NOW = Date.parse('2026-11-16T12:00:00Z');
const decision = (index: number, failed: boolean) => ({
  id: index, correlation_id: `run-${index}`, created_at: new Date(NOW - index * 60_000).toISOString(),
  written_at: new Date(NOW - index * 60_000).toISOString(), terminal_ok: failed ? 0 : 1, quality_gate_passed: failed ? 0 : 1,
  terminal_failure_cause: failed ? 'quality_gate_refused' : null, latency_ms: 1000, cost_usd: '0.01', model_name: 'm', task_type: 'document',
});
const rows = Array.from({ length: 501 }, (_, index) => decision(index, index < 205));

describe('OMN-24616 AC1: window figures from served aggregates', () => {
  it('A1: Usage reads one page per trigger and retains any explicitly loaded history', () => {
    const held = { topic: DELEGATION_DECISIONS_TOPIC, rows } as BoundProjectionSnapshot;
    expect(decisionsWalkFor('usage', 'mount', undefined)).toEqual({ maxPages: 0 });
    expect(decisionsWalkFor('usage', 'manual', held)).toEqual({ maxPages: 0, previous: held });
    expect(decisionsWalkFor('usage', 'timer', held)).toEqual({ maxPages: 0, previous: held });
    expect(decisionsWalkFor('overview', 'mount', undefined)).toEqual({ maxPages: 0 });
  });

  it('A1: Usage waits for a complete history before showing aggregate figures', () => {
    const onLoadMore = vi.fn();
    const component = {
      component_id: 'usage-insights', component_kind: 'table', title: 'Usage analysis',
      data_bindings: ['usage', DELEGATION_DECISIONS_TOPIC].map((topic, index) => ({
        binding_id: `b${index}`, projection_topic: topic,
      })),
    };
    const snapshot = { topic: DELEGATION_DECISIONS_TOPIC, rows, readAt: '2026-11-16T11:59:59Z' };
    const analysis = (read: object) => <TableComponent component={component as never} snapshots={[read] as never}
      pageSize={25} syncUrl={false} columns={[]} activityWindow={{ kind: 'days', days: 7 }}
      slice={{ key: 'analysis', title: 'Usage analysis', concept: 'usage-analysis' }} onLoadMore={onLoadMore} />;
    const { rerender } = render(analysis({ ...snapshot, rows: rows.slice(0, 500), truncated: true, nextCursor: '0' }));
    expect(screen.queryByRole('table', { name: 'Usage by model' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load more runs' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(analysis(snapshot));
    expect(screen.getByText(/From all 501 served runs/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more runs' })).toBeNull();
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

  // The Overview activity panel as the page draws it: decisions plus the quality gate's served row.
  const overview = (quality: object | null) => {
    const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
    const QUALITY = 'onex.snapshot.projection.delegation.quality-gate.v1';
    const component = { component_id: 'overview-insights', component_kind: 'table', title: 'Trends and breakdowns',
      data_bindings: [DECISIONS, QUALITY].map((topic, index) => ({ binding_id: `b${index}`, projection_topic: topic })) };
    const snapshots = [{ topic: DECISIONS, rows, readAt: '2026-11-16T11:59:59Z', truncated: true },
      ...(quality === null ? [] : [{ topic: QUALITY, rows: [quality], readAt: '2026-11-16T11:59:59Z' }])];
    render(<TableComponent component={component as never} snapshots={snapshots as never} pageSize={25} syncUrl={false}
      columns={[]} activityWindow={{ kind: 'days', days: 7 }} />);
  };

  it('A4: the Overview panel reads the quality gate snapshot it is served, not only the rows', () => {
    overview({ failure_categories: JSON.stringify([{ category: 'missing tests', count: 576, pct_of_failures: 1 }]) });
    const list = screen.getByRole('list', { name: 'Failure causes' });
    expect(within(list).getByText('576')).toBeInTheDocument();
    expect(within(list).queryByText('205')).toBeNull();
  });

  it('A4 control: without a quality gate snapshot the panel counts the rows it read', () => {
    overview(null);
    expect(within(screen.getByRole('list', { name: 'Failure causes' })).getByText('205')).toBeInTheDocument();
  });

  it('A5: the served list is titled as failed quality checks, over all time, never as runs in the window', () => {
    overview({ failure_categories: JSON.stringify([{ category: 'missing tests', count: 576, pct_of_failures: 1 }]) });
    const card = screen.getByRole('list', { name: 'Failure causes' }).closest('figure, section, article, .ins-card, [data-chart-card]')
      ?? screen.getByRole('list', { name: 'Failure causes' }).parentElement!;
    const text = card.textContent ?? '';
    expect(screen.getByText('Failed checks by category')).toBeInTheDocument();
    expect(screen.queryByText('Why runs failed')).toBeNull();
    expect(text).toMatch(/all time/i);
    expect(text).not.toMatch(/for every run/);
    // Re-review of #521 at 9e24227f: the section around the served card is named for assistive tech too.
    expect(screen.getByRole('region', { name: 'Failed checks by category' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /why runs failed/i })).toBeNull();
  });

  it('A5 control: the row-counted list, which is about runs, keeps its section name', () => {
    overview(null);
    expect(screen.getByRole('region', { name: 'Why runs failed' })).toBeInTheDocument();
  });
});
