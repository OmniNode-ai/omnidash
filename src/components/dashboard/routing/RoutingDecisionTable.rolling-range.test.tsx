import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { rangeFromPreset, TIME_RANGE_PRESETS } from '@/hooks/useTimeRange';
import { useFrameStore } from '@/store/store';
import RoutingDecisionTable from './RoutingDecisionTable';
import type { RoutingDecision } from './RoutingDecisionTable';

const mockUseProjectionSnapshotQuery = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useProjectionSnapshotQuery', () => ({
  useProjectionSnapshotQuery: mockUseProjectionSnapshotQuery,
}));

function queryResult(snapshot: ProjectionSnapshot<RoutingDecision>) {
  return { data: snapshot, isLoading: false, error: null };
}

describe('RoutingDecisionTable rolling range', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useFrameStore.getState().clearFilters();
    mockUseProjectionSnapshotQuery.mockReset();
  });

  it('renders a newer lab run from a refreshed snapshot without remounting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    useFrameStore.getState().setTimeRange(rangeFromPreset(TIME_RANGE_PRESETS[2]));

    const firstRow: RoutingDecision = {
      id: 'lab-1',
      created_at: '2026-09-26T09:45:00Z',
      llm_agent: 'not emitted',
      fuzzy_agent: 'not emitted',
      agreement: false,
      llm_confidence: 0,
      fuzzy_confidence: 0,
      cost_usd: 0,
      delegated_to: 'delegate-one',
      model_name: 'model-one',
      outcome: 'passed',
    };
    const secondRow: RoutingDecision = {
      ...firstRow,
      id: 'lab-2',
      created_at: '2026-09-26T10:30:00Z',
      delegated_to: 'delegate-two',
      model_name: 'model-two',
    };
    const firstSnapshot: ProjectionSnapshot<RoutingDecision> = {
      rows: [firstRow],
      rowCount: 1,
      dataFreshness: 'fresh',
      latestEventAt: firstRow.created_at,
      readAt: '2026-09-26T10:00:00Z',
    };
    mockUseProjectionSnapshotQuery.mockReturnValue(queryResult(firstSnapshot));

    const view = render(<RoutingDecisionTable config={{ variant: 'lab-runs' }} />);
    expect(screen.getAllByTestId('delegation-run-row')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(60 * 60 * 1000));
    const secondSnapshot: ProjectionSnapshot<RoutingDecision> = {
      rows: [firstRow, secondRow],
      rowCount: 2,
      dataFreshness: 'fresh',
      latestEventAt: secondRow.created_at,
      readAt: '2026-09-26T11:00:00Z',
    };
    mockUseProjectionSnapshotQuery.mockReturnValue(queryResult(secondSnapshot));
    view.rerender(<RoutingDecisionTable config={{ variant: 'lab-runs' }} />);

    expect(screen.getAllByTestId('delegation-run-row')).toHaveLength(2);
    expect(screen.getByText('delegate-two')).toBeInTheDocument();
  });
});
