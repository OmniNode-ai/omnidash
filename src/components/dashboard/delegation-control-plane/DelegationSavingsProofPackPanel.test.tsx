import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationSavingsProofPackPanel } from './DelegationSavingsProofPackPanel';
import type { DelegationRunContextValue } from './DelegationRunContext';

vi.mock('./DelegationRunContext', () => ({
  useDelegationRunContext: vi.fn(),
}));

import { useDelegationRunContext } from './DelegationRunContext';

const mockUseCtx = vi.mocked(useDelegationRunContext);

const emptyContextValue: DelegationRunContextValue = {
  snapshot: {
    summary: null,
    savings: null,
    modelRouting: null,
    qualityGate: null,
    tokenUsage: null,
    decisions: [],
    runs: [],
    probes: [],
    hasAnyData: false,
    isLoading: false,
    primaryError: null,
  },
  selectedRunId: null,
  selectedRun: null,
  filter: { taskType: null, status: null },
  filteredRuns: [],
  selectRun: vi.fn(),
  setFilter: vi.fn(),
  clearFilter: vi.fn(),
  isFixture: false,
};

const populatedContextValue: DelegationRunContextValue = {
  ...emptyContextValue,
  snapshot: {
    ...emptyContextValue.snapshot,
    savings: {
      cumulative_savings_usd: 1.25,
      cumulative_local_cost_usd: 0.02,
      cumulative_cloud_cost_usd: 1.27,
      baseline_model: 'claude-opus-4',
      pricing_manifest_version: 'v2026-05-25',
      session_count: 2,
      sessions: [],
      captured_at: '2026-05-25T10:00:00Z',
      provisioned: true,
    },
    runs: [
      {
        id: 'corr-001',
        correlationId: 'corr-001',
        sessionId: 'sess-001',
        taskType: 'code_review',
        modelName: 'qwen3',
        delegatedTo: 'qwen3',
        status: 'passed',
        qualityGateDetail: 'all checks passed',
        routingRule: 'local_first',
        routingConfidence: 0.95,
        latencyMs: 1200,
        tokenCount: 800,
        savingsUsd: 0.75,
        estimatedCostUsd: 0.02,
        pricingManifestVersion: 'v2026-05-25',
        createdAt: '2026-05-25T10:00:00Z',
        source: 'decision_projection',
      },
      {
        id: 'corr-002',
        correlationId: 'corr-002',
        sessionId: 'sess-002',
        taskType: 'summarization',
        modelName: 'qwen3',
        delegatedTo: 'qwen3',
        status: 'failed',
        qualityGateDetail: 'relevance check failed',
        routingRule: 'local_first',
        routingConfidence: 0.80,
        latencyMs: 800,
        tokenCount: 400,
        savingsUsd: 0.50,
        estimatedCostUsd: 0.01,
        pricingManifestVersion: 'v2026-05-25',
        createdAt: '2026-05-25T10:05:00Z',
        source: 'decision_projection',
      },
    ],
    hasAnyData: true,
  },
};

describe('DelegationSavingsProofPackPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no runs exist', () => {
    mockUseCtx.mockReturnValue(emptyContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getByText(/No delegation runs available/i)).toBeTruthy();
  });

  it('renders proof pack header with cumulative savings', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getByText(/OmniNode Delegation Savings Report/i)).toBeTruthy();
    expect(screen.getAllByText('v2026-05-25').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1.25').length).toBeGreaterThan(0);
  });

  it('renders all runs in the table', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getByText('corr-001')).toBeTruthy();
    expect(screen.getByText('corr-002')).toBeTruthy();
    expect(screen.getByText('code_review')).toBeTruthy();
    expect(screen.getByText('summarization')).toBeTruthy();
  });

  it('shows PASSED and FAILED labels in quality gate column', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getByText('PASSED')).toBeTruthy();
    expect(screen.getByText('FAILED')).toBeTruthy();
  });

  it('shows routing rule and confidence', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getAllByText('local_first').length).toBeGreaterThan(0);
    expect(screen.getByText('95%')).toBeTruthy();
  });

  it('renders totals row with aggregate savings', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    render(<DelegationSavingsProofPackPanel />);
    expect(screen.getByText(/Totals \(2 runs\)/i)).toBeTruthy();
    expect(screen.getByText('50% pass rate')).toBeTruthy();
  });

  it('calls window.print on Print button click', () => {
    mockUseCtx.mockReturnValue(populatedContextValue);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<DelegationSavingsProofPackPanel />);
    fireEvent.click(screen.getByText(/Print \/ Save as PDF/i));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });
});
