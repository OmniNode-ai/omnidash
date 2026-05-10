import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationQualityGateWidget from './DelegationQualityGateWidget';
import { buildDelegationQualityGate } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationQualityGateWidget', () => {
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
        <DelegationQualityGateWidget config={{}} />
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
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no quality gate data/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Pass rate')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    // Escalations now shown as a banner when count > 0
    expect(screen.getByText(/Escalations/i)).toBeInTheDocument();
  });

  it('shows escalation banner with count and rate when escalations are non-zero', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ includeEscalations: true })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText(/required human escalation/i)).toBeInTheDocument();
    // Escalation rate percentage should appear in the banner
    expect(screen.getByText(/% rate/i)).toBeInTheDocument();
  });

  it('does not show escalation banner when escalation count is zero', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ includeEscalations: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.queryByText(/required human escalation/i)).not.toBeInTheDocument();
  });

  it('renders check type rows (deterministic + heuristic)', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText('Deterministic')).toBeInTheDocument();
    expect(screen.getByText('Heuristic')).toBeInTheDocument();
  });

  it('renders failure categories when showFailureCategories is true', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText('Failure categories')).toBeInTheDocument();
    expect(screen.getByText('output_too_short')).toBeInTheDocument();
  });

  it('hides failure categories when showFailureCategories is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.queryByText('Failure categories')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  // OMN-10795: tokens-to-compliance KPIs and per-model breakdown
  describe('tokens-to-compliance KPIs', () => {
    it('renders avg-tokens and avg-attempts KPIs when projection carries the fields', async () => {
      mockFetchWithItems([buildDelegationQualityGate({ includeComplianceMetrics: true })]);
      render(
        <DataSourceTestProvider client={qc}>
          <DelegationQualityGateWidget config={{}} />
        </DataSourceTestProvider>,
      );
      await screen.findByText('Pass rate');
      expect(screen.getByText('Avg tokens to compliance')).toBeInTheDocument();
      expect(screen.getByText('Avg attempts')).toBeInTheDocument();
    });

    it('omits the compliance section when projection lacks the fields', async () => {
      mockFetchWithItems([buildDelegationQualityGate({ includeComplianceMetrics: false })]);
      render(
        <DataSourceTestProvider client={qc}>
          <DelegationQualityGateWidget config={{}} />
        </DataSourceTestProvider>,
      );
      await screen.findByText('Pass rate');
      expect(screen.queryByText('Avg tokens to compliance')).not.toBeInTheDocument();
      expect(screen.queryByText('Tokens-to-compliance by model')).not.toBeInTheDocument();
    });

    it('renders per-model breakdown sorted by avg_tokens ascending', async () => {
      mockFetchWithItems([buildDelegationQualityGate({ includeComplianceMetrics: true })]);
      render(
        <DataSourceTestProvider client={qc}>
          <DelegationQualityGateWidget config={{}} />
        </DataSourceTestProvider>,
      );
      await screen.findByText('Pass rate');
      expect(screen.getByText('Tokens-to-compliance by model')).toBeInTheDocument();
      // The fixture seeds Qwen3-Coder-30B at 3,120 tokens (lowest, first row).
      const models = screen.getAllByText(/Qwen3-Coder-30B|glm-4-plus|codex-cli|gemini-cli/);
      // Sorted ascending → most efficient first.
      expect(models[0].textContent).toBe('Qwen3-Coder-30B');
      expect(models[models.length - 1].textContent).toBe('gemini-cli');
    });
  });
});
