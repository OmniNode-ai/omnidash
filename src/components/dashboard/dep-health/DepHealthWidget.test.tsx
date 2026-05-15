import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DepHealthWidget from './DepHealthWidget';
import type { DepHealthFindingRow } from './DepHealthWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function makeRow(overrides: Partial<DepHealthFindingRow> = {}): DepHealthFindingRow {
  return {
    run_id: 'run-001',
    finding_type: 'MISSING_TOPIC_EDGE',
    severity: 'CRITICAL',
    repo: 'omnimarket',
    file_path: 'src/nodes/node_foo/contract.yaml',
    symbol: '',
    detail: 'Command topic onex.cmd.omnimarket.foo.v1 has no consumer.',
    rule_id: 'MISSING_TOPIC_EDGE',
    rule_version: 'v1',
    captured_at: '2025-05-15T12:00:00+00:00',
    ...overrides,
  };
}

describe('DepHealthWidget', () => {
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
        <DepHealthWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    (
      fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }
    ).mockResolvedValueOnce({ ok: false });
    render(
      <DataSourceTestProvider client={qc}>
        <DepHealthWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no dependency health findings/i)).toBeInTheDocument();
  });

  it('renders KPI tiles with 2 CRITICAL findings', async () => {
    mockFetchWithItems([
      makeRow({ severity: 'CRITICAL' }),
      makeRow({ severity: 'CRITICAL', finding_type: 'UNTESTED_HANDLER', detail: 'Missing test.' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <DepHealthWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Total findings')).toBeInTheDocument();
    expect(screen.getAllByText('CRITICAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MAJOR').length).toBeGreaterThanOrEqual(1);
  });

  it('groups findings by repo', async () => {
    mockFetchWithItems([
      makeRow({ repo: 'omnimarket' }),
      makeRow({ repo: 'omniclaude', severity: 'MAJOR', finding_type: 'DEAD_IMPORT' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <DepHealthWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total findings');
    expect(screen.getByText(/omnimarket \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/omniclaude \(1\)/)).toBeInTheDocument();
  });

  it('renders finding detail text', async () => {
    mockFetchWithItems([makeRow({ detail: 'Command topic foo has no consumer.' })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DepHealthWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total findings');
    expect(screen.getByText('Command topic foo has no consumer.')).toBeInTheDocument();
  });
});
