import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import LiveEventStreamWidget, { SYSTEM_EVENT_REFRESH_INTERVAL_MS } from './LiveEventStreamWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('LiveEventStreamWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses a continuous two-second projection refresh cadence', () => {
    expect(SYSTEM_EVENT_REFRESH_INTERVAL_MS).toBe(2_000);
  });

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders event rows newest first', async () => {
    mockFetchWithItems([
      { id: 'e1', type: 'ROUTING', timestamp: '2026-05-01T12:00:00Z', source: 'omnimarket', topic: 'onex.cmd.route.v1', summary: 'Routing event', payload: '{}', correlation_id: 'corr-route' },
      { id: 'e2', type: 'ACTION', timestamp: '2026-05-01T13:00:00Z', source: 'omniclaude', topic: 'onex.evt.action.v1', summary: 'Action event', payload: '{"step":"done"}', correlation_id: 'corr-action' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    const rows = await screen.findAllByTestId('live-event-row');
    expect(rows.length).toBe(2);
    // Newest first: ACTION event (13:00) should be first
    expect(rows[0]).toHaveTextContent('ACTION');
    expect(rows[0]).toHaveTextContent('corr-action');
    expect(rows[0]).toHaveTextContent('"step": "done"');
  });

  it('filters by correlation and payload text', async () => {
    mockFetchWithItems([
      { id: 'e1', type: 'ROUTING', timestamp: '2026-05-01T12:00:00Z', source: 'omnimarket', topic: 'onex.cmd.route.v1', summary: 'Routing event', payload: '{"model":"qwen3"}', correlation_id: 'corr-route' },
      { id: 'e2', type: 'ACTION', timestamp: '2026-05-01T13:00:00Z', source: 'omniclaude', topic: 'onex.evt.action.v1', summary: 'Action event', payload: '{"model":"deepseek"}', correlation_id: 'corr-action' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('live-event-row');

    const input = screen.getByLabelText('Filter live event messages') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'qwen3' } });

    expect(screen.getAllByTestId('live-event-row')).toHaveLength(1);
    expect(screen.getByText('corr-route')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'corr-action' } });

    expect(screen.getAllByTestId('live-event-row')).toHaveLength(1);
    expect(screen.getByText('corr-action')).toBeInTheDocument();
    expect(screen.getByText('ACTION')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No system events')).toBeInTheDocument();
  });

  it('caps displayed events at 100', async () => {
    const events = Array.from({ length: 120 }, (_, i) => ({
      id: `e${i}`,
      type: 'ACTION',
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      source: 'test',
      topic: 'test.topic',
      summary: `Event ${i}`,
      payload: '{}',
    }));
    mockFetchWithItems(events);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('live-event-row');
    const rows = screen.queryAllByTestId('live-event-row');
    expect(rows.length).toBeLessThanOrEqual(100);
  });
});
