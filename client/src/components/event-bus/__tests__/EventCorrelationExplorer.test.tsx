/**
 * Tests for EventCorrelationExplorer Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventCorrelationExplorer } from '../EventCorrelationExplorer';
import { eventBusSource } from '@/lib/data-sources';

// Mock the data source
vi.mock('@/lib/data-sources', () => ({
  eventBusSource: {
    getEventChain: vi.fn(),
  },
}));

describe('EventCorrelationExplorer', () => {
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

  it('should render correlation explorer', () => {
    renderWithClient(<EventCorrelationExplorer />);

    expect(screen.getByText('Explore Event Correlation')).toBeInTheDocument();
  });

  it('should search for correlation ID', async () => {
    const user = userEvent.setup();
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

    vi.mocked(eventBusSource.getEventChain).mockResolvedValueOnce(mockEvents);

    renderWithClient(<EventCorrelationExplorer />);

    const input = screen.getByPlaceholderText('Enter correlation ID');
    await user.type(input, 'corr-123');
    await user.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(eventBusSource.getEventChain).toHaveBeenCalledWith('corr-123');
    });
  });

  it('should show empty state when no events found', async () => {
    vi.mocked(eventBusSource.getEventChain).mockResolvedValueOnce([]);

    renderWithClient(<EventCorrelationExplorer />);

    const input = screen.getByPlaceholderText('Enter correlation ID');
    await userEvent.type(input, 'corr-123');
    await userEvent.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText(/No events found for this correlation ID/)).toBeInTheDocument();
    });
  });
});

