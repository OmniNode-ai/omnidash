import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import EventStream from './EventStream';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// WebSocket mock
class MockWebSocket {
  static instance: MockWebSocket | null = null;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instance = this;
  }
}

// Helper: mock FileSnapshotSource fetch pattern — index.json then each file
function mockFetchWithItems(items: unknown[]) {
  const fileNames = items.map((_, i) => `${i}.json`);
  const fileMap = new Map(fileNames.map((name, i) => [name, items[i]]));
  (fetch as any)
    .mockResolvedValueOnce({ ok: true, json: async () => fileNames })
    .mockImplementation((url: string) => {
      const filename = url.split('/').pop() ?? '';
      const item = fileMap.get(filename) ?? null;
      return Promise.resolve({ ok: true, json: async () => item });
    });
}

describe('EventStream', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instance = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<DataSourceTestProvider client={qc}><EventStream config={{ maxEvents: 200, autoScroll: true }} /></DataSourceTestProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders initial events from REST endpoint', async () => {
    mockFetchWithItems([
      { id: '1', event_type: 'onex.evt.delegation.completed.v1', source: 'omnimarket', correlation_id: 'abc', timestamp: '2026-04-10T12:00:00Z' },
    ]);
    render(<DataSourceTestProvider client={qc}><EventStream config={{ maxEvents: 200, autoScroll: true }} /></DataSourceTestProvider>);
    expect(await screen.findByText('onex.evt.delegation.completed.v1')).toBeInTheDocument();
    expect(screen.getByText('omnimarket')).toBeInTheDocument();
  });

  it('caps events at maxEvents (200) dropping extras', async () => {
    const manyEvents = Array.from({ length: 205 }, (_, i) => ({
      id: String(i), event_type: `event-${i}`, source: 'test', correlation_id: `cid-${i}`, timestamp: new Date().toISOString(),
    }));
    mockFetchWithItems(manyEvents);
    render(<DataSourceTestProvider client={qc}><EventStream config={{ maxEvents: 200, autoScroll: true }} /></DataSourceTestProvider>);
    // Wait for data to load by checking that event rows appear
    await screen.findAllByTestId('event-row');
    const rows = screen.queryAllByTestId('event-row');
    expect(rows.length).toBeLessThanOrEqual(200);
  });
});
