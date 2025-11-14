/**
 * Tests for EventStatisticsPanel Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventStatisticsPanel } from '../EventStatisticsPanel';
import { eventBusSource } from '@/lib/data-sources';

// Mock the data source
vi.mock('@/lib/data-sources', () => ({
  eventBusSource: {
    getStatistics: vi.fn(),
  },
}));

describe('EventStatisticsPanel', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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

  it('should render statistics panel', async () => {
    vi.mocked(eventBusSource.getStatistics).mockResolvedValueOnce({
      total_events: 100,
      events_by_type: { 'type1': 50 },
      events_by_tenant: { 'tenant1': 100 },
      events_per_minute: 10,
      oldest_event: new Date().toISOString(),
      newest_event: new Date().toISOString(),
    });

    renderWithClient(<EventStatisticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Event Statistics')).toBeInTheDocument();
    });
  });

  it('should display statistics metrics', async () => {
    vi.mocked(eventBusSource.getStatistics).mockResolvedValueOnce({
      total_events: 250,
      events_by_type: { 'type1': 150, 'type2': 100 },
      events_by_tenant: { 'tenant1': 200, 'tenant2': 50 },
      events_per_minute: 20.5,
      oldest_event: new Date().toISOString(),
      newest_event: new Date().toISOString(),
    });

    renderWithClient(<EventStatisticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('250')).toBeInTheDocument(); // Total events
      expect(screen.getByText('20.5')).toBeInTheDocument(); // Events/min
    });
  });

  it('should handle loading state', () => {
    vi.mocked(eventBusSource.getStatistics).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithClient(<EventStatisticsPanel />);

    expect(screen.getByText('Event Statistics')).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    vi.mocked(eventBusSource.getStatistics).mockRejectedValueOnce(new Error('Failed'));

    renderWithClient(<EventStatisticsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load statistics/)).toBeInTheDocument();
    });
  });
});

