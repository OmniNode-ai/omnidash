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
    // default tab is Overview — tab button + panel heading both present
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Savings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Model Routing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quality Gate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Token Usage').length).toBeGreaterThan(0);
  });

  it('shows all eight evidence tabs in the tab bar', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /runtime topology/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /event chain/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /projection/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /cost & tokens/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /quality/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /artifacts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /evidence bundle/i })).toBeInTheDocument();
  });

  it('switches evidence tabs without refetching in child panels', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /event chain/i }));
    expect(screen.getAllByText('Event Chain').length).toBeGreaterThan(0);
    expect(screen.getByText(/Command envelope/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /evidence bundle/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Evidence Bundle').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('OCC receipt refs')).toBeInTheDocument();
  });

  it('renders runtime topology panel with instance identity and topic rows', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /runtime topology/i }));
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

    await userEvent.click(screen.getByRole('tab', { name: /^artifacts$/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Artifacts').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Delegation OCC receipt')).toBeInTheDocument();
    expect(screen.getAllByText('Pricing manifest').length).toBeGreaterThan(0);
    expect(screen.getByText('Savings report')).toBeInTheDocument();
  });

  it('shows projection probe panel on projection tab with freshness metadata', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /projection/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Projection / API').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Ready topics')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Last captured')).toBeInTheDocument();
  });

  it('shows event chain with all 6 steps and UNKNOWN fallbacks on event-chain tab', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /event chain/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Event Chain').length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/1\. Command envelope/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Handler dispatch/)).toBeInTheDocument();
    expect(screen.getByText(/3\. Terminal event/)).toBeInTheDocument();
    expect(screen.getByText(/4\. Reducer materialise/)).toBeInTheDocument();
    expect(screen.getByText(/5\. Projection row/)).toBeInTheDocument();
    expect(screen.getByText(/6\. API and dashboard render/)).toBeInTheDocument();
  });

  it('shows inferred status for command stage when run is from projection row', async () => {
    renderWithSource(sourceFor({
      [TOPICS.delegationDecisions]: decisions,
    }));
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /event chain/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Event Chain').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('inferred').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Projection row/).length).toBeGreaterThan(0);
  });

  it('shows cost and token data on cost-tokens tab', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /cost & tokens/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Cost & Tokens').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Total tokens').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cumulative savings').length).toBeGreaterThan(0);
  });

  it('shows quality pass rate on quality tab', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    await userEvent.click(screen.getByRole('tab', { name: /^quality$/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Quality').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Overall pass rate')).toBeInTheDocument();
  });

  it('shows run header with terminal state and data source fields', async () => {
    renderWithSource(populatedSource());
    await screen.findByText('Delegation evidence control plane');

    expect(screen.getAllByText('Terminal state').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pricing manifest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('live projection').length).toBeGreaterThan(0);
  });
});
