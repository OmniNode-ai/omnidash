import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationQualityGateWidget from './DelegationQualityGateWidget';
import { buildDelegationQualityGate } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * Mock fetch to serve two topic queries: the quality-gate projection
 * and the decisions list. Each topic follows the FileSnapshotSource
 * pattern: first fetch returns index (file list), subsequent fetches
 * return individual items.
 */
function mockFetchForQualityGateWithDecisions(
  qgItems: unknown[],
  decisionItems: unknown[],
): void {
  const qgFileNames = qgItems.map((_, i) => `${i}.json`);
  const decFileNames = decisionItems.map((_, i) => `${i}.json`);
  let callCount = 0;

  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    const urlStr = String(url);

    // Quality gate topic index
    if (urlStr.includes('quality-gate') && urlStr.endsWith('index.json')) {
      return Promise.resolve({ ok: true, json: async () => qgFileNames });
    }
    // Decisions topic index
    if (urlStr.includes('decisions') && urlStr.endsWith('index.json')) {
      return Promise.resolve({ ok: true, json: async () => decFileNames });
    }

    // Individual item files: match by position in the call sequence
    const filename = urlStr.split('/').pop() ?? '';
    const idx = parseInt(filename, 10);
    if (!Number.isNaN(idx)) {
      if (urlStr.includes('quality-gate')) {
        return Promise.resolve({ ok: true, json: async () => qgItems[idx] ?? null });
      }
      if (urlStr.includes('decisions')) {
        return Promise.resolve({ ok: true, json: async () => decisionItems[idx] ?? null });
      }
    }

    // Fallback for the first-call pattern (FileSnapshotSource index.json)
    callCount++;
    if (callCount === 1) {
      return Promise.resolve({ ok: true, json: async () => qgFileNames });
    }
    return Promise.resolve({ ok: true, json: async () => null });
  });
}

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
    expect(await screen.findByText(/no escalation data/i)).toBeInTheDocument();
  });

  it('renders check type breakdown when data is present', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Automated checks')).toBeInTheDocument();
    expect(screen.getByText('Heuristic checks')).toBeInTheDocument();
    // Escalations shown as a banner when count > 0
    expect(screen.getByText(/Escalations/i)).toBeInTheDocument();
  });

  it('shows escalation banner with count and rate when escalations are non-zero', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ includeEscalations: true })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Automated checks');
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
    await screen.findByText('Automated checks');
    expect(screen.queryByText(/required human escalation/i)).not.toBeInTheDocument();
  });

  it('renders check type rows (deterministic + heuristic)', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Automated checks');
    expect(screen.getByText('Automated checks')).toBeInTheDocument();
    expect(screen.getByText('Heuristic checks')).toBeInTheDocument();
  });

  it('renders failure categories when showFailureCategories is true', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Automated checks');
    expect(screen.getByText('Escalation reasons')).toBeInTheDocument();
    expect(screen.getByText('output_too_short')).toBeInTheDocument();
  });

  it('hides failure categories when showFailureCategories is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Automated checks');
    expect(screen.queryByText('Escalation reasons')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Automated checks');
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  // OMN-11388: recent individual delegation checks
  describe('recent checks table', () => {
    it('renders recent checks table with task type, model, and pass/fail when decisions data is available', async () => {
      const decisions = [
        { id: '1', task_type: 'code-review', model_name: 'Qwen3-Coder-30B', delegated_to: null, quality_gate_passed: 1, quality_gate_detail: 'schema_valid', created_at: '2026-05-05T10:00:00Z' },
        { id: '2', task_type: 'summarization', model_name: 'glm-4-plus', delegated_to: null, quality_gate_passed: 0, quality_gate_detail: 'output_too_short', created_at: '2026-05-05T09:00:00Z' },
        { id: '3', task_type: 'classification', model_name: null, delegated_to: 'codex-cli', quality_gate_passed: 1, quality_gate_detail: null, created_at: '2026-05-05T08:00:00Z' },
      ];
      mockFetchForQualityGateWithDecisions([buildDelegationQualityGate()], decisions);
      render(
        <DataSourceTestProvider client={qc}>
          <DelegationQualityGateWidget config={{}} />
        </DataSourceTestProvider>,
      );
      await screen.findByText('Automated checks');
      expect(await screen.findByText('Recent delegations (3)')).toBeInTheDocument();
      expect(screen.getByText('code-review')).toBeInTheDocument();
      expect(screen.getByText('summarization')).toBeInTheDocument();
      expect(screen.getByText('classification')).toBeInTheDocument();
      // Model names and failure categories may appear in both the recent
      // checks table and other sections, so use getAllByText.
      expect(screen.getAllByText('Qwen3-Coder-30B').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('output_too_short').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('schema_valid')).toBeInTheDocument();
    });

    it('does not render recent checks when no decisions data is available', async () => {
      mockFetchWithItems([buildDelegationQualityGate()]);
      render(
        <DataSourceTestProvider client={qc}>
          <DelegationQualityGateWidget config={{}} />
        </DataSourceTestProvider>,
      );
      await screen.findByText('Automated checks');
      expect(screen.queryByText(/Recent delegations/)).not.toBeInTheDocument();
    });
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
      await screen.findByText('Automated checks');
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
      await screen.findByText('Automated checks');
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
      await screen.findByText('Automated checks');
      expect(screen.getByText('Tokens-to-compliance by model')).toBeInTheDocument();
      // The fixture seeds Qwen3-Coder-30B at 3,120 tokens (lowest, first row).
      const models = screen.getAllByText(/Qwen3-Coder-30B|glm-4-plus|codex-cli|gemini-cli/);
      // Sorted ascending → most efficient first.
      expect(models[0].textContent).toBe('Qwen3-Coder-30B');
      expect(models[models.length - 1].textContent).toBe('gemini-cli');
    });
  });
});
