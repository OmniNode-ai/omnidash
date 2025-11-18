import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import AgentOperations from '../AgentOperations';
import { agentOperationsSource } from '@/lib/data-sources';
import { useWebSocket } from '@/hooks/useWebSocket';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: true,
    connectionStatus: 'connected',
  })),
}));

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    agentOperationsSource: {
      fetchAll: vi.fn(),
    },
  };
});

function renderWithClient(ui: ReactNode) {
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

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return queryClient;
}

describe('AgentOperations page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  it('shows loading indicator before data resolves and renders dashboard afterwards', async () => {
    const now = new Date().toISOString();
    vi.mocked(agentOperationsSource.fetchAll).mockResolvedValue({
      summary: {
        totalAgents: 5,
        activeAgents: 3,
        totalRuns: 540,
        successRate: 0.93,
        avgExecutionTime: 0.12,
      },
      recentActions: [
        {
          id: 'action-1',
          agentId: 'agent-alpha',
          agentName: 'Agent Alpha',
          correlationId: 'corr-1',
          action: 'tool_call',
          status: 'success',
          actionName: 'Read File',
          actionType: 'tool_call',
          actionDetails: {},
          debugMode: false,
          duration: 120,
          timestamp: now,
        },
      ],
      perAgentMetrics: [
        {
          agent: 'Agent Alpha',
          totalRequests: 120,
          successRate: 0.97,
          avgRoutingTime: 85,
          avgConfidence: 0.92,
        },
        {
          agent: 'Agent Beta',
          totalRequests: 80,
          successRate: 0.74,
          avgRoutingTime: 140,
          avgConfidence: 0.65,
        },
      ],
      health: {
        status: 'healthy',
        services: [],
      },
      chartData: [],
      qualityChartData: [],
      operations: [],
      totalOperations: 0,
      runningOperations: 0,
      totalOpsPerMinute: 0,
      avgQualityImprovement: 0,
      isMock: false,
    });

    renderWithClient(<AgentOperations />);

    expect(screen.getByText('Loading agent operations data...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Agent Operations')).toBeInTheDocument();
    });

    expect(screen.getByText('Active Agents (24h)')).toBeInTheDocument();
    expect(screen.getAllByText('Agent Alpha').length).toBeGreaterThan(0);
    expect(screen.getByText('Live Event Stream')).toBeInTheDocument();
    expect(vi.mocked(useWebSocket)).toHaveBeenCalled();
  });

  it('renders error state when data fetching fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(agentOperationsSource.fetchAll).mockRejectedValue(new Error('backend unavailable'));

    renderWithClient(<AgentOperations />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load agent data')).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  it('allows switching from active-only view to all agents', async () => {
    const now = new Date().toISOString();
    vi.mocked(agentOperationsSource.fetchAll).mockResolvedValue({
      summary: {
        totalAgents: 2,
        activeAgents: 0,
        totalRuns: 10,
        successRate: 0.5,
        avgExecutionTime: 0.5,
      },
      recentActions: [
        {
          id: 'action-2',
          agentId: 'agent-gamma',
          agentName: 'Agent Gamma',
          correlationId: 'corr-2',
          action: 'analysis',
          status: 'success',
          actionName: 'Plan Task',
          actionType: 'analysis',
          actionDetails: {},
          debugMode: false,
          duration: 250,
          timestamp: now,
        },
      ],
      perAgentMetrics: [
        {
          agent: 'Agent Gamma',
          totalRequests: 5,
          successRate: 0.4,
          avgRoutingTime: 200,
          avgConfidence: 0.5,
        },
      ],
      health: {
        status: 'degraded',
        services: [],
      },
      chartData: [],
      qualityChartData: [],
      operations: [],
      totalOperations: 0,
      runningOperations: 0,
      totalOpsPerMinute: 0,
      avgQualityImprovement: 0,
      isMock: false,
    });

    renderWithClient(<AgentOperations />);

    await waitFor(() => {
      expect(screen.getByText('Agent Operations')).toBeInTheDocument();
    });

    expect(screen.getByText('No active agents right now.')).toBeInTheDocument();

    const showAllButton = screen.getByText('Show All');
    fireEvent.click(showAllButton);

    await waitFor(() => {
      expect(screen.queryByText('No active agents right now.')).not.toBeInTheDocument();
    });

    const gammaMatches = await screen.findAllByText('Agent Gamma');
    expect(gammaMatches.length).toBeGreaterThan(0);
  });
});
