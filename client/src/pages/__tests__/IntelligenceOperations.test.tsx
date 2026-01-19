import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { getQueryFn } from '@/lib/queryClient';

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: false,
    connectionStatus: 'disconnected',
  })),
}));

// Create a mock fetchAll function that can be configured per test
const mockFetchAll = vi.fn();

vi.mock('@/lib/data-sources', () => ({
  agentOperationsSource: {
    fetchAll: mockFetchAll,
  },
}));

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false, // Disable polling in tests to prevent infinite loops
        refetchOnWindowFocus: false,
        gcTime: Infinity,
        staleTime: Infinity,
        queryFn: getQueryFn({ on401: 'throw' }),
      },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return { queryClient, ...result };
}

describe('IntelligenceOperations page', () => {
  const fetchSpy = vi.spyOn(global, 'fetch');
  const localStorageMock = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
  };
  let queryClient: QueryClient | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorageMock.getItem.mockReturnValue('24h');
    mockFetchAll.mockReset();
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    fetchSpy.mockReset();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function mockFetchResponses(
    options: { hasRecentActions?: boolean; transformationTotal?: number } = {}
  ) {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/intelligence/transformations/summary')) {
        const total = options.transformationTotal ?? 4;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              summary: {
                totalTransformations: total,
                uniqueSourceAgents: 3,
                uniqueTargetAgents: 2,
                avgTransformationTimeMs: 150,
                successRate: 0.92,
                mostCommonTransformation:
                  total > 0
                    ? { source: 'agent-api-architect', target: 'agent-polymorphic-agent', count: 3 }
                    : null,
              },
              sankey: {
                nodes: [
                  { id: 'agent-api-architect', label: 'API Architect' },
                  { id: 'agent-polymorphic-agent', label: 'Polymorphic Agent' },
                  { id: 'agent-testing', label: 'Testing Agent' },
                ],
                links:
                  total > 0
                    ? [
                        {
                          source: 'agent-api-architect',
                          target: 'agent-polymorphic-agent',
                          value: 3,
                          avgConfidence: 0.9,
                        },
                        {
                          source: 'agent-polymorphic-agent',
                          target: 'agent-testing',
                          value: 1,
                          avgConfidence: 0.8,
                        },
                      ]
                    : [],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      if (url.includes('/api/intelligence/health/manifest-injection')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              successRate: 0.82,
              avgLatencyMs: 120,
              failedInjections: [],
              manifestSizeStats: { avgSizeKb: 12, minSizeKb: 4, maxSizeKb: 22 },
              latencyTrend: [],
              serviceHealth: {
                postgresql: { status: 'up', latencyMs: 30 },
                omniarchon: { status: 'up', latencyMs: 45 },
                qdrant: { status: 'up', latencyMs: 50 },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      if (url.includes('/api/intelligence/actions/recent')) {
        const payload = options.hasRecentActions
          ? [
              {
                id: 'action-1',
                correlationId: 'corr-1',
                agentName: 'Routing Agent',
                actionType: 'tool_call',
                actionName: 'Read File',
                actionDetails: {},
                debugMode: false,
                durationMs: 1200,
                createdAt: new Date().toISOString(),
              },
            ]
          : [];
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (url.includes('/api/intelligence/documents/top-accessed')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'doc-1',
                repository: 'awesome-service',
                filePath: 'src/agents/router.ts',
                accessCount: 12,
                lastAccessedAt: new Date().toISOString(),
                trend: 'up',
                trendPercentage: 18,
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  }

  it('renders operations metrics, charts, and live events', async () => {
    mockFetchResponses({ hasRecentActions: true });

    const operationsData = {
      summary: {
        totalAgents: 5,
        activeAgents: 3,
        totalRuns: 50,
        successRate: 0.9,
        avgExecutionTime: 1.2,
      },
      recentActions: [],
      perAgentMetrics: [],
      health: {
        status: 'healthy',
        services: [],
      },
      chartData: [
        { time: '10:00', value: 5 },
        { time: '10:05', value: 7 },
      ],
      qualityChartData: [{ time: '10:00', value: 2.5 }],
      operations: [
        {
          id: 'op-1',
          name: 'Manifest Injection',
          status: 'running',
          count: 4,
          avgTime: '1.2s',
        },
      ],
      totalOperations: 6,
      runningOperations: 2,
      totalOpsPerMinute: 3.4,
      avgQualityImprovement: 0.24,
      isMock: false,
    };

    // Configure mock before rendering
    mockFetchAll.mockResolvedValue(operationsData);

    const { default: IntelligenceOperations } = await import('../IntelligenceOperations');

    const result = renderWithClient(<IntelligenceOperations />);
    queryClient = result.queryClient;

    // Wait for the data to load (no longer showing loading state)
    await waitFor(() => {
      expect(screen.getByText('Intelligence Operations')).toBeInTheDocument();
      // Verify loading is complete by checking for actual data
      expect(screen.queryByText('Loading AI operations data...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Active Operations')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Operations/Min')).toBeInTheDocument();
    expect(screen.getByText('3.4')).toBeInTheDocument();
    expect(screen.getByText('Quality Improvement Impact')).toBeInTheDocument();
    expect(screen.getByText('Manifest Injection')).toBeInTheDocument();
    // Live events are populated from /api/intelligence/actions/recent endpoint
    expect(await screen.findByText(/Read File executed by Routing Agent/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();

    result.unmount();
  });

  it('shows empty state when no operations are available', async () => {
    mockFetchResponses({ hasRecentActions: false, transformationTotal: 0 });

    // Configure mock to return empty data
    mockFetchAll.mockResolvedValue({
      summary: {
        totalAgents: 0,
        activeAgents: 0,
        totalRuns: 0,
        successRate: 0,
        avgExecutionTime: 0,
      },
      recentActions: [],
      perAgentMetrics: [],
      health: { status: 'healthy', services: [] },
      chartData: [],
      qualityChartData: [],
      operations: [],
      totalOperations: 0,
      runningOperations: 0,
      totalOpsPerMinute: 0,
      avgQualityImprovement: 0,
      isMock: false,
    });

    const { default: IntelligenceOperations } = await import('../IntelligenceOperations');

    const result = renderWithClient(<IntelligenceOperations />);
    queryClient = result.queryClient;

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Intelligence Operations')).toBeInTheDocument();
      expect(screen.queryByText('Loading AI operations data...')).not.toBeInTheDocument();
    });

    expect(
      screen.getByText('No operations data available for selected time range')
    ).toBeInTheDocument();

    result.unmount();
  });
});
