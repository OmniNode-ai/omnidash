import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationTokenUsageWidget from './DelegationTokenUsageWidget';
import { buildDelegationTokenUsage } from '@/storybook/fixtures/delegation-routing';

// OMN-20717: the token-usage projection serves a NULL cost when no call was
// priced (the total, and each model's cost), with unpriced_call_count beside
// the total. An unmeasured cost is shown as not measured, never as $0.00, and
// a null must not crash the widget.

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function unpricedModel(modelId: string, cost: number | null) {
  return {
    model_id: modelId,
    model_name: modelId,
    prompt_tokens: 88,
    completion_tokens: 20,
    total_tokens: 108,
    estimated_cost_usd: cost,
    usage_source: 'unknown' as const,
    token_provenance: 'unknown' as const,
  };
}

function renderWidget() {
  render(
    <DataSourceTestProvider client={qc}>
      <DelegationTokenUsageWidget config={{}} />
    </DataSourceTestProvider>,
  );
}

describe('DelegationTokenUsageWidget with unpriced calls', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a null total as not measured with the unpriced count, never $0.00', async () => {
    const projection = buildDelegationTokenUsage({ provisioned: true });
    projection.total_estimated_cost_usd = null;
    projection.unpriced_call_count = 2;
    projection.by_model = [unpricedModel('local-model', null)];
    mockFetchWithItems([projection]);

    renderWidget();

    expect(await screen.findByText('Not measured')).toBeInTheDocument();
    expect(screen.getByText('2 unpriced')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('shows a null model cost as a dash without crashing', async () => {
    const projection = buildDelegationTokenUsage({ provisioned: true });
    projection.total_estimated_cost_usd = 0.000216;
    projection.unpriced_call_count = 1;
    projection.by_model = [
      unpricedModel('unpriced-model', null),
      { ...unpricedModel('priced-model', 0.000216), usage_source: 'measured', token_provenance: 'measured' },
    ];
    mockFetchWithItems([projection]);

    renderWidget();

    expect(await screen.findByText('unpriced-model')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('$0.000216')).toBeInTheDocument();
  });

  it('shows no unpriced note when every call was priced', async () => {
    const projection = buildDelegationTokenUsage({ provisioned: true });
    projection.unpriced_call_count = 0;
    mockFetchWithItems([projection]);

    renderWidget();

    expect(await screen.findByText('Est. cost')).toBeInTheDocument();
    expect(screen.queryByText('Not measured')).not.toBeInTheDocument();
    expect(screen.queryByText(/unpriced/)).not.toBeInTheDocument();
  });
});
