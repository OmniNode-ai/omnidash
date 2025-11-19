import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

let queryClient: QueryClient | null = null;

function renderWithClient(ui: React.ReactNode) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false, // Disable polling in tests to prevent infinite loops
        refetchOnWindowFocus: false,
        gcTime: Infinity, // Disable garbage collection to prevent cleanup during tests
        staleTime: Infinity, // Never consider data stale in tests
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('CorrelationTrace page', () => {
  const fetchSpy = vi.spyOn(global, 'fetch');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
    fetchSpy.mockReset();
  });

  it('renders sample trace summary by default', async () => {
    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    const result = renderWithClient(<CorrelationTrace />);

    await waitFor(() => {
      expect(screen.getByText('Trace Results')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Routing Decisions')).toBeInTheDocument();
    expect(screen.getAllByText('4')[0]).toBeInTheDocument();

    result.unmount();
  });

  it('shows error card when trace fetch fails for searched ID', async () => {
    vi.resetModules();
    vi.doMock('@tanstack/react-query', async () => {
      const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
      return {
        ...actual,
        useQuery: () => ({
          data: undefined,
          error: new Error('Failed to fetch trace'),
          isLoading: false,
        } as any),
      };
    });

    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    const result = renderWithClient(<CorrelationTrace />);

    expect(screen.getByText('Error Loading Trace')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch trace')).toBeInTheDocument();

    result.unmount();

    vi.doUnmock('@tanstack/react-query');
    vi.resetModules();
  });
});
