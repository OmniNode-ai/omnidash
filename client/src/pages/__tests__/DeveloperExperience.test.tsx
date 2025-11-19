import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: false,
    connectionStatus: 'disconnected',
  })),
}));

let queryClient: QueryClient | null = null;

function renderWithClient(ui: React.ReactNode) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        gcTime: Infinity,
        staleTime: Infinity,
        queryFn: getQueryFn({ on401: 'throw' }),
      },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
  return { queryClient, ...result };
}

describe('DeveloperExperience page', () => {
  const fetchMock = vi.spyOn(global, 'fetch');
  const localStorageMock = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorageMock.getItem.mockReturnValue('24h');
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    fetchMock.mockReset();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders key metrics and charts when data loads', async () => {
    const metricsResponse = {
      workflows: {
        workflows: [
          {
            agent_name: 'CodeAgent',
            total_workflows: 40,
            successful_workflows: 35,
            avg_duration_ms: 120000,
            improvement_percentage: 12,
          },
        ],
        total_developers: 8,
        total_code_generated: 12500,
      },
      velocity: {
        time_window: '24h',
        data: [
          { period: new Date().toISOString(), workflows_completed: 6, avg_duration_ms: 50000 },
        ],
      },
      productivity: {
        time_window: '24h',
        data: [
          { period: new Date().toISOString(), productivity_score: 78, code_generated: 500 },
        ],
        avg_productivity_gain: 34,
        pattern_reuse_rate: 0.82,
      },
    };

    const velocityResponse = [
      {
        date: '2024-01-01 10:00',
        tasksCompleted: 12,
        avgDurationMs: 60000,
        tasksPerDay: 24,
      },
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/intelligence/developer/task-velocity')) {
        return Promise.resolve(new Response(JSON.stringify(velocityResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url.includes('/api/intelligence/developer/metrics')) {
        return Promise.resolve(new Response(JSON.stringify(metricsResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    const { default: DeveloperExperience } = await import('../DeveloperExperience');

    const result = renderWithClient(<DeveloperExperience />);

    await waitFor(() => {
      expect(screen.getByText('Developer Experience')).toBeInTheDocument();
    });

    expect(screen.getByText('Active Developers (24h)')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Code Generated')).toBeInTheDocument();
    expect(screen.getByText('12.5k')).toBeInTheDocument();
    expect(screen.getByText('Productivity Gain')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('Pattern Reuse')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();

    result.unmount();
  });

  it('renders error state when developer metrics fetch fails', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/intelligence/developer/metrics')) {
        return Promise.resolve(new Response('fail', { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    const { default: DeveloperExperience } = await import('../DeveloperExperience');

    const result = renderWithClient(<DeveloperExperience />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load developer metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('500: fail')).toBeInTheDocument();

    result.unmount();
  });
});
