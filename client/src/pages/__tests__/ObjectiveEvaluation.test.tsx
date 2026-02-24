// SPDX-License-Identifier: MIT
/**
 * ObjectiveEvaluation Component Tests (OMN-2583)
 *
 * Render-level tests for the Objective Evaluation dashboard.
 * Mocks the objectiveSource singleton so all assertions are deterministic
 * with no network or timer dependencies.
 *
 * Coverage:
 *  - Smoke test (renders without crashing)
 *  - Page heading and description
 *  - Time window selector tabs (24h / 7d / 30d)
 *  - Mock data banner renders when isUsingMockData is true
 *  - Score Vector panel heading and "never scalar" description
 *  - Gate Failure Timeline panel heading
 *  - Policy State History panel heading
 *  - Anti-Gaming Alert Feed heading
 *  - Refresh button
 *  - Alert feed shows unacknowledged badge when alerts exist
 *  - No scalar reward value anywhere in the rendered output
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { createTestLifecycle } from '@/tests/test-utils';
import {
  getMockScoreVectorSummary,
  getMockGateFailureTimeline,
  getMockPolicyStateHistory,
  getMockAntiGamingAlerts,
} from '@/lib/mock-data/objective-mock';

// ============================================================================
// Module Mocks
// ============================================================================

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('@/lib/data-sources/objective-source', () => ({
  objectiveSource: {
    scoreVector: vi.fn().mockResolvedValue(getMockScoreVectorSummary('7d')),
    gateFailureTimeline: vi.fn().mockResolvedValue(getMockGateFailureTimeline('7d')),
    policyStateHistory: vi.fn().mockResolvedValue(getMockPolicyStateHistory('7d')),
    antiGamingAlerts: vi.fn().mockResolvedValue(getMockAntiGamingAlerts('7d')),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    isUsingMockData: true,
    clearMockState: vi.fn(),
  },
}));

// ============================================================================
// Import under test (after mocks are set up)
// ============================================================================

import ObjectiveEvaluation from '@/pages/ObjectiveEvaluation';

// ============================================================================
// Test Suite
// ============================================================================

describe('ObjectiveEvaluation', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────
  // Smoke test
  // ───────────────────────────────────────────────

  it('renders without crashing', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(document.body).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Page header
  // ───────────────────────────────────────────────

  it('renders the page heading', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText('Objective Evaluation')).toBeInTheDocument();
  });

  it('renders the page description', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(
      screen.getByText(/Score vectors, gate failures, policy state, and anti-gaming alerts/i)
    ).toBeInTheDocument();
  });

  it('renders the "No scalar reward values are shown" disclaimer in the page description', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText(/No scalar reward values are shown/i)).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Time window selector
  // ───────────────────────────────────────────────

  it('renders the 24h time window button', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
  });

  it('renders the 7d time window button', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
  });

  it('renders the 30d time window button', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Mock data banner
  // ───────────────────────────────────────────────

  it('renders the Demo Data banner when isUsingMockData is true', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      expect(screen.getByText('Demo Data')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Panel headings
  // ───────────────────────────────────────────────

  it('renders the Score Vector panel heading', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText('Score Vector')).toBeInTheDocument();
  });

  it('renders the score vector "never collapsed to scalar" description', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText(/Never collapsed to scalar/i)).toBeInTheDocument();
  });

  it('renders the Gate Failure Timeline panel heading', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText('Gate Failure Timeline')).toBeInTheDocument();
  });

  it('renders the Policy State History panel heading', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText('Policy State History')).toBeInTheDocument();
  });

  it('renders the Anti-Gaming Alert Feed panel heading', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByText('Anti-Gaming Alert Feed')).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────
  // Alert feed content
  // ───────────────────────────────────────────────

  it('renders the unacknowledged alerts badge when alerts exist', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      const mockData = getMockAntiGamingAlerts('7d');
      const unackCount = mockData.alerts.filter((a) => !a.acknowledged).length;
      expect(screen.getByText(`${unackCount} unacknowledged`)).toBeInTheDocument();
    });
  });

  it('renders alert type labels in the feed', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      // Multiple Goodhart Violation alerts may render (mock has 2) - use getAllByText
      const labels = screen.getAllByText('Goodhart Violation');
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  it('renders Ack button for unacknowledged alerts', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      const ackButtons = screen.getAllByRole('button', { name: /Ack/i });
      expect(ackButtons.length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────
  // Gate failure content
  // ───────────────────────────────────────────────

  it('renders gate failure count badge when failures exist', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      const mockData = getMockGateFailureTimeline('7d');
      expect(screen.getByText(`${mockData.total_failures} failures`)).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────
  // Policy state content
  // ───────────────────────────────────────────────

  it('renders policy lifecycle badges in current states table', async () => {
    lifecycle.render(<ObjectiveEvaluation />);
    await waitFor(() => {
      // At least one lifecycle badge type should appear (Candidate/Validated/Promoted/Deprecated)
      const lifecycleBadges = screen
        .queryAllByText('Candidate')
        .concat(screen.queryAllByText('Validated'))
        .concat(screen.queryAllByText('Promoted'))
        .concat(screen.queryAllByText('Deprecated'));
      expect(lifecycleBadges.length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────
  // Refresh button
  // ───────────────────────────────────────────────

  it('renders a Refresh button', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  it('calls clearMockState when Refresh is clicked', async () => {
    const { objectiveSource } = await import('@/lib/data-sources/objective-source');
    lifecycle.render(<ObjectiveEvaluation />);
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);
    expect(objectiveSource.clearMockState).toHaveBeenCalledOnce();
  });

  // ───────────────────────────────────────────────
  // Anti-scalar enforcement: verify no scalar reward fields
  // ───────────────────────────────────────────────

  it('does not render aggregated reward score field labels', () => {
    lifecycle.render(<ObjectiveEvaluation />);
    // Forbidden: any label that collapses the vector to a single scalar reward value.
    // "total reward" and "reward score" are the specific collapsed-scalar patterns.
    // "No scalar reward values are shown" is the allowed disclaimer text, not a data label.
    expect(screen.queryByText(/^total reward$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^reward score$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^aggregate reward$/i)).not.toBeInTheDocument();
  });
});
