import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import PlatformHealth from '@/_archive/pages/PlatformHealth';
import { platformHealthSource } from '@/lib/data-sources';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    platformHealthSource: {
      fetchAll: vi.fn(),
    },
  };
});

let queryClient: QueryClient | null = null;

function renderWithClient(ui: ReactNode) {
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
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { queryClient, ...result };
}

describe('PlatformHealth page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders loading state then populated metrics when data resolves', async () => {
    vi.mocked(platformHealthSource.fetchAll).mockResolvedValue({
      health: {
        timestamp: new Date().toISOString(),
        overallStatus: 'healthy',
        services: [
          { service: 'PostgreSQL', status: 'up', latencyMs: 10 },
          { service: 'Kafka/Redpanda', status: 'warning', latencyMs: 35 },
          { service: 'API Gateway', status: 'up', latencyMs: 45 },
          { service: 'Vector Store', status: 'down', latencyMs: 120 },
        ],
        summary: {
          total: 4,
          up: 2,
          down: 1,
          warning: 1,
        },
      },
      services: {
        services: [
          {
            id: 'svc-api',
            name: 'API Gateway',
            status: 'healthy',
            health: 'healthy',
            serviceUrl: 'https://api.local',
            serviceType: 'api',
            lastHealthCheck: new Date().toISOString(),
          },
          {
            id: 'svc-vector',
            name: 'Vector Store',
            status: 'down',
            health: 'unhealthy',
            serviceUrl: 'https://vector.local',
            serviceType: 'database',
            lastHealthCheck: null,
          },
        ],
      },
      isMock: false,
    });

    const result = renderWithClient(<PlatformHealth />);

    expect(screen.getByText('Loading platform health data...')).toBeInTheDocument();

    // Wait for data-dependent content to appear (not the always-visible page title)
    await waitFor(() => {
      expect(screen.getByText('Services Online')).toBeInTheDocument();
    });

    // Now verify other data-dependent content
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
    expect(screen.getByText('Platform Health')).toBeInTheDocument();
    expect(screen.getAllByText('API Gateway')[0]).toBeInTheDocument();
    expect(localStorageMocks.setItem).not.toHaveBeenCalled();

    result.unmount();
  });

  it('shows error banner when data fetching fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(platformHealthSource.fetchAll).mockRejectedValue(new Error('network down'));

    const result = renderWithClient(<PlatformHealth />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading health data:/)).toBeInTheDocument();
    });

    consoleError.mockRestore();
    result.unmount();
  });
});
