import { renderHook, waitFor } from '@testing-library/react';
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
import { useDelegationEvidenceSnapshot } from './useDelegationEvidenceSnapshot';
import type { DelegationDecisionProjectionRow } from './delegation-control-plane.types';

function sourceFor(rowsByTopic: Record<string, unknown[]>): ProtocolSnapshotSource {
  return {
    async *readAll(topic: string) {
      yield* rowsByTopic[topic] ?? [];
    },
  };
}

function wrapper(source: ProtocolSnapshotSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <DataSourceTestProvider client={client} source={source}>
        {children}
      </DataSourceTestProvider>
    );
  };
}

describe('useDelegationEvidenceSnapshot', () => {
  it('fetches each delegation projection once and builds run evidence rows', async () => {
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
        correlation_id: 'corr-omn-11623',
        session_id: 'sess_a1b2c3d4e5f6',
        task_type: 'document',
        model_name: 'Qwen3-Coder-30B',
        quality_gate_passed: 1,
        created_at: '2026-05-22T12:00:00Z',
      },
    ];

    const { result } = renderHook(() => useDelegationEvidenceSnapshot(), {
      wrapper: wrapper(sourceFor({
        [TOPICS.delegationSummary]: [summary],
        [TOPICS.delegationDecisions]: decisions,
        [TOPICS.delegationSavings]: [buildDelegationSavings({ sessionCount: 1, provisioned: true })],
        [TOPICS.delegationModelRouting]: [buildDelegationModelRouting({ provisioned: true })],
        [TOPICS.delegationQualityGate]: [buildDelegationQualityGate({ provisioned: true })],
        [TOPICS.delegationTokenUsage]: [buildDelegationTokenUsage({ provisioned: true })],
      })),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasAnyData).toBe(true);
    expect(result.current.probes).toHaveLength(6);
    expect(result.current.runs.some((run) => run.correlationId === 'corr-omn-11623')).toBe(true);
    expect(result.current.runs.find((run) => run.correlationId === 'corr-omn-11623')?.status).toBe('passed');
  });
});
