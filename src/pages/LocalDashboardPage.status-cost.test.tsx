// @vitest-environment jsdom
// OMN-20753: on `onex dashboard` the local SQLite store serves a boolean as 1/0 and no delegation.savings.v1 session,
// so Runs read Status and Cost Not recorded on every run of the OMN-20223 walk although each receipt recorded both.
// The rows below are the walk's own shape: a decisions row as the local store serves it, with no savings session.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LastRunCard, RecentRunsTable, RunsTable } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-08T18:45:00Z');

function localRow(id: string, writtenAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id,
    written_at: writtenAt,
    created_at: writtenAt,
    model_name: 'gemini-3.5-flash-lite',
    quality_gate_passed: 1,
    quality_gate_detail: 'completed',
    terminal_ok: 1,
    latency_ms: 11677,
    tokens_input: 250,
    tokens_output: 13,
    task_type: 'document',
    ...extra,
  };
}

const MEASURED = localRow('measured-run', '2026-10-08T18:40:44Z', { cost_usd: 0.0 });
const UNMEASURED = localRow('unmeasured-run', '2026-10-08T18:40:18Z', { cost_usd: null });

describe('Runs status and cost from the local store (OMN-20753)', () => {
  it('Runs shows a 1-served gate verdict as passed and a measured zero cost as $0.00', () => {
    render(<RunsTable now={NOW} decisions={[MEASURED, UNMEASURED]} sessions={[]} />);
    const measured = screen.getByRole('row', { name: /^measured-run/ });
    expect(within(measured).getByText('passed')).toBeInTheDocument();
    expect(within(measured).getByText('$0.00')).toBeInTheDocument();
  });

  it('Runs shows a cost never measured as Not recorded, never $0.00 (AC2)', () => {
    render(<RunsTable now={NOW} decisions={[MEASURED, UNMEASURED]} sessions={[]} />);
    const unmeasured = screen.getByRole('row', { name: /unmeasured-run/ });
    expect(within(unmeasured).queryByText('$0.00')).not.toBeInTheDocument();
    expect(within(unmeasured).getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it('a 0-served verdict reads failed, and a missing one still reads Not recorded', () => {
    render(<RecentRunsTable
      now={NOW}
      decisions={[
        localRow('gate-failed', '2026-10-08T18:40:00Z', { quality_gate_passed: 0, quality_gate_detail: 'refused', cost_usd: 0 }),
        localRow('gate-unknown', '2026-10-08T18:39:00Z', { quality_gate_passed: null, cost_usd: 0 }),
      ]}
      sessions={[]}
    />);
    expect(within(screen.getByRole('row', { name: /gate-failed/ })).getByText('failed')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /gate-unknown/ })).queryByText(/^(passed|failed)$/)).not.toBeInTheDocument();
  });

  it('the Last run card reads the same status and cost', () => {
    render(<LastRunCard now={NOW} decisions={[MEASURED, UNMEASURED]} sessions={[]} />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('passed')).toBeInTheDocument();
    expect(within(card).getByText('$0.00')).toBeInTheDocument();
  });

  it('a served savings session still supplies the cost, with its digits kept', () => {
    render(<RunsTable
      now={NOW}
      decisions={[MEASURED]}
      sessions={[{ session_id: 'measured-run', local_cost_usd: 0.0021, usage_source: 'measured' }]}
    />);
    expect(within(screen.getByRole('row', { name: /^measured-run/ })).getByText('$0.0021')).toBeInTheDocument();
  });
});
