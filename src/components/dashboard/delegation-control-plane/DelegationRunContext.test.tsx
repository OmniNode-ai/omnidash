import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { TOPICS } from '@shared/types/topics';
import type { ProtocolSnapshotSource } from '@/data-source';
import type { DelegationSummary } from '@/components/dashboard/delegation/DelegationMetrics';
import {
  buildDelegationModelRouting,
  buildDelegationQualityGate,
  buildDelegationSavings,
  buildDelegationTokenUsage,
} from '@/storybook/fixtures/delegation-routing';
import { DelegationRunProvider, useDelegationRunContext } from './DelegationRunContext';
import type { DelegationDecisionProjectionRow } from './delegation-control-plane.types';

function sourceFor(rowsByTopic: Record<string, unknown[]>): ProtocolSnapshotSource {
  return {
    async *readAll(topic: string) {
      yield* rowsByTopic[topic] ?? [];
    },
  };
}

function wrapper(source: ProtocolSnapshotSource, isFixture = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <DataSourceTestProvider client={client} source={source}>
        <DelegationRunProvider isFixture={isFixture}>{children}</DelegationRunProvider>
      </DataSourceTestProvider>
    );
  };
}

const summary: DelegationSummary = {
  totalDelegations: 2,
  qualityGatePassRate: 0.9,
  qualityGatePassed: 9,
  qualityGateTotal: 10,
  totalSavingsUsd: 0.12,
  byTaskType: [{ taskType: 'document', count: 2 }],
  byModel: [{ model: 'Qwen3-Coder-30B', count: 2 }],
};

const decisions: DelegationDecisionProjectionRow[] = [
  {
    id: 1,
    correlation_id: 'corr-a',
    session_id: 'sess_a1b2c3d4e5f6',
    task_type: 'code-review',
    model_name: 'Qwen3-Coder-30B',
    quality_gate_passed: 1,
    created_at: '2026-05-22T12:00:00Z',
  },
  {
    id: 2,
    correlation_id: 'corr-b',
    session_id: 'sess_b2c3d4e5f6a1',
    task_type: 'document',
    model_name: 'glm-4-plus',
    quality_gate_passed: 0,
    created_at: '2026-05-22T11:00:00Z',
  },
];

function populatedSource() {
  return sourceFor({
    [TOPICS.delegationSummary]: [summary],
    [TOPICS.delegationDecisions]: decisions,
    [TOPICS.delegationSavings]: [buildDelegationSavings({ sessionCount: 1, provisioned: true })],
    [TOPICS.delegationModelRouting]: [buildDelegationModelRouting({ provisioned: true })],
    [TOPICS.delegationQualityGate]: [buildDelegationQualityGate({ provisioned: true })],
    [TOPICS.delegationTokenUsage]: [buildDelegationTokenUsage({ provisioned: true })],
  });
}

describe('DelegationRunContext', () => {
  it('exposes snapshot and auto-selects the first run', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource()),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));

    expect(result.current.snapshot.hasAnyData).toBe(true);
    expect(result.current.selectedRun).not.toBeNull();
    expect(result.current.filteredRuns.length).toBeGreaterThan(0);
  });

  it('selectRun updates the selected run', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource()),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));
    const runs = result.current.filteredRuns;
    expect(runs.length).toBeGreaterThanOrEqual(2);

    act(() => result.current.selectRun(runs[1].id));
    expect(result.current.selectedRunId).toBe(runs[1].id);
    expect(result.current.selectedRun?.id).toBe(runs[1].id);
  });

  it('setFilter narrows filteredRuns without touching the full snapshot', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource()),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));
    const totalRuns = result.current.snapshot.runs.length;

    act(() => result.current.setFilter({ taskType: 'code-review' }));

    const filtered = result.current.filteredRuns;
    expect(filtered.every((r) => r.taskType === 'code-review')).toBe(true);
    // full snapshot is untouched
    expect(result.current.snapshot.runs.length).toBe(totalRuns);
  });

  it('clearFilter restores all runs', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource()),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));
    const totalRuns = result.current.filteredRuns.length;

    act(() => result.current.setFilter({ status: 'passed' }));
    expect(result.current.filteredRuns.length).toBeLessThan(totalRuns);

    act(() => result.current.clearFilter());
    expect(result.current.filteredRuns.length).toBe(totalRuns);
  });

  it('exposes isFixture=true when rendered as fixture', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource(), true),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));
    expect(result.current.isFixture).toBe(true);
  });

  it('throws when used outside a DelegationRunProvider', () => {
    const { result } = renderHook(() => {
      try {
        return useDelegationRunContext();
      } catch (e) {
        return e;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/DelegationRunProvider/);
  });

  it('setPendingCorrelationId updates pendingCorrelationId in context', async () => {
    const { result } = renderHook(() => useDelegationRunContext(), {
      wrapper: wrapper(populatedSource()),
    });

    await waitFor(() => expect(result.current.snapshot.isLoading).toBe(false));
    expect(result.current.pendingCorrelationId).toBeNull();

    act(() => result.current.setPendingCorrelationId('trigger-corr-xyz'));
    expect(result.current.pendingCorrelationId).toBe('trigger-corr-xyz');
  });
});
