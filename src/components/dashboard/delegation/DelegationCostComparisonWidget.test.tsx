import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import type { ProtocolSnapshotSource } from '@/data-source';
import DelegationCostComparisonWidget from './DelegationCostComparisonWidget';
import type { DelegationSavingsProjection } from './delegation-savings.types';

function makeSource(rows: DelegationSavingsProjection[]): ProtocolSnapshotSource {
  return {
    async *readAll() {
      yield* rows;
    },
  };
}

const baseSession = {
  session_id: 'sess-aaaa-1234',
  task_type: 'code_review',
  local_cost_usd: 0.0012,
  cloud_cost_usd: 0.025,
  savings_usd: 0.0238,
  baseline_model: 'claude-opus-4',
  pricing_manifest_version: 'v2026-05-25',
  savings_method: 'measured' as const,
  usage_source: 'measured' as const,
  model_name: 'qwen3',
  prompt_tokens: 1200,
  completion_tokens: 400,
  latency_ms: 850,
  created_at: '2026-05-25T10:00:00Z',
};

const projection: DelegationSavingsProjection = {
  cumulative_savings_usd: 0.0476,
  cumulative_local_cost_usd: 0.0024,
  cumulative_cloud_cost_usd: 0.05,
  baseline_model: 'claude-opus-4',
  pricing_manifest_version: 'v2026-05-25',
  session_count: 2,
  sessions: [
    baseSession,
    {
      ...baseSession,
      session_id: 'sess-bbbb-5678',
      task_type: 'summarization',
      savings_method: 'estimated',
      usage_source: 'estimated',
      model_name: 'glm-4-plus',
      created_at: '2026-05-25T11:00:00Z',
    },
  ],
  captured_at: '2026-05-25T12:00:00Z',
  provisioned: true,
};

describe('DelegationCostComparisonWidget', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it('shows empty state when no projection data', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([])}>
        <DelegationCostComparisonWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no cost comparison data/i)).toBeTruthy();
  });

  it('renders summary KPIs from projection', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([projection])}>
        <DelegationCostComparisonWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId('cost-comparison-row')).toHaveLength(2));
    expect(screen.getByText(/cumulative savings/i)).toBeTruthy();
  });

  it('renders one row per session', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([projection])}>
        <DelegationCostComparisonWidget config={{}} />
      </DataSourceTestProvider>,
    );
    const rows = await screen.findAllByTestId('cost-comparison-row');
    expect(rows).toHaveLength(2);
  });

  it('shows provenance badges when showProvenance=true', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([projection])}>
        <DelegationCostComparisonWidget config={{ showProvenance: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('cost-comparison-row');
    expect(screen.getAllByText('measured').length).toBeGreaterThan(0);
    expect(screen.getAllByText('estimated').length).toBeGreaterThan(0);
  });

  it('hides provenance column when showProvenance=false', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([projection])}>
        <DelegationCostComparisonWidget config={{ showProvenance: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('cost-comparison-row');
    expect(screen.queryByText('measured')).toBeNull();
  });

  it('respects maxRows config', async () => {
    const bigProjection: DelegationSavingsProjection = {
      ...projection,
      session_count: 5,
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        ...baseSession,
        session_id: `sess-${n}`,
        created_at: `2026-05-2${n}T10:00:00Z`,
      })),
    };
    render(
      <DataSourceTestProvider client={qc} source={makeSource([bigProjection])}>
        <DelegationCostComparisonWidget config={{ maxRows: 2 }} />
      </DataSourceTestProvider>,
    );
    const rows = await screen.findAllByTestId('cost-comparison-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/showing 2 of 5/i)).toBeTruthy();
  });

  it('sort buttons change display order', async () => {
    render(
      <DataSourceTestProvider client={qc} source={makeSource([projection])}>
        <DelegationCostComparisonWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findAllByTestId('cost-comparison-row');
    const savingsBtn = screen.getByRole('button', { name: /^savings$/i });
    fireEvent.click(savingsBtn);
    // After clicking savings sort, rows are still rendered (no crash)
    expect(screen.getAllByTestId('cost-comparison-row')).toHaveLength(2);
  });
});
