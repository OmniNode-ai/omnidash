import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import DelegationControlPlane from './DelegationControlPlane';
import type { DelegationDecisionProjectionRow } from './delegation-control-plane.types';

function sourceFor(rowsByTopic: Record<string, unknown[]>): ProtocolSnapshotSource {
  return {
    async *readAll(topic: string) {
      yield* rowsByTopic[topic] ?? [];
    },
  };
}

function renderWithSource(source: ProtocolSnapshotSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <DataSourceTestProvider client={client} source={source}>
      <DelegationControlPlane config={{ maxRuns: 5 }} />
    </DataSourceTestProvider>,
  );
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
    correlation_id: 'corr-omn-11623',
    session_id: 'sess_a1b2c3d4e5f6',
    task_type: 'document',
    model_name: 'Qwen3-Coder-30B',
    routing_rule: 'exploit:best-latency',
    routing_confidence: 0.93,
    latency_ms: 1200,
    quality_gate_passed: 1,
    quality_gate_detail: 'deterministic checks passed',
    created_at: '2026-05-22T12:00:00Z',
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

describe('DelegationControlPlane', () => {
  it('renders the composable SEA-style control plane from shared projection data', async () => {
    renderWithSource(populatedSource());

    expect(await screen.findByText('Delegation evidence control plane')).toBeInTheDocument();
    expect(screen.getByText('Recent Runs')).toBeInTheDocument();
    expect(screen.getByTitle('corr-omn-11623')).toBeInTheDocument();
    expect(screen.getByText('Projection Status')).toBeInTheDocument();
    expect(screen.getAllByText('Savings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Model Routing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quality Gate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Token Usage').length).toBeGreaterThan(0);
  });

  it('switches evidence tabs without refetching in child panels', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('button', { name: /event chain/i }));
    expect(screen.getAllByText('Event Chain').length).toBeGreaterThan(0);
    expect(screen.getByText('Command envelope')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /evidence bundle/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Evidence Bundle').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('OCC receipt refs')).toBeInTheDocument();
  });

  it('renders runtime topology panel with instance identity and topic rows', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('button', { name: /runtime topology/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Runtime Topology').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Runtime identity')).toBeInTheDocument();
    expect(screen.getByText('DelegationMarketOrchestrator')).toBeInTheDocument();
    expect(screen.getByText('omnimarket')).toBeInTheDocument();
  });

  it('renders artifacts panel with OCC receipts and manifest slots', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('button', { name: /^artifacts$/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Artifacts').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Delegation OCC receipt')).toBeInTheDocument();
    expect(screen.getAllByText('Pricing manifest').length).toBeGreaterThan(0);
    expect(screen.getByText('Savings report')).toBeInTheDocument();
  });
});
