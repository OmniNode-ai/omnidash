import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DelegationEvidenceTabs } from './DelegationEvidenceTabs';
import type { DelegationRunContextValue } from './DelegationRunContext';

vi.mock('./DelegationRunContext', () => ({ useDelegationRunContext: vi.fn() }));
import { useDelegationRunContext } from './DelegationRunContext';

// OMN-21166 AC38: delegation.savings.v1 serves a NULL cumulative saving for a tenant with no measured run, and
// delegation.token-usage.v1 may be absent. Unknown is not zero: the Cost & Tokens tab says so instead of $0.00 or 0.
const context = {
  snapshot: {
    summary: null, modelRouting: null, qualityGate: null, tokenUsage: null, decisions: [], runs: [], probes: [],
    hasAnyData: true, isLoading: false, primaryError: null,
    savings: {
      cumulative_savings_usd: null, cumulative_local_cost_usd: null, cumulative_cloud_cost_usd: null,
      baseline_model: null, pricing_manifest_version: 'v7', session_count: 3, sessions: [],
      captured_at: '2026-10-20T15:14:51Z', provisioned: true,
    },
  },
  selectedRunId: null, selectedRun: null, filter: { taskType: null, status: null }, filteredRuns: [],
  selectRun: vi.fn(), setFilter: vi.fn(), clearFilter: vi.fn(), isFixture: false,
  pendingCorrelationId: null, setPendingCorrelationId: vi.fn(),
} as unknown as DelegationRunContextValue;

describe('DelegationEvidenceTabs Cost & Tokens (OMN-21166 AC38)', () => {
  it('says a null saving and absent token usage are not measured, never $0.00 or 0', () => {
    vi.mocked(useDelegationRunContext).mockReturnValue(context);
    render(<DelegationEvidenceTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /Cost & Tokens/ }));
    const savings = screen.getByText('Cumulative savings').parentElement!;
    const tokens = screen.getByText('Total tokens').parentElement!;
    expect(within(savings).queryByText(/\$0(\.0+)?$/)).toBeNull();
    expect(within(savings).getByText('Not measured')).toBeTruthy();
    expect(within(tokens).queryByText(/^0$/)).toBeNull();
    expect(within(tokens).getByText('Not measured')).toBeTruthy();
  });
});
