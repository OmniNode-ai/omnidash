import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import ReceiptGateWidget from './ReceiptGateWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function makeGate(overrides: Partial<{
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}> = {}) {
  return {
    id: 'g1',
    name: 'Schema valid',
    pass: true,
    detail: 'contract.yaml validates against ONEX v1.4',
    ...overrides,
  };
}

describe('ReceiptGateWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no gates returned', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No receipt gate data')).toBeInTheDocument();
  });

  it('renders gate rows and progress meter from projection data', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json', '1.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => makeGate({ id: 'g1', name: 'Schema valid', pass: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeGate({ id: 'g2', name: 'Identity distinct', pass: false, detail: 'verifier = worker' }) });
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Schema valid')).toBeInTheDocument();
    expect(await screen.findByText('Identity distinct')).toBeInTheDocument();
    // 1 of 2 passed — progress meter should show 1/2
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/2')).toBeInTheDocument();
  });

  it('shows MERGED stamp when all gates pass', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => makeGate({ id: 'g1', pass: true }) });
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('MERGED')).toBeInTheDocument();
  });

  it('shows stale banner when is_degraded is true in envelope', async () => {
    const envelope = {
      rows: [makeGate()],
      cursor: null,
      is_degraded: true,
      freshness: '2026-05-20T10:00:00Z',
    };
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => envelope });
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/Data may be stale/)).toBeInTheDocument();
  });

  it('renders receipt manifest fields when present in projection row', async () => {
    const gate = {
      ...makeGate(),
      worker: 'qwen3-coder-30b',
      verifier: 'deepseek-r1-32b',
      evidence_count: 12,
      signed_at: '2026-05-03T17:42:08Z',
    };
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => gate });
    render(
      <DataSourceTestProvider client={qc}>
        <ReceiptGateWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('qwen3-coder-30b')).toBeInTheDocument();
    expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
    expect(await screen.findByText('2026-05-03T17:42:08Z')).toBeInTheDocument();
  });
});
