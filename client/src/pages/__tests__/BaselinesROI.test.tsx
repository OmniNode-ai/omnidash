/**
 * BaselinesROI Page Tests (OMN-2156)
 *
 * Tests for the Baselines & ROI dashboard page.
 * Covers: rendering, loading states, data display, empty state, error handling.
 */

import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import BaselinesROI from '@/pages/BaselinesROI';
import { baselinesSource } from '@/lib/data-sources/baselines-source';
import type {
  BaselinesSummary,
  PatternComparison,
  ROITrendPoint,
  RecommendationBreakdown,
} from '@shared/baselines-types';

// ===========================
// Mocks
// ===========================

vi.mock('@/lib/data-sources/baselines-source', () => ({
  baselinesSource: {
    summary: vi.fn(),
    comparisons: vi.fn(),
    trend: vi.fn(),
    breakdown: vi.fn(),
    isUsingMockData: false,
  },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isConnected: false,
    connectionStatus: 'disconnected',
  }),
}));

// Mock recharts to avoid rendering complexity in JSDOM
vi.mock('recharts', () => {
  const MockChart = ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-chart">{children}</div>
  );
  return {
    ResponsiveContainer: MockChart,
    ComposedChart: MockChart,
    BarChart: MockChart,
    Bar: () => null,
    Cell: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

// ===========================
// Test Helpers
// ===========================

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

function createMockSummary(overrides: Partial<BaselinesSummary> = {}): BaselinesSummary {
  return {
    total_comparisons: 12,
    promote_count: 5,
    shadow_count: 3,
    suppress_count: 2,
    fork_count: 2,
    avg_cost_savings: 0.24,
    avg_outcome_improvement: 0.12,
    total_token_savings: 34_800,
    total_time_savings_ms: 8_600,
    ...overrides,
  };
}

function createMockComparison(overrides: Partial<PatternComparison> = {}): PatternComparison {
  return {
    pattern_id: 'pat-0001',
    pattern_name: 'Error Retry with Backoff',
    sample_size: 150,
    window_start: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
    window_end: new Date().toISOString(),
    token_delta: {
      label: 'Token Usage',
      baseline: 12000,
      candidate: 8400,
      delta: -3600,
      direction: 'lower_is_better',
      unit: 'tokens',
    },
    time_delta: {
      label: 'Execution Time',
      baseline: 3200,
      candidate: 2240,
      delta: -960,
      direction: 'lower_is_better',
      unit: 'ms',
    },
    retry_delta: {
      label: 'Retry Count',
      baseline: 2.4,
      candidate: 1.7,
      delta: -0.7,
      direction: 'lower_is_better',
      unit: 'retries',
    },
    test_pass_rate_delta: {
      label: 'Test Pass Rate',
      baseline: 0.82,
      candidate: 0.943,
      delta: 0.123,
      direction: 'higher_is_better',
      unit: '%',
    },
    review_iteration_delta: {
      label: 'Review Iterations',
      baseline: 2.8,
      candidate: 2.0,
      delta: -0.8,
      direction: 'lower_is_better',
      unit: 'iterations',
    },
    recommendation: 'promote',
    confidence: 'high',
    rationale:
      'Candidate shows consistent cost reduction with improved outcomes across all key metrics.',
    ...overrides,
  };
}

function createMockBreakdown(): RecommendationBreakdown[] {
  return [
    { action: 'promote', count: 5, avg_confidence: 0.88 },
    { action: 'shadow', count: 3, avg_confidence: 0.62 },
    { action: 'suppress', count: 2, avg_confidence: 0.79 },
    { action: 'fork', count: 2, avg_confidence: 0.55 },
  ];
}

function createMockTrend(): ROITrendPoint[] {
  return Array.from({ length: 3 }, (_, i) => ({
    date: `2026-02-${String(i + 1).padStart(2, '0')}`,
    avg_cost_savings: 0.2 + i * 0.01,
    avg_outcome_improvement: 0.1 + i * 0.005,
    comparisons_evaluated: 10,
  }));
}

// ===========================
// Test Suite
// ===========================

describe('BaselinesROI page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
  });

  // ===========================
  // Basic Rendering
  // ===========================

  describe('Basic Rendering', () => {
    it('renders the page with title and hero metric', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([createMockComparison()]);
      vi.mocked(baselinesSource.trend).mockResolvedValue(createMockTrend());
      vi.mocked(baselinesSource.breakdown).mockResolvedValue(createMockBreakdown());

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('Baselines & ROI')).toBeInTheDocument();
      });

      expect(screen.getByTestId('page-baselines-roi')).toBeInTheDocument();
      expect(
        screen.getByText('Cost + outcome comparison for A/B pattern evaluation')
      ).toBeInTheDocument();

      result.unmount();
    });

    it('shows loading skeletons while data is loading', async () => {
      vi.mocked(baselinesSource.summary).mockImplementation(() => new Promise(() => {}));
      vi.mocked(baselinesSource.comparisons).mockImplementation(() => new Promise(() => {}));
      vi.mocked(baselinesSource.trend).mockImplementation(() => new Promise(() => {}));
      vi.mocked(baselinesSource.breakdown).mockImplementation(() => new Promise(() => {}));

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);

      result.unmount();
    });
  });

  // ===========================
  // Summary Metrics
  // ===========================

  describe('Summary Metrics', () => {
    it('displays hero metric with cost savings value', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      // Wait for the hero value to render (data loaded)
      await waitFor(() => {
        // The hero metric shows 24.0% as the large font-mono value
        expect(screen.getByText('24.0%')).toBeInTheDocument();
      });

      // Hero label is always present
      expect(screen.getByText('Average Cost Savings')).toBeInTheDocument();

      result.unmount();
    });

    it('displays supporting metric cards with correct values', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('12.0%')).toBeInTheDocument();
      });

      expect(screen.getByText('Outcome Improvement')).toBeInTheDocument();
      expect(screen.getByText('34,800')).toBeInTheDocument();
      expect(screen.getByText('8.6s')).toBeInTheDocument();

      result.unmount();
    });
  });

  // ===========================
  // Pattern Comparisons
  // ===========================

  describe('Pattern Comparisons', () => {
    it('renders comparison cards with pattern details', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([
        createMockComparison({ pattern_name: 'Auth Token Refresh', recommendation: 'promote' }),
        createMockComparison({
          pattern_id: 'pat-0002',
          pattern_name: 'Cache Invalidation',
          recommendation: 'suppress',
        }),
      ]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('Auth Token Refresh')).toBeInTheDocument();
      });

      expect(screen.getByText('Cache Invalidation')).toBeInTheDocument();

      // Recommendation badges (may appear in both comparison cards and quick stats)
      expect(screen.getAllByText('Promote').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Suppress').length).toBeGreaterThan(0);

      result.unmount();
    });

    it('shows empty state when no comparisons exist', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('No pattern comparisons available')).toBeInTheDocument();
      });

      result.unmount();
    });

    it('displays delta metrics for each comparison', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([createMockComparison()]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('Token Usage')).toBeInTheDocument();
      });

      expect(screen.getByText('Execution Time')).toBeInTheDocument();
      expect(screen.getByText('Retry Count')).toBeInTheDocument();
      expect(screen.getByText('Test Pass Rate')).toBeInTheDocument();
      expect(screen.getByText('Review Iterations')).toBeInTheDocument();

      result.unmount();
    });

    it('displays confidence badges on comparison cards', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([
        createMockComparison({ confidence: 'high' }),
      ]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      await waitFor(() => {
        expect(screen.getByText('high')).toBeInTheDocument();
      });

      result.unmount();
    });
  });

  // ===========================
  // Recommendation Breakdown
  // ===========================

  describe('Recommendation Breakdown', () => {
    it('displays breakdown stats for each action', async () => {
      vi.mocked(baselinesSource.summary).mockResolvedValue(createMockSummary());
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue(createMockBreakdown());

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      // Wait for breakdown data to render with confidence percentages
      await waitFor(() => {
        expect(screen.getByText('88% avg confidence')).toBeInTheDocument();
      });

      expect(screen.getByText('62% avg confidence')).toBeInTheDocument();

      // The quick stat cards show action labels
      const promoteLabels = screen.getAllByText('Promote');
      expect(promoteLabels.length).toBeGreaterThan(0);

      result.unmount();
    });
  });

  // ===========================
  // Error States
  // ===========================

  describe('Error States', () => {
    it('handles summary fetch failure gracefully', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.mocked(baselinesSource.summary).mockRejectedValue(new Error('Network error'));
      vi.mocked(baselinesSource.comparisons).mockResolvedValue([]);
      vi.mocked(baselinesSource.trend).mockResolvedValue([]);
      vi.mocked(baselinesSource.breakdown).mockResolvedValue([]);

      const result = renderWithClient(<BaselinesROI />);
      queryClient = result.queryClient;

      // Page should still render even if summary fails
      await waitFor(() => {
        expect(screen.getByText('Baselines & ROI')).toBeInTheDocument();
      });

      consoleWarn.mockRestore();
      result.unmount();
    });
  });
});
