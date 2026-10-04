// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  LastRunCard,
  QualityPanel,
  RecentRunsTable,
  RunsTable,
  TierMixPanel,
  WorkflowPath,
} from './LocalDashboardPage';

// OMN-20225: every run row shows its verdict, score and the backend, host and tier that accepted it, read from the
// served delegation.decisions.v1 row (backend_id and host are OMN-20162's columns, omnimarket#3343, migration 0054).
const NOW = Date.parse('2026-10-04T07:00:00Z');

function decision(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id,
    written_at: '2026-10-04T06:58:00Z',
    created_at: '2026-10-04T06:58:00Z',
    model_name: 'Qwen3.8-27B',
    quality_gate_passed: true,
    quality_gate_detail: 'completed',
    latency_ms: 813,
    tokens_input: 162,
    tokens_output: 52,
    task_type: 'summarization',
    cost_tier_name: 'local',
    cost_tier_type: 'free_local',
    actual_score: 0.92,
    backend_id: 'local-heavy-reasoning',
    host: '192.168.86.202',
    ...extra,
  };
}

/** The cell of one row under the column whose header is `header`, so a value is checked in its own column. */
function cellUnder(row: HTMLElement, header: string): HTMLElement {
  const table = row.closest('table');
  if (!table) throw new Error('row is not in a table');
  const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
  const index = headers.indexOf(header);
  if (index < 0) throw new Error(`no "${header}" column; columns are ${headers.join(', ')}`);
  const cells = within(row).getAllByRole('cell');
  return cells[index]!;
}

function lastRunValue(label: string): string {
  const card = screen.getByRole('region', { name: 'Last run' });
  const term = within(card).getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent?.trim() ?? '';
}

describe('OMN-20225 AC1, AC2: the served verdict, score, backend, host and tier on every run row', () => {
  it('Last run shows them, and no longer says the backend is not served', () => {
    render(<LastRunCard now={NOW} decisions={[decision('run-a')]} sessions={[]} />);
    expect(lastRunValue('Status')).toBe('passed');
    expect(lastRunValue('Quality score')).toBe('0.92');
    expect(lastRunValue('Backend')).toBe('local-heavy-reasoning');
    expect(lastRunValue('Host')).toBe('192.168.86.202');
    expect(lastRunValue('Route tier')).toBe('local (free_local)');
    expect(screen.queryByText(/Not served \(OMN-20162\)/)).not.toBeInTheDocument();
  });

  it('Recent runs puts each value in its own column', () => {
    render(<RecentRunsTable now={NOW} decisions={[decision('run-b', { quality_gate_passed: false, actual_score: 0.41 })]} sessions={[]} />);
    const row = screen.getByRole('row', { name: /run-b/ });
    expect(cellUnder(row, 'Status')).toHaveTextContent('failed');
    expect(cellUnder(row, 'Quality score')).toHaveTextContent('0.41');
    expect(cellUnder(row, 'Backend')).toHaveTextContent('local-heavy-reasoning');
    expect(cellUnder(row, 'Host')).toHaveTextContent('192.168.86.202');
    expect(cellUnder(row, 'Route tier')).toHaveTextContent('local (free_local)');
    expect(screen.queryByText(/Not served \(OMN-20162\)/)).not.toBeInTheDocument();
  });

  it('Runs shows two hosts of the same backend on separate rows, from the column and not from the model', () => {
    render(<RunsTable
      now={NOW}
      decisions={[
        decision('run-201', { host: '192.168.86.201', written_at: '2026-10-04T06:59:00Z' }),
        decision('run-202', { host: '192.168.86.202' }),
      ]}
      sessions={[]}
    />);
    expect(cellUnder(screen.getByRole('row', { name: /run-201/ }), 'Host')).toHaveTextContent('192.168.86.201');
    expect(cellUnder(screen.getByRole('row', { name: /run-202/ }), 'Host')).toHaveTextContent('192.168.86.202');
    for (const id of ['run-201', 'run-202']) {
      const row = screen.getByRole('row', { name: new RegExp(id) });
      expect(cellUnder(row, 'Backend')).toHaveTextContent('local-heavy-reasoning');
      expect(cellUnder(row, 'Route tier')).toHaveTextContent('local (free_local)');
      expect(cellUnder(row, 'Quality score')).toHaveTextContent('0.92');
    }
    expect(screen.queryByText(/Not served \(OMN-20162\)/)).not.toBeInTheDocument();
  });

  it('the Workflow routing step names the backend and host', () => {
    render(<WorkflowPath decisions={[decision('run-c')]} />);
    const routing = screen.getByText('Routing').nextElementSibling?.textContent ?? '';
    expect(routing).toContain('backend local-heavy-reasoning');
    expect(routing).toContain('host 192.168.86.202');
    expect(routing).toContain('tier local (free_local)');
    expect(routing).not.toContain('OMN-20162');
    const gate = screen.getByText('Quality gate').nextElementSibling?.textContent ?? '';
    expect(gate).toBe('passed · score 0.92');
  });
});

describe('OMN-20225 AC4: no accepting backend is a typed not-recorded state, never a blank or a backend', () => {
  it.each([
    ['null', null],
    ['an empty string', ''],
    ['absent', undefined],
  ])('a run whose backend_id is %s shows Not recorded under Backend in every view', (_label, value) => {
    const run = decision('no-backend', { backend_id: value });
    if (value === undefined) delete run.backend_id;
    const { unmount } = render(<RecentRunsTable now={NOW} decisions={[run]} sessions={[]} />);
    const recent = screen.getByRole('row', { name: /no-backend/ });
    expect(cellUnder(recent, 'Backend').textContent?.trim()).toBe('Not recorded');
    unmount();

    const runs = render(<RunsTable now={NOW} decisions={[run]} sessions={[]} />);
    expect(cellUnder(screen.getByRole('row', { name: /no-backend/ }), 'Backend').textContent?.trim()).toBe('Not recorded');
    runs.unmount();

    render(<LastRunCard now={NOW} decisions={[run]} sessions={[]} />);
    expect(lastRunValue('Backend')).toBe('Not recorded');
  });

  it('a missing host is typed on its own, and the backend that is served still shows', () => {
    render(<RunsTable now={NOW} decisions={[decision('no-host', { host: null })]} sessions={[]} />);
    const row = screen.getByRole('row', { name: /no-host/ });
    expect(cellUnder(row, 'Host').textContent?.trim()).toBe('Not recorded');
    expect(cellUnder(row, 'Backend')).toHaveTextContent('local-heavy-reasoning');
  });

  it('a run with no tier type shows the tier name alone, and no tier at all is Not recorded', () => {
    render(<RunsTable
      now={NOW}
      decisions={[
        decision('tier-name-only', { cost_tier_type: null, written_at: '2026-10-04T06:59:00Z' }),
        decision('no-tier', { cost_tier_name: '', cost_tier_type: '' }),
      ]}
      sessions={[]}
    />);
    expect(cellUnder(screen.getByRole('row', { name: /tier-name-only/ }), 'Route tier').textContent?.trim()).toBe('local');
    expect(cellUnder(screen.getByRole('row', { name: /no-tier/ }), 'Route tier').textContent?.trim()).toBe('Not recorded');
  });
});

describe('OMN-20225 AC3: the quality and tier-mix panels show served fields and compute nothing', () => {
  // Values chosen so that a figure the browser computed from the counts would differ from the served one.
  const quality = {
    tenant_id: '820272f9-4aaf-5add-a2df-0af942852ab2',
    overall_pass_rate: 0.875,
    total_passed: 3,
    total_failed: 3,
    total_checks: 6,
    avg_actual_score: 0.81,
    avg_required_bar: 0.7,
  };

  it('the quality panel shows the served pass rate, not one recomputed from passed and failed', () => {
    render(<QualityPanel row={quality} />);
    const panel = screen.getByRole('region', { name: 'Quality' });
    for (const [label, value] of [
      ['Pass rate', '0.875'],
      ['Passed', '3'],
      ['Failed', '3'],
      ['Checks', '6'],
      ['Average score', '0.81'],
      ['Average required bar', '0.7'],
    ]) {
      const term = within(panel).getByText(label, { selector: 'dt' });
      expect(term.nextElementSibling?.textContent?.trim(), label).toBe(value);
    }
    expect(within(panel).queryByText('0.5')).not.toBeInTheDocument();
  });

  it('the quality panel types a field the row does not carry, and an absent row is not a zero', () => {
    const { unmount } = render(<QualityPanel row={{ ...quality, avg_required_bar: null }} />);
    const term = screen.getByText('Average required bar', { selector: 'dt' });
    expect(term.nextElementSibling?.textContent?.trim()).toBe('Not recorded');
    unmount();
    render(<QualityPanel row={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('No quality checks served yet');
    expect(screen.queryByText(/^0(?:\.0+)?$/)).not.toBeInTheDocument();
  });

  const byTier = {
    total_tasks: 9,
    tier_routed_total: 7,
    not_tier_routed_count: 2,
    tiers: [
      { cost_tier_name: 'local', count: 5, tier_routed: true, pct_of_tier_routed: 71.43 },
      { cost_tier_name: 'cheap_cloud', count: 2, tier_routed: true, pct_of_tier_routed: 28.57 },
    ],
  };

  it('the tier-mix panel lists each served tier with its served count and share', () => {
    render(<TierMixPanel row={{ tenant_id: quality.tenant_id, by_tier: byTier }} />);
    const local = screen.getByRole('row', { name: /^local/ });
    expect(cellUnder(local, 'Tier')).toHaveTextContent('local');
    expect(cellUnder(local, 'Runs')).toHaveTextContent('5');
    expect(cellUnder(local, 'Share of tier-routed')).toHaveTextContent('71.43');
    const cloud = screen.getByRole('row', { name: /^cheap_cloud/ });
    expect(cellUnder(cloud, 'Share of tier-routed')).toHaveTextContent('28.57');
    // The runs with no tier are their own served figure, never folded into a tier.
    const term = screen.getByText('Not tier-routed', { selector: 'dt' });
    expect(term.nextElementSibling?.textContent?.trim()).toBe('2');
  });

  it('the tier-mix panel shows a served share as served, even when the counts would give another number', () => {
    render(<TierMixPanel row={{ by_tier: { ...byTier, tiers: [{ cost_tier_name: 'local', count: 1, tier_routed: true, pct_of_tier_routed: 40 }] } }} />);
    expect(cellUnder(screen.getByRole('row', { name: /^local/ }), 'Share of tier-routed')).toHaveTextContent('40');
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('a row with no by_tier, or no tiers, is a typed state, never an empty table', () => {
    const { unmount } = render(<TierMixPanel row={{ tenant_id: quality.tenant_id, by_tier: null }} />);
    expect(screen.getByRole('status')).toHaveTextContent('No tier mix served yet');
    unmount();
    render(<TierMixPanel row={{ by_tier: { ...byTier, tiers: [] } }} />);
    expect(screen.getByRole('status')).toHaveTextContent('No tier mix served yet');
  });
});
