/**
 * Tests for EventBusExplorer Page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EventBusExplorer from '../EventBusExplorer';
import { eventBusSource } from '@/lib/data-sources';

// Mock the data source
vi.mock('@/lib/data-sources', () => ({
  eventBusSource: {
    queryEvents: vi.fn(),
    getEventChain: vi.fn(),
    getStatistics: vi.fn(),
    getStatus: vi.fn(),
  },
}));

describe('EventBusExplorer', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchInterval: false, // Disable polling in tests to prevent infinite loops
          refetchOnWindowFocus: false,
          gcTime: 0, // Disable cache to prevent stale data issues
          staleTime: Infinity, // Never consider data stale in tests
        },
      },
    });
    vi.clearAllMocks();
  });

  const renderWithClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('should render event bus explorer', async () => {
    vi.mocked(eventBusSource.queryEvents).mockResolvedValueOnce({
      events: [],
      count: 0,
      options: {},
    });
    vi.mocked(eventBusSource.getStatistics).mockResolvedValueOnce({
      total_events: 0,
      events_by_type: {},
      events_by_tenant: {},
      events_per_minute: 0,
      oldest_event: null,
      newest_event: null,
    });
    vi.mocked(eventBusSource.getStatus).mockResolvedValueOnce({
      active: true,
      connected: true,
      status: 'running',
    });

    renderWithClient(<EventBusExplorer />);

    await waitFor(() => {
      expect(screen.getByText('Event Bus Explorer')).toBeInTheDocument();
    });
  });

  it('should display events list', async () => {
    const mockEvents = [
      {
        event_type: 'omninode.intelligence.query.requested.v1',
        event_id: 'evt-1',
        timestamp: new Date().toISOString(),
        tenant_id: 'default-tenant',
        namespace: 'development',
        source: 'omniarchon',
        correlation_id: 'corr-123',
        schema_ref: 'registry://omninode/intelligence/query_requested/v1',
        payload: {},
        topic: 'default-tenant.omninode.intelligence.v1',
        partition: 0,
        offset: '100',
        processed_at: new Date().toISOString(),
      },
    ];

    vi.mocked(eventBusSource.queryEvents).mockResolvedValue({
      events: mockEvents,
      count: 1,
      options: {},
    });
    vi.mocked(eventBusSource.getStatistics).mockResolvedValue({
      total_events: 1,
      events_by_type: { 'omninode.intelligence.query.requested.v1': 1 },
      events_by_tenant: { 'default-tenant': 1 },
      events_per_minute: 1,
      oldest_event: new Date().toISOString(),
      newest_event: new Date().toISOString(),
    });
    vi.mocked(eventBusSource.getStatus).mockResolvedValue({
      active: true,
      connected: true,
      status: 'running',
    });

    renderWithClient(<EventBusExplorer />);

    // Wait for the event to be displayed - look for the event type badge
    await waitFor(() => {
      expect(screen.getByText(/omninode\.intelligence\.query\.requested\.v1/)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Check that the events count is displayed
    expect(screen.getByText(/Events \(1\)/)).toBeInTheDocument();
  });

  it('should show empty state when no events', async () => {
    vi.mocked(eventBusSource.queryEvents).mockResolvedValue({
      events: [],
      count: 0,
      options: {},
    });
    vi.mocked(eventBusSource.getStatistics).mockResolvedValue({
      total_events: 0,
      events_by_type: {},
      events_by_tenant: {},
      events_per_minute: 0,
      oldest_event: null,
      newest_event: null,
    });
    vi.mocked(eventBusSource.getStatus).mockResolvedValue({
      active: true,
      connected: true,
      status: 'running',
    });

    renderWithClient(<EventBusExplorer />);

    await waitFor(() => {
      expect(screen.getByText(/Try adjusting your filters/)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Also check that Events (0) is displayed
    expect(screen.getByText(/Events \(0\)/)).toBeInTheDocument();
  });
});

