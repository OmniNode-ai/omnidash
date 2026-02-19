/**
 * DelegationDashboard Component Tests (OMN-2284)
 *
 * Render-level tests for the Delegation Metrics dashboard.
 * Mocks the delegationSource singleton and the WebSocket hook so all
 * assertions are deterministic with no network or timer dependencies.
 *
 * Coverage:
 *  - Smoke test (renders without crashing)
 *  - Page heading and description
 *  - testid sentinel
 *  - Golden metric card label (Quality Gate Pass Rate)
 *  - Time window selector (24h / 7d / 30d tabs)
 *  - Demo Mode banner renders when isUsingMockData is true
 *  - Quality gate alert renders when quality_gate_pass_rate < 0.6 (threshold)
 *  - Stat card labels (Total Delegations, Total Cost Savings, etc.)
 *  - Section headings (Delegation Trends, task type chart, shadow table)
 *  - Refresh button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTestLifecycle } from '../../tests/test-utils';
import {
  getMockDelegationSummary,
  getMockDelegationByTaskType,
  getMockDelegationCostSavings,
  getMockDelegationQualityGates,
  getMockDelegationShadowDivergence,
  getMockDelegationTrend,
} from '@/lib/mock-data/delegation-mock';

// ===========================
// Module Mocks
// ===========================

// Prevent real WebSocket connections in jsdom.
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

// Mock the delegationSource singleton so that all methods return
// deterministic mock data without hitting the network.
// isUsingMockData starts as true (mirrors what the real singleton sets when
// the API returns empty / 404, which is the normal state in jsdom).
vi.mock('@/lib/data-sources/delegation-source', () => ({
  delegationSource: {
    summary: vi.fn().mockResolvedValue(getMockDelegationSummary('7d')),
    byTaskType: vi.fn().mockResolvedValue(getMockDelegationByTaskType('7d')),
    costSavings: vi.fn().mockResolvedValue(getMockDelegationCostSavings('7d')),
    qualityGates: vi.fn().mockResolvedValue(getMockDelegationQualityGates('7d')),
    shadowDivergence: vi.fn().mockResolvedValue(getMockDelegationShadowDivergence('7d')),
    trend: vi.fn().mockResolvedValue(getMockDelegationTrend('7d')),
    isUsingMockData: true,
    clearMockState: vi.fn(),
  },
}));

// ===========================
// Test Helpers
// ===========================

// Lazily imported so mocks are applied before the module is evaluated.
let DelegationDashboard: React.ComponentType;

// ===========================
// Test Suite
// ===========================

describe('DelegationDashboard', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(async () => {
    lifecycle.beforeEach();
    const mod = await import('../DelegationDashboard');
    DelegationDashboard = mod.default;
  });

  afterEach(async () => {
    await lifecycle.afterEach();
  });

  // ───────────────────────────────────────────────
  // Smoke test
  // ───────────────────────────────────────────────

  it('renders without crashing', () => {
    lifecycle.render(<DelegationDashboard />);
    expect(screen.getByTestId('page-delegation-dashboard')).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Page header
  // ───────────────────────────────────────────────

  it('renders the page heading and sub-description', () => {
    lifecycle.render(<DelegationDashboard />);
    expect(screen.getByText('Delegation Metrics')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Task delegation rate, cost savings, quality gates, and shadow validation divergence/i
      )
    ).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Time window selector
  // ───────────────────────────────────────────────

  it('renders the 24h / 7d / 30d time window tabs', () => {
    lifecycle.render(<DelegationDashboard />);
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Golden metric hero card
  // ───────────────────────────────────────────────

  it('renders the Quality Gate Pass Rate golden metric label', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Quality Gate Pass Rate')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Stat card labels
  // ───────────────────────────────────────────────

  it('renders the Total Delegations stat card label', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Total Delegations')).toBeInTheDocument();
    });
  });

  it('renders the Total Cost Savings stat card label', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Total Cost Savings')).toBeInTheDocument();
    });
  });

  it('renders the Shadow Divergence Rate stat card label', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Shadow Divergence Rate')).toBeInTheDocument();
    });
  });

  it('renders the Avg Delegation Latency stat card label', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Avg Delegation Latency')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Demo Mode banner
  // ───────────────────────────────────────────────

  it('renders the Demo Mode banner when isUsingMockData is true', async () => {
    lifecycle.render(<DelegationDashboard />);
    // The banner is conditional on allSettled && isUsingMockData.
    // allSettled is true immediately because all mock resolvers are synchronous
    // (vi.fn().mockResolvedValue resolves on the next microtask).
    await waitFor(() => {
      expect(screen.getByText('Demo Mode')).toBeInTheDocument();
    });
  });

  it('renders the Demo Mode banner description text', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText(/Database unavailable or no delegation events yet/i)
      ).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Quality gate alert
  // ───────────────────────────────────────────────

  it('renders the low quality gate pass rate alert when rate is below 0.6', async () => {
    const { delegationSource } = await import('@/lib/data-sources/delegation-source');
    vi.mocked(delegationSource.summary).mockResolvedValue({
      ...getMockDelegationSummary('7d'),
      // quality_gate_pass_rate 0.4 < 0.6 threshold → triggers alert
      quality_gate_pass_rate: 0.4,
    });

    lifecycle.render(<DelegationDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Low Quality Gate Pass Rate')).toBeInTheDocument();
    });
  });

  it('does NOT render the low quality gate alert when rate is at or above 0.6', async () => {
    // Default mock summary returns quality_gate_pass_rate 0.83 — above the threshold.
    lifecycle.render(<DelegationDashboard />);

    await waitFor(() => {
      // Wait for loading to finish (golden metric label is always rendered post-load)
      expect(screen.getByText('Quality Gate Pass Rate')).toBeInTheDocument();
    });

    expect(screen.queryByText('Low Quality Gate Pass Rate')).not.toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Section headings
  // ───────────────────────────────────────────────

  it('renders the section headings for charts and shadow divergence table', async () => {
    lifecycle.render(<DelegationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Delegation Trends')).toBeInTheDocument();
      expect(screen.getByText('Delegation Rate by Task Type')).toBeInTheDocument();
      expect(screen.getByText('Cost Savings Over Time')).toBeInTheDocument();
      expect(screen.getByText('Quality Gate Pass Rate Over Time')).toBeInTheDocument();
      expect(screen.getByText('Top Shadow Divergence Pairs')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Refresh button
  // ───────────────────────────────────────────────

  it('renders a Refresh button in the header', () => {
    lifecycle.render(<DelegationDashboard />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });
});
