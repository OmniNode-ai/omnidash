import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import TraceExplorerWidget from './TraceExplorerWidget';
import type { TraceGroup } from './TraceExplorerWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const makeTrace = (overrides: Partial<TraceGroup> = {}): TraceGroup => ({
  correlation_id: 'corr-0001',
  nodes_involved: ['node_build_loop'],
  event_count: 5,
  first_event_at: '2026-05-25T12:00:00Z',
  last_event_at: '2026-05-25T12:00:05Z',
  duration_ms: 5000,
  has_error: false,
  is_running: false,
  latest_message: 'Phase complete',
  ...overrides,
});

describe('TraceExplorerWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <TraceExplorerWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no traces', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <TraceExplorerWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No traces')).toBeInTheDocument();
  });

  it('renders trace cards', async () => {
    mockFetchWithItems([
      makeTrace({ correlation_id: 'corr-a', nodes_involved: ['node_build_loop', 'node_test_runner'], event_count: 12 }),
      makeTrace({ correlation_id: 'corr-b', is_running: true, latest_message: 'Running tests' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <TraceExplorerWidget />
      </DataSourceTestProvider>,
    );
    const cards = await screen.findAllByTestId('trace-card');
    expect(cards.length).toBe(2);
  });

  it('filters traces by query', async () => {
    mockFetchWithItems([
      makeTrace({ correlation_id: 'corr-alpha', latest_message: 'Alpha complete' }),
      makeTrace({ correlation_id: 'corr-beta', latest_message: 'Beta complete' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <TraceExplorerWidget />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('trace-card');

    const input = screen.getByLabelText('Filter traces') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alpha' } });

    expect(screen.getAllByTestId('trace-card')).toHaveLength(1);
    expect(screen.getByText(/corr-alpha/)).toBeInTheDocument();
  });

  it('shows prompt to select a trace when none selected', async () => {
    mockFetchWithItems([makeTrace()]);
    render(
      <DataSourceTestProvider client={qc}>
        <TraceExplorerWidget />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('trace-card');
    expect(screen.getByText('Select a trace to view its timeline')).toBeInTheDocument();
  });
});
