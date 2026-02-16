/**
 * CostTrendDashboard Component Tests (OMN-2242)
 *
 * Basic rendering tests for the Cost Trend dashboard page.
 * Mocks the costSource and WebSocket hook to test component behavior
 * with deterministic data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTestLifecycle } from '../../tests/test-utils';
import {
  getMockCostSummary,
  getMockCostTrend,
  getMockCostByModel,
  getMockCostByRepo,
  getMockCostByPattern,
  getMockTokenUsage,
  getMockBudgetAlerts,
} from '@/lib/mock-data/cost-mock';

// ===========================
// Module Mocks
// ===========================

// Mock the WebSocket hook to prevent real connections
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

// Mock the costSource to return deterministic data without network calls
vi.mock('@/lib/data-sources/cost-source', () => ({
  costSource: {
    summary: vi.fn().mockResolvedValue(getMockCostSummary('7d')),
    trend: vi.fn().mockResolvedValue(getMockCostTrend('7d')),
    byModel: vi.fn().mockResolvedValue(getMockCostByModel()),
    byRepo: vi.fn().mockResolvedValue(getMockCostByRepo()),
    byPattern: vi.fn().mockResolvedValue(getMockCostByPattern()),
    tokenUsage: vi.fn().mockResolvedValue(getMockTokenUsage('7d')),
    alerts: vi.fn().mockResolvedValue(getMockBudgetAlerts()),
    isUsingMockData: true,
  },
}));

// ===========================
// Tests
// ===========================

// Lazily import to allow mocks to take effect
let CostTrendDashboard: React.ComponentType;

describe('CostTrendDashboard', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(async () => {
    lifecycle.beforeEach();
    const mod = await import('../../pages/CostTrendDashboard');
    CostTrendDashboard = mod.default;
  });

  afterEach(async () => {
    await lifecycle.afterEach();
  });

  it('renders the page heading and description', async () => {
    lifecycle.render(<CostTrendDashboard />);

    expect(screen.getByText('Cost Trends')).toBeInTheDocument();
    expect(
      screen.getByText(
        'LLM cost and token usage trends with drill-down by model, repo, and pattern'
      )
    ).toBeInTheDocument();
  });

  it('renders the page container with test id', async () => {
    lifecycle.render(<CostTrendDashboard />);

    expect(screen.getByTestId('page-cost-trends')).toBeInTheDocument();
  });

  it('renders the time window selector buttons', async () => {
    lifecycle.render(<CostTrendDashboard />);

    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('renders the Demo Data badge when using mock data', async () => {
    lifecycle.render(<CostTrendDashboard />);

    expect(screen.getByText('Demo Data')).toBeInTheDocument();
  });

  it('renders the hero metric with total spend after loading', async () => {
    lifecycle.render(<CostTrendDashboard />);

    await waitFor(() => {
      // The mock summary returns total_cost_usd = 87.15 for 7d
      expect(screen.getByText(/Total Spend/)).toBeInTheDocument();
    });
  });

  it('renders metric card labels', async () => {
    lifecycle.render(<CostTrendDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Cost Change')).toBeInTheDocument();
      expect(screen.getByText('Avg Cost/Session')).toBeInTheDocument();
      expect(screen.getByText('Total Tokens')).toBeInTheDocument();
      // "Budget Alerts" appears both as metric card label and section heading
      expect(screen.getAllByText('Budget Alerts').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders chart section headings', async () => {
    lifecycle.render(<CostTrendDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Cost Over Time/)).toBeInTheDocument();
      expect(screen.getByText(/Token Usage/)).toBeInTheDocument();
      expect(screen.getByText('Cost by Model')).toBeInTheDocument();
      expect(screen.getByText('Cost by Repo')).toBeInTheDocument();
      expect(screen.getByText('Cost by Pattern')).toBeInTheDocument();
    });
  });

  it('renders the budget alerts section heading', async () => {
    lifecycle.render(<CostTrendDashboard />);

    // Budget Alerts appears both as a section heading and as a metric card label.
    // The section heading uses h3.
    await waitFor(() => {
      const headings = screen.getAllByText('Budget Alerts');
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders the include-estimated toggle', async () => {
    lifecycle.render(<CostTrendDashboard />);

    expect(screen.getByText('Include estimated')).toBeInTheDocument();
  });

  it('shows triggered alert count from mock data', async () => {
    lifecycle.render(<CostTrendDashboard />);

    // Mock alerts have 1 triggered alert ("Weekly Budget").
    // The metric card value shows "1 triggered" and the badge shows "1 triggered"
    await waitFor(() => {
      const triggered = screen.getAllByText(/1 triggered/);
      expect(triggered.length).toBeGreaterThanOrEqual(1);
    });
  });
});
