import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, type QueryObserverOptions } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import EventFlow from '../EventFlow';
import React from 'react';

vi.mock('@/components/TimeRangeSelector', () => ({
  TimeRangeSelector: ({ value }: { value: string }) => (
    <div data-testid="time-range-selector">{value}</div>
  ),
}));

vi.mock('@/components/event-bus/EventStatisticsPanel', () => ({
  EventStatisticsPanel: () => <div data-testid="event-statistics-panel" />,
}));

vi.mock('@/components/event-bus/EventSearchBar', () => ({
  EventSearchBar: () => <div data-testid="event-search-bar" />,
}));

vi.mock('@/components/RealtimeChart', () => ({
  RealtimeChart: ({ title }: { title: string }) => <div data-testid={`realtime-chart-${title}`} />,
}));

vi.mock('@/components/ExportButton', () => ({
  ExportButton: () => <button type="button">Export</button>,
}));

vi.mock('@/components/event-bus/EventTypeBadge', () => ({
  EventTypeBadge: ({ eventType }: { eventType: string }) => <span>{eventType}</span>,
}));

vi.mock('@/components/event-bus/EventBusHealthIndicator', () => ({
  EventBusHealthIndicator: () => <div data-testid="health-indicator" />,
}));

vi.mock('@/components/MetricCard', () => ({
  MetricCard: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@/components/MockBadge', () => ({
  MockBadge: ({ label }: { label: string }) => <div>{label}</div>,
}));

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    eventFlowSource: {
      fetchEvents: vi.fn(),
    },
    eventBusSource: {
      queryEvents: vi.fn(),
      getStatistics: vi.fn(),
      getStatus: vi.fn(),
      getEventChain: vi.fn(),
    },
  };
});

// Import after mock
import { eventFlowSource, eventBusSource } from '@/lib/data-sources';

const testQueryOverrides = {
  eventBus: {
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  },
  legacy: {
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  },
} satisfies {
  eventBus: Pick<QueryObserverOptions, 'refetchInterval' | 'refetchOnWindowFocus' | 'staleTime'>;
  legacy: Pick<QueryObserverOptions, 'refetchInterval' | 'refetchOnWindowFocus' | 'staleTime'>;
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false, // Disable polling in tests to prevent infinite loops
        refetchOnWindowFocus: false,
        gcTime: Infinity, // Keep cache consistent with staleTime to avoid refetch churn
        staleTime: Infinity, // Never consider data stale in tests
      },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return { queryClient, ...result };
}

function renderEventFlow() {
  return renderWithClient(<EventFlow queryBehaviorOverrides={testQueryOverrides} />);
}

describe('EventFlow page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;
  let queryClient: QueryClient | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // Ensure real timers before each test
    // Mock localStorage with key-specific returns
    localStorageMocks.getItem.mockImplementation((key) => {
      if (key === 'dashboard-timerange') return '24h';
      return null;
    });
    // Reset all mocks to return empty/default values
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
    vi.mocked(eventFlowSource.fetchEvents).mockResolvedValue({
      events: [],
      metrics: {
        totalEvents: 0,
        uniqueTypes: 0,
        eventsPerMinute: 0,
        avgProcessingTime: 0,
        topicCounts: new Map<string, number>(),
      },
      chartData: {
        throughput: [],
        lag: [],
      },
      isMock: false,
    });
  });

  afterEach(async () => {
    // Clean up React Query cache to prevent memory leaks
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries(); // Cancel any in-flight queries
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders metrics, charts, and recent events on success', async () => {
    const now = new Date().toISOString();
    vi.mocked(eventFlowSource.fetchEvents).mockResolvedValue({
      events: [
        {
          id: 'evt-1',
          timestamp: now,
          type: 'throughput',
          source: 'api',
          data: { correlationId: 'abc123', count: 100 },
        },
      ],
      metrics: {
        totalEvents: 1,
        uniqueTypes: 1,
        eventsPerMinute: 120,
        avgProcessingTime: 45,
        topicCounts: new Map<string, number>([['throughput', 120]]),
      },
      chartData: {
        throughput: [{ time: now, value: 10 }],
        lag: [{ time: now, value: 1.5 }],
      },
      isMock: false,
    });

    const result = renderEventFlow();
    queryClient = result.queryClient;

    await waitFor(
      () => {
        expect(screen.getByText('Event Flow')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    expect(screen.getByText('Events/min')).toBeInTheDocument();

    result.unmount(); // Explicitly unmount component
  }, 10000);

  it('surfaces error state when fetching fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(eventBusSource.queryEvents).mockRejectedValue(new Error('event bus offline'));
    vi.mocked(eventBusSource.getStatus).mockResolvedValue({
      active: false,
      connected: false,
      status: 'stopped',
    });

    const result = renderEventFlow();
    queryClient = result.queryClient;

    await waitFor(
      () => {
        expect(screen.getByText(/Error loading events: event bus offline/)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    consoleError.mockRestore();
    result.unmount(); // Explicitly unmount component
  }, 10000);

  it('shows empty state when no events are available', async () => {
    const result = renderEventFlow();
    queryClient = result.queryClient;

    // Wait for the component to render and data to be loaded
    await waitFor(
      () => {
        expect(screen.getByText('Event Flow')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Verify specific empty state message is rendered
    await waitFor(
      () => {
        expect(screen.getByText('No events found. Waiting for new events...')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Verify the empty state doesn't show "Recent Events" heading when no events
    expect(screen.queryByText(/Recent Events/)).not.toBeInTheDocument();

    result.unmount(); // Explicitly unmount component
  }, 10000);
});
