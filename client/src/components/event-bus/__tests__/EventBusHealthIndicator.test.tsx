/**
 * Tests for EventBusHealthIndicator Component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventBusHealthIndicator } from '../EventBusHealthIndicator';
import { eventBusSource } from '@/lib/data-sources';

// Mock the data source
vi.mock('@/lib/data-sources', () => ({
  eventBusSource: {
    getStatus: vi.fn(),
  },
}));

describe('EventBusHealthIndicator', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchInterval: false,
          refetchOnWindowFocus: false,
          gcTime: Infinity,
          staleTime: Infinity,
        },
      },
    });
  });

  afterEach(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderWithClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('should render health indicator with label when showLabel is true', async () => {
    vi.mocked(eventBusSource.getStatus).mockResolvedValueOnce({
      active: true,
      connected: true,
      status: 'running',
    });

    const result = renderWithClient(<EventBusHealthIndicator showLabel={true} />);

    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    result.unmount();
  });

  it('should hide label when showLabel is false', async () => {
    vi.mocked(eventBusSource.getStatus).mockResolvedValueOnce({
      active: true,
      connected: true,
      status: 'running',
    });

    const result = renderWithClient(<EventBusHealthIndicator showLabel={false} />);

    await waitFor(() => {
      // Status badge should be visible but label text should not
      expect(screen.queryByText('Running')).not.toBeInTheDocument();
    });

    // The badge itself should still be rendered
    const badge = result.container.querySelector('[class*="badge"]');
    expect(badge).toBeInTheDocument();
    // Verify the label text is not in the badge
    expect(badge?.textContent).not.toContain('Running');

    result.unmount();
  });

  it('should show disconnected status', async () => {
    vi.mocked(eventBusSource.getStatus).mockResolvedValueOnce({
      active: false,
      connected: false,
      status: 'stopped',
    });

    const result = renderWithClient(<EventBusHealthIndicator />);

    await waitFor(() => {
      expect(screen.getByText('Stopped')).toBeInTheDocument();
    });

    result.unmount();
  });

  it('should handle loading state', () => {
    vi.mocked(eventBusSource.getStatus).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const result = renderWithClient(<EventBusHealthIndicator />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    result.unmount();
  });
});

