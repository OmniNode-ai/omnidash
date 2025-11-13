import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, vi } from 'vitest';
import EventFlow from '../EventFlow';
import { eventFlowSource } from '@/lib/data-sources';

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
  };
});

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return queryClient;
}

describe('EventFlow page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  it('renders metrics, charts, and recent events on success', async () => {
    const now = new Date().toISOString();
    vi.mocked(eventFlowSource.fetchEvents).mockResolvedValue({
      events: [
        { id: 'evt-1', timestamp: now, type: 'throughput', data: { correlationId: 'abc123', count: 100 } },
      ],
      metrics: {
        totalEvents: 1,
        uniqueTypes: 1,
        eventsPerMinute: 120,
        avgProcessingTime: 45,
        topicCounts: new Map<string, number>([['throughput', 120]]),
        totalEventsProcessed: 1,
        uniqueSources: 1,
      },
      chartData: {
        throughput: [
          { time: now, value: 10 },
        ],
        lag: [
          { time: now, value: 1.5 },
        ],
      },
      isMock: false,
    });

    renderWithClient(<EventFlow />);

    await waitFor(() => {
      expect(screen.getByText('Event Flow')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    expect(screen.getByText('Events/min')).toBeInTheDocument();
    expect(screen.getByText('Recent Events (Last 10)')).toBeInTheDocument();
    expect(screen.getAllByText('throughput').length).toBeGreaterThan(0);
  });

  it('surfaces error state when fetching fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(eventFlowSource.fetchEvents).mockRejectedValue(new Error('stream offline'));

    renderWithClient(<EventFlow />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading events/)).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  it('shows empty state when no events are available', async () => {
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

    renderWithClient(<EventFlow />);

    await waitFor(() => {
      expect(screen.getByText('Event Flow')).toBeInTheDocument();
    });

    expect(screen.getByText('No events found. Waiting for new events...')).toBeInTheDocument();
  });
});
