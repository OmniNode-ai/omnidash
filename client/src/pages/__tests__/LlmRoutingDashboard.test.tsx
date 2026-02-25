/**
 * LlmRoutingDashboard Component Tests (OMN-2279)
 *
 * Render-level tests for the LLM Routing Effectiveness dashboard.
 * Mocks the llmRoutingSource singleton and the WebSocket hook so all
 * assertions are deterministic with no network or timer dependencies.
 *
 * Coverage:
 *  - Smoke test (renders without crashing)
 *  - Page heading and description
 *  - testid sentinel
 *  - Hero metric card labels (Agreement Rate, Total Decisions)
 *  - Time window selector (24h / 7d / 30d tabs)
 *  - Demo Mode banner renders when isUsingMockData is true
 *  - High disagreement alert renders when agreement_rate < 0.6 (threshold)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTestLifecycle } from '../../tests/test-utils';
import {
  getMockLlmRoutingSummary,
  getMockLlmRoutingLatency,
  getMockLlmRoutingByVersion,
  getMockLlmRoutingDisagreements,
  getMockLlmRoutingTrend,
} from '@/lib/mock-data/llm-routing-mock';

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

// Mock the llmRoutingSource singleton so that all five methods return
// deterministic mock data without hitting the network.
// isUsingMockData starts as true (mirrors what the real singleton sets when
// the API returns empty / 404, which is the normal state in jsdom).
vi.mock('@/lib/data-sources/llm-routing-source', () => ({
  llmRoutingSource: {
    summary: vi.fn().mockResolvedValue(getMockLlmRoutingSummary('7d')),
    latency: vi.fn().mockResolvedValue(getMockLlmRoutingLatency('7d')),
    byVersion: vi.fn().mockResolvedValue(getMockLlmRoutingByVersion('7d')),
    disagreements: vi.fn().mockResolvedValue(getMockLlmRoutingDisagreements('7d')),
    trend: vi.fn().mockResolvedValue(getMockLlmRoutingTrend('7d')),
    isUsingMockData: true,
    clearMockState: vi.fn(),
  },
}));

// ===========================
// Test Helpers
// ===========================

// Lazily imported so mocks are applied before the module is evaluated.
let LlmRoutingDashboard: React.ComponentType;

// ===========================
// Test Suite
// ===========================

describe('LlmRoutingDashboard', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(async () => {
    lifecycle.beforeEach();
    const mod = await import('../LlmRoutingDashboard');
    LlmRoutingDashboard = mod.default;
  });

  afterEach(async () => {
    await lifecycle.afterEach();
  });

  // ───────────────────────────────────────────────
  // Smoke test
  // ───────────────────────────────────────────────

  it('renders without crashing', () => {
    lifecycle.render(<LlmRoutingDashboard />);
    expect(screen.getByTestId('page-llm-routing-dashboard')).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Page header
  // ───────────────────────────────────────────────

  it('renders the page heading and sub-description', () => {
    lifecycle.render(<LlmRoutingDashboard />);
    expect(screen.getByText('LLM Routing Effectiveness')).toBeInTheDocument();
    expect(
      screen.getByText(/Comparing LLM routing vs fuzzy routing agreement, latency, and cost/i)
    ).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Time window selector
  // ───────────────────────────────────────────────

  it('renders the 24h / 7d / 30d time window tabs', () => {
    lifecycle.render(<LlmRoutingDashboard />);
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Hero metric cards
  // ───────────────────────────────────────────────

  it('renders the Agreement Rate hero card label', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Agreement Rate')).toBeInTheDocument();
    });
  });

  it('renders the Total Decisions stat card label', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Total Decisions')).toBeInTheDocument();
    });
  });

  it('renders latency stat card labels', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('LLM p50 Latency')).toBeInTheDocument();
      expect(screen.getByText('Fuzzy p50 Latency')).toBeInTheDocument();
    });
  });

  it('renders Fallback Rate and Avg Cost / Decision stat cards', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Fallback Rate')).toBeInTheDocument();
      expect(screen.getByText('Avg Cost / Decision')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Demo Mode banner (MockDataBadge equivalent)
  // ───────────────────────────────────────────────

  it('renders the Demo Mode banner when isUsingMockData is true', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    // The banner is conditional on allSettled && isUsingMockData.
    // allSettled is true immediately because all mock resolvers are synchronous
    // (vi.fn().mockResolvedValue resolves on the next microtask).
    await waitFor(() => {
      expect(screen.getByText('Demo Mode')).toBeInTheDocument();
    });
  });

  it('renders the Demo Mode banner description text', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText(/Database unavailable or no LLM routing events yet/i)
      ).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // High disagreement alert
  // ───────────────────────────────────────────────

  it('renders the high disagreement alert when agreement_rate is below 0.6', async () => {
    // The mock summary has agreement_rate 0.64 / (0.64 + 0.27) ≈ 0.703, which is
    // above the 0.6 threshold and would NOT trigger the alert.  We need to override
    // the summary mock to return a low agreement_rate (< 0.6, meaning
    // disagreement_rate > 0.4) for this test.
    const { llmRoutingSource } = await import('@/lib/data-sources/llm-routing-source');
    vi.mocked(llmRoutingSource.summary).mockResolvedValue({
      ...getMockLlmRoutingSummary('7d'),
      // agreement_rate 0.5 → disagreement_rate 0.5 > 0.4 threshold
      agreement_rate: 0.5,
    });

    lifecycle.render(<LlmRoutingDashboard />);

    await waitFor(() => {
      expect(screen.getByText('High Disagreement Rate Detected')).toBeInTheDocument();
    });
  });

  it('does NOT render the high disagreement alert when agreement_rate is above 0.6', async () => {
    // Default mock summary returns agreement_rate ≈ 0.703 — above the threshold.
    lifecycle.render(<LlmRoutingDashboard />);

    await waitFor(() => {
      // Wait for loading to finish (hero card label is always rendered post-load)
      expect(screen.getByText('Agreement Rate')).toBeInTheDocument();
    });

    expect(screen.queryByText('High Disagreement Rate Detected')).not.toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Chart section headings
  // ───────────────────────────────────────────────

  it('renders the section headings for charts and disagreements table', async () => {
    lifecycle.render(<LlmRoutingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Routing Effectiveness Trends')).toBeInTheDocument();
      expect(screen.getByText('Latency Distribution')).toBeInTheDocument();
      expect(screen.getByText('Agreement Rate by Prompt Version')).toBeInTheDocument();
      expect(screen.getByText('Top Disagreement Pairs')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Refresh button
  // ───────────────────────────────────────────────

  it('renders a Refresh button in the header', () => {
    lifecycle.render(<LlmRoutingDashboard />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });
});
