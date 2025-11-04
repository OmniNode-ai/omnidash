import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DrillDownPanel } from '../DrillDownPanel';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DrillDownPanel', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockFetch.mockClear();
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  describe('Agent Details', () => {
    it('should fetch and display agent details from API', async () => {
      const mockAgentData = {
        name: 'agent-api',
        status: 'active',
        successRate: 95.5,
        responseTime: 250,
        tasksCompleted: 100,
        currentTask: 'Processing request',
        recentActivity: [
          {
            id: '1',
            timestamp: new Date().toISOString(),
            description: 'Completed task: API request',
          },
        ],
        metrics: {
          totalRequests: 150,
          avgConfidence: 0.87,
          avgRoutingTime: 45.5,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentData,
      });

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="agent-api"
        />
      );

      // Should show loading state initially
      expect(screen.getByText(/detailed information and metrics/i)).toBeInTheDocument();

      // Wait for data to load
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/intelligence/agents/agent-api/details')
        );
      });

      // Verify agent data is displayed
      await waitFor(() => {
        expect(screen.getByText('95.5%')).toBeInTheDocument();
        expect(screen.getByText('250ms')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('87.0%')).toBeInTheDocument(); // avgConfidence * 100
        expect(screen.getByText('45.5ms')).toBeInTheDocument(); // avgRoutingTime
      });
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch agent details'));

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="agent-api"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed to load details/i)).toBeInTheDocument();
      });
    });

    it('should handle 404 errors when agent not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Agent not found' }),
      });

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="nonexistent-agent"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed to load details/i)).toBeInTheDocument();
      });
    });
  });

  describe('Pattern Details', () => {
    it('should fetch and display pattern details from API', async () => {
      const mockPatternData = {
        id: 'pattern-123',
        name: 'ONEX Effect Pattern',
        quality: 85,
        usage: 50,
        category: 'architectural',
        description: 'Standard ONEX effect node pattern',
        trend: 12.5,
        usageExamples: [
          {
            id: '1',
            project: 'omniarchon',
            module: 'node_effect.py',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatternData,
      });

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Pattern Details"
          type="pattern"
          entityId="pattern-123"
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/intelligence/patterns/pattern-123/details')
        );
      });

      // Verify pattern data is displayed
      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
        expect(screen.getByText('50x')).toBeInTheDocument();
        expect(screen.getByText('architectural')).toBeInTheDocument();
        expect(screen.getByText(/standard onex effect node pattern/i)).toBeInTheDocument();
        expect(screen.getByText('+12.5%')).toBeInTheDocument();
      });
    });
  });

  describe('Service Details', () => {
    it('should fetch and display service health details from API', async () => {
      const mockServiceData = {
        name: 'PostgreSQL',
        status: 'healthy',
        uptime: 99.9,
        responseTime: 15,
        lastCheck: new Date().toISOString(),
        details: {
          version: '14.5',
          connections: 42,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockServiceData,
      });

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Service Health"
          type="service"
          entityId="PostgreSQL"
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/intelligence/services/PostgreSQL/details')
        );
      });

      // Verify service data is displayed
      await waitFor(() => {
        expect(screen.getByText('99.9%')).toBeInTheDocument();
        expect(screen.getByText('15ms')).toBeInTheDocument();
        expect(screen.getByText('healthy')).toBeInTheDocument();
      });
    });
  });

  describe('Legacy Data Support', () => {
    it('should support passing data directly (legacy mode)', () => {
      const legacyData = {
        status: 'active',
        successRate: 90,
        responseTime: 100,
        tasksCompleted: 50,
        currentTask: 'Test task',
        recentActivity: [],
      };

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          data={legacyData}
        />
      );

      // Should not fetch from API when data is provided
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify data is displayed
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('100ms')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should display loading state while fetching data', () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="agent-api"
        />
      );

      // Should show skeleton loading state (Skeleton components render as animated divs)
      const loadingElements = document.querySelectorAll('.animate-pulse');
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe('Query Enablement', () => {
    it('should not fetch data when panel is closed', () => {
      renderWithQueryClient(
        <DrillDownPanel
          open={false}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="agent-api"
        />
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not fetch data when entityId is null', () => {
      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId={null}
        />
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Time Window Support', () => {
    it('should pass timeWindow parameter to agent details API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'agent-api',
          status: 'active',
          successRate: 95,
          responseTime: 250,
          tasksCompleted: 100,
          currentTask: null,
          recentActivity: [],
          metrics: {
            totalRequests: 150,
            avgConfidence: 0.87,
            avgRoutingTime: 45.5,
          },
        }),
      });

      renderWithQueryClient(
        <DrillDownPanel
          open={true}
          onOpenChange={() => {}}
          title="Agent Details"
          type="agent"
          entityId="agent-api"
          timeWindow="7d"
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('timeWindow=7d')
        );
      });
    });
  });
});
