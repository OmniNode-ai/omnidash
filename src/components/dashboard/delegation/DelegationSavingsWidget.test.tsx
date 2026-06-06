import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationSavingsWidget from './DelegationSavingsWidget';
import { buildDelegationSavings } from '@/storybook/fixtures/delegation-routing';
import type { ProtocolSnapshotSource } from '@/data-source';
import { TOPICS } from '@shared/types/topics';
import { DelegationRunProvider } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';
import {
  buildDelegationModelRouting,
  buildDelegationQualityGate,
  buildDelegationTokenUsage,
} from '@/storybook/fixtures/delegation-routing';

function sourceFor(rowsByTopic: Record<string, unknown[]>): ProtocolSnapshotSource {
  return { async *readAll(topic: string) { yield* rowsByTopic[topic] ?? []; } };
}

function withRunProvider(source: ProtocolSnapshotSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function ContextWrapper({ children }: { children: ReactNode }) {
    return (
      <DataSourceTestProvider client={client} source={source}>
        <DelegationRunProvider>{children}</DelegationRunProvider>
      </DataSourceTestProvider>
    );
  };
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationSavingsWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: false,
    });
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no delegation savings data/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([buildDelegationSavings()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/est\. savings vs/i)).toBeInTheDocument();
    expect(screen.getByText('Local cost')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders live runtime token savings and duplicate session ids', async () => {
    mockFetchWithItems([{
      cumulative_savings_usd: 0.009327,
      cumulative_local_cost_usd: 0,
      cumulative_cloud_cost_usd: 0.009327,
      baseline_model: 'claude-opus-4.1',
      pricing_manifest_version: 'runtime-delegation-events',
      session_count: 2,
      sessions: [
        {
          session_id: 'sess-live',
          task_type: 'test',
          model_name: 'qwen3-coder',
          prompt_tokens: 144,
          completion_tokens: 593,
          tokens_to_compliance: 737,
          latency_ms: 3237,
          local_cost_usd: 0,
          cloud_cost_usd: 0.009327,
          savings_usd: 0.009327,
          baseline_model: 'claude-opus-4.1',
          pricing_manifest_version: 'runtime-delegation-events',
          savings_method: 'measured',
          usage_source: 'measured',
          created_at: '2026-05-20T12:00:00Z',
        },
        {
          session_id: 'sess-live',
          task_type: 'document',
          model_name: 'qwen3-coder',
          prompt_tokens: 81,
          completion_tokens: 384,
          tokens_to_compliance: 465,
          latency_ms: 2109,
          local_cost_usd: 0,
          cloud_cost_usd: 0.006003,
          savings_usd: 0.006003,
          baseline_model: 'claude-opus-4.1',
          pricing_manifest_version: 'runtime-delegation-events',
          savings_method: 'measured',
          usage_source: 'measured',
          created_at: '2026-05-20T12:01:00Z',
        },
      ],
      captured_at: '2026-05-20T12:01:00Z',
      provisioned: true,
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: true }} />
      </DataSourceTestProvider>,
    );

    expect(await screen.findByText('Delegated tokens')).toBeInTheDocument();
    expect(screen.getByText('1,202 to compliance')).toBeInTheDocument();
    expect(screen.getByTitle('input 144, output 593, compliance 737')).toHaveTextContent('737');
    expect(screen.getAllByText('+$0.01').length).toBeGreaterThan(0);
    expect(screen.getByText(/document .*sess-liv/i)).toBeInTheDocument();
  });

  it('renders pricing manifest version', async () => {
    mockFetchWithItems([buildDelegationSavings({ pricingManifestVersion: 'v2026-05-01' })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText('v2026-05-01')).toBeInTheDocument();
  });

  it('renders session rows when showSessions is true', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    // New columns should be visible
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
  });

  it('shows task_type as row label when present', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    // Fixture provides task_type 'code-review' for first session
    expect(screen.getByText(/code-review .*sess_a1b/i)).toBeInTheDocument();
  });

  it('hides session rows when showSessions is false', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.queryByText('Task')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationSavings({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  it('does not show upstream-blocked notice when provisioned is true', async () => {
    mockFetchWithItems([buildDelegationSavings({ provisioned: true })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.queryByText(/upstream-blocked/i)).not.toBeInTheDocument();
  });

});

// OMN-10625: each delegation widget passes refetchInterval: 5_000 to
// useProjectionQuery so a live SQLite-backed dashboard updates within
// ~5s of new delegation events landing. Asserted as a source-level
// invariant because react-query's polling timer interacts poorly with
// jsdom's window-focus heuristics under fake timers.
describe('DelegationSavingsWidget — OMN-10625 polling cadence', () => {
  it('configures useProjectionQuery with a 5-second refetchInterval', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.join(here, 'DelegationSavingsWidget.tsx'),
      'utf8',
    );
    expect(src).toMatch(/useProjectionQuery<DelegationSavingsProjection>\(\{[\s\S]*?refetchInterval:\s*5_000/);
  });
});

// OMN-11650: widget reads from shared DelegationRunContext when inside a provider.
describe('DelegationSavingsWidget — DelegationRunContext integration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders savings data supplied by context without making a projection query', async () => {
    const savings = buildDelegationSavings({ sessionCount: 2, provisioned: true });
    const source = sourceFor({
      [TOPICS.delegationSavings]: [savings],
      [TOPICS.delegationModelRouting]: [buildDelegationModelRouting({ provisioned: true })],
      [TOPICS.delegationQualityGate]: [buildDelegationQualityGate({ provisioned: true })],
      [TOPICS.delegationTokenUsage]: [buildDelegationTokenUsage({ provisioned: true })],
    });

    render(
      <DelegationSavingsWidget config={{}} />,
      { wrapper: withRunProvider(source) },
    );

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.getByText(/est\. savings vs/i)).toBeInTheDocument();
  });
});
