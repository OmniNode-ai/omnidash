import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import LiveEventStreamWidget, {
  LIVE_EVENT_FILTERS_STORAGE_KEY,
  SYSTEM_EVENT_REFRESH_INTERVAL_MS,
} from './LiveEventStreamWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('LiveEventStreamWidget', () => {
  beforeEach(() => {
    qc.clear();
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
    expect(screen.getByTestId('live-event-row')).toHaveTextContent('ACTION');
  });

  it('hides heartbeat noise by default and lets the operator opt in', async () => {
    mockFetchWithItems([
      { id: 'e1', type: 'ACTION', timestamp: '2026-05-01T12:00:00Z', source: 'platform', topic: 'onex.evt.platform.node-heartbeat.v1', summary: 'Worker heartbeat received', payload: '{}' },
      { id: 'e2', type: 'ROUTING', timestamp: '2026-05-01T13:00:00Z', source: 'omnimarket', topic: 'onex.evt.routing-decision.v1', summary: 'Routing decided', payload: '{}' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );

    expect(await screen.findAllByTestId('live-event-row')).toHaveLength(1);
    expect(screen.queryByText('Worker heartbeat received')).not.toBeInTheDocument();
    expect(screen.getByText(/1 heartbeat hidden/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /include heartbeats/i }));
    expect(screen.getAllByTestId('live-event-row')).toHaveLength(2);
  });

  it('filters heartbeat noise before applying the visible-event cap', async () => {
    const baseTime = Date.parse('2026-05-01T13:00:00Z');
    const heartbeats = Array.from({ length: 100 }, (_, index) => ({
      id: `heartbeat-${index}`,
      type: 'ACTION',
      timestamp: new Date(baseTime - index * 1_000).toISOString(),
      source: 'platform',
      topic: 'onex.evt.platform.node-heartbeat.v1',
      summary: 'Worker heartbeat received',
      payload: '{}',
    }));
    const realEvents = Array.from({ length: 5 }, (_, index) => ({
      id: `routing-${index}`,
      type: 'ROUTING',
      timestamp: new Date(baseTime - (100 + index) * 1_000).toISOString(),
      source: 'omnimarket',
      topic: 'onex.evt.routing-decision.v1',
      summary: `Routing decision ${index}`,
      payload: '{}',
    }));
    mockFetchWithItems([...heartbeats, ...realEvents]);

    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );

    expect(await screen.findAllByTestId('live-event-row')).toHaveLength(5);
    expect(screen.getByText('Routing decision 0')).toBeInTheDocument();
    expect(screen.queryByText('Worker heartbeat received')).not.toBeInTheDocument();
  });

  it('filters by event type', async () => {
    mockFetchWithItems([
      { id: 'e1', type: 'ROUTING', timestamp: '2026-05-01T12:00:00Z', source: 'omnimarket', topic: 'onex.cmd.route.v1', summary: 'Routing event', payload: '{}' },
      { id: 'e2', type: 'ERROR', timestamp: '2026-05-01T13:00:00Z', source: 'runtime', topic: 'onex.evt.error.v1', summary: 'Runtime error', payload: '{}' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('live-event-row');

    fireEvent.change(screen.getByLabelText('Filter by event type'), { target: { value: 'ERROR' } });

    expect(screen.getAllByTestId('live-event-row')).toHaveLength(1);
    expect(screen.getByTestId('live-event-row')).toHaveTextContent('ERROR');
    expect(screen.getByTestId('live-event-row')).not.toHaveTextContent('ROUTING');
  });

  it('persists text, type, and heartbeat filter preferences', async () => {
    mockFetchWithItems([
      { id: 'e1', type: 'ERROR', timestamp: '2026-05-01T13:00:00Z', source: 'runtime', topic: 'onex.evt.error.v1', summary: 'Runtime error', payload: '{}' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    await screen.findByTestId('live-event-row');

    fireEvent.change(screen.getByLabelText('Filter live event messages'), { target: { value: 'runtime' } });
    fireEvent.change(screen.getByLabelText('Filter by event type'), { target: { value: 'ERROR' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /include heartbeats/i }));

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(LIVE_EVENT_FILTERS_STORAGE_KEY) ?? '{}')).toEqual({
        query: 'runtime',
        eventType: 'ERROR',
        includeHeartbeats: true,
      });
    });
  });

  it('restores persistent filters on the next mount', async () => {
    window.localStorage.setItem(LIVE_EVENT_FILTERS_STORAGE_KEY, JSON.stringify({
      query: 'runtime',
      eventType: 'ERROR',
      includeHeartbeats: true,
    }));
    mockFetchWithItems([
      { id: 'e1', type: 'ERROR', timestamp: '2026-05-01T13:00:00Z', source: 'runtime', topic: 'onex.evt.error.v1', summary: 'Runtime error', payload: '{}' },
    ]);

    render(
      <DataSourceTestProvider client={qc}>
        <LiveEventStreamWidget />
      </DataSourceTestProvider>,
    );
    await screen.findByTestId('live-event-row');

    expect(screen.getByLabelText('Filter live event messages')).toHaveValue('runtime');
    expect(screen.getByLabelText('Filter by event type')).toHaveValue('ERROR');
    expect(screen.getByRole('checkbox', { name: /include heartbeats/i })).toBeChecked();
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
