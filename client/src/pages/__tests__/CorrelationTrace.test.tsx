import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
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

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('CorrelationTrace page', () => {
  const fetchSpy = vi.spyOn(global, 'fetch');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('renders sample trace summary by default', async () => {
    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    renderWithClient(<CorrelationTrace />);

    await waitFor(() => {
      expect(screen.getByText('Trace Results')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Routing Decisions')).toBeInTheDocument();
    expect(screen.getAllByText('4')[0]).toBeInTheDocument();
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

    renderWithClient(<CorrelationTrace />);

    expect(screen.getByText('Error Loading Trace')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch trace')).toBeInTheDocument();

    vi.doUnmock('@tanstack/react-query');
    vi.resetModules();
  });
});
