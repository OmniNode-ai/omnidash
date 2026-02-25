import { render, screen, waitFor } from '@testing-library/react';
import _userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

let queryClient: QueryClient | null = null;

async function renderWithClient(ui: React.ReactNode) {
  // Dynamically import DemoModeProvider so that after vi.resetModules() the
  // provider and the component under test share the same Context instance.
  const { DemoModeProvider } = await import('../../contexts/DemoModeContext');

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
    <QueryClientProvider client={queryClient}>
      <DemoModeProvider>{ui}</DemoModeProvider>
    </QueryClientProvider>
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

  it('renders recent traces panel with empty state and sample fallback', async () => {
    // Mock the recent traces endpoint to return an empty array
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    const result = await renderWithClient(<CorrelationTrace />);

    // Wait for the fetch to resolve and empty state to render
    await waitFor(() => {
      expect(screen.getByText('No recent traces found')).toBeInTheDocument();
    });

    expect(screen.getByText('Recent Traces')).toBeInTheDocument();
    expect(screen.getByText('Sample Data')).toBeInTheDocument();

    result.unmount();
  });

  it('renders recent traces table when API returns data', async () => {
    const recentTraces = [
      {
        correlationId: 'abc-123-def-456',
        selectedAgent: 'code-analyst',
        confidenceScore: 0.95,
        userRequest: 'Analyze the auth module',
        routingTimeMs: 42,
        createdAt: new Date().toISOString(),
        eventCount: 3,
      },
    ];

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(recentTraces), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    const result = await renderWithClient(<CorrelationTrace />);

    await waitFor(() => {
      expect(screen.getByText('code-analyst')).toBeInTheDocument();
    });

    expect(screen.getByText('95%')).toBeInTheDocument();

    result.unmount();
  });

  it('shows error state when recent traces fetch fails', async () => {
    vi.resetModules();
    vi.doMock('@tanstack/react-query', async () => {
      const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
      return {
        ...actual,
        useQuery: () =>
          ({
            data: undefined,
            error: new Error('Failed to fetch trace'),
            isLoading: false,
          }) as any,
      };
    });

    const { default: CorrelationTrace } = await import('../CorrelationTrace');

    const result = await renderWithClient(<CorrelationTrace />);

    expect(screen.getByText('Failed to load recent traces')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch trace')).toBeInTheDocument();

    result.unmount();

    vi.doUnmock('@tanstack/react-query');
    vi.resetModules();
  });
});
