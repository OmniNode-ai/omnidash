import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import SkillAdoptionWidget from './SkillAdoptionWidget';
import type { SkillExecutionRow } from '@/services/skill-adoption-service';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

let seq = 0;
function makeRow(overrides: Partial<SkillExecutionRow> = {}): SkillExecutionRow {
  seq += 1;
  return {
    event_id: `event-${seq}`,
    run_id: 'run-001',
    event_type: 'started',
    skill_name: 'pr-review',
    repo_id: 'omniclaude',
    correlation_id: 'corr-001',
    emitted_at: '2026-06-30T12:00:00+00:00',
    ...overrides,
  };
}

describe('SkillAdoptionWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <DataSourceTestProvider client={qc}>
        <SkillAdoptionWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no rows', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <SkillAdoptionWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no skill executions/i)).toBeInTheDocument();
  });

  it('renders KPI tiles with started/completed counts', async () => {
    mockFetchWithItems([
      makeRow({ run_id: 'r1', event_type: 'started' }),
      makeRow({ run_id: 'r1', event_type: 'completed', status: 'success' }),
      makeRow({ run_id: 'r2', event_type: 'started' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <SkillAdoptionWidget config={{}} />
      </DataSourceTestProvider>,
    );
    // "Completed" and "Receipt coverage" are unique KPI labels; "Started"
    // intentionally appears in both the KPI tile and the table header, so it is
    // asserted via getAllByText rather than the throw-on-multiple getByText.
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Receipt coverage')).toBeInTheDocument();
    expect(screen.getAllByText('Started').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a per-skill row for each distinct skill', async () => {
    mockFetchWithItems([
      makeRow({ skill_name: 'pr-review', event_type: 'started' }),
      makeRow({ skill_name: 'merge-sweep', event_type: 'started' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <SkillAdoptionWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('pr-review')).toBeInTheDocument();
    expect(screen.getByText('merge-sweep')).toBeInTheDocument();
  });

  it('surfaces failed-status breakdown from completed rows', async () => {
    mockFetchWithItems([
      makeRow({ skill_name: 'pr-review', event_type: 'started' }),
      makeRow({ skill_name: 'pr-review', event_type: 'completed', status: 'failed' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <SkillAdoptionWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('pr-review');
    // Failed marker "1✗" appears in the status column.
    expect(screen.getByText('1✗')).toBeInTheDocument();
  });
});
