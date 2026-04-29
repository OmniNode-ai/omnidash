import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import ReadinessGate, { applyFreshnessDowngrade } from './ReadinessGate';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const SEVEN_DIMS = [
  { name: 'CI', status: 'PASS', detail: 'All green' },
  { name: 'Tests', status: 'PASS', detail: '98%' },
  { name: 'Coverage', status: 'WARN', detail: '72%' },
  { name: 'Contracts', status: 'PASS', detail: 'No drift' },
  { name: 'Dependencies', status: 'PASS', detail: 'No CVEs' },
  { name: 'Security', status: 'PASS', detail: 'Clean' },
  { name: 'Performance', status: 'WARN', detail: '420ms' },
];

const FRESH_TS = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago — fresh

describe('ReadinessGate', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders 7 dimension labels', async () => {
    mockFetchWithItems([{
      dimensions: SEVEN_DIMS,
      overallStatus: 'WARN',
      lastCheckedAt: FRESH_TS,
    }]);
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    for (const name of ['CI', 'Tests', 'Coverage', 'Contracts', 'Dependencies', 'Security', 'Performance']) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it('renders tri-state pills: PASS, WARN, FAIL', async () => {
    mockFetchWithItems([{
      dimensions: [
        { name: 'CI', status: 'PASS', detail: '' },
        { name: 'Tests', status: 'WARN', detail: '' },
        { name: 'Coverage', status: 'FAIL', detail: '' },
        { name: 'Contracts', status: 'PASS', detail: '' },
        { name: 'Dependencies', status: 'PASS', detail: '' },
        { name: 'Security', status: 'PASS', detail: '' },
        { name: 'Performance', status: 'PASS', detail: '' },
      ],
      overallStatus: 'FAIL',
      lastCheckedAt: FRESH_TS,
    }]);
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    await screen.findByText('CI');
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('WARN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0);
  });

  it('shows FAIL overall when any dimension is FAIL', async () => {
    mockFetchWithItems([{
      dimensions: [
        { name: 'CI', status: 'FAIL', detail: 'Workflow failed' },
        ...['Tests', 'Coverage', 'Contracts', 'Dependencies', 'Security', 'Performance'].map((n) => ({ name: n, status: 'PASS', detail: '' })),
      ],
      overallStatus: 'FAIL',
      lastCheckedAt: FRESH_TS,
    }]);
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    const failElements = await screen.findAllByText('FAIL');
    expect(failElements.length).toBeGreaterThan(0);
  });

  // --- applyFreshnessDowngrade unit tests ---

  describe('applyFreshnessDowngrade', () => {
    const nowMs = new Date('2026-04-29T12:00:00Z').getTime();

    it('returns status unchanged when data is <24h old', () => {
      const ts = new Date(nowMs - 23 * 60 * 60 * 1000).toISOString();
      expect(applyFreshnessDowngrade('PASS', ts, nowMs)).toBe('PASS');
      expect(applyFreshnessDowngrade('WARN', ts, nowMs)).toBe('WARN');
      expect(applyFreshnessDowngrade('FAIL', ts, nowMs)).toBe('FAIL');
    });

    it('downgrades PASS to WARN when data is exactly >24h old', () => {
      const ts = new Date(nowMs - 25 * 60 * 60 * 1000).toISOString();
      expect(applyFreshnessDowngrade('PASS', ts, nowMs)).toBe('WARN');
    });

    it('leaves WARN and FAIL unchanged when data is 24-72h old', () => {
      const ts = new Date(nowMs - 25 * 60 * 60 * 1000).toISOString();
      expect(applyFreshnessDowngrade('WARN', ts, nowMs)).toBe('WARN');
      expect(applyFreshnessDowngrade('FAIL', ts, nowMs)).toBe('FAIL');
    });

    it('forces FAIL for all statuses when data is >72h old', () => {
      const ts = new Date(nowMs - 73 * 60 * 60 * 1000).toISOString();
      expect(applyFreshnessDowngrade('PASS', ts, nowMs)).toBe('FAIL');
      expect(applyFreshnessDowngrade('WARN', ts, nowMs)).toBe('FAIL');
      expect(applyFreshnessDowngrade('FAIL', ts, nowMs)).toBe('FAIL');
    });
  });

  // --- Integration: freshness downgrade visible in rendered overall pill ---

  it('overall pill shows WARN when data is 25h stale (freshness downgrade)', async () => {
    const staleTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockFetchWithItems([{
      dimensions: SEVEN_DIMS,
      overallStatus: 'PASS',
      lastCheckedAt: staleTs,
    }]);
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    await screen.findByText('CI');
    const pill = screen.getByTestId('overall-status-pill');
    expect(pill.textContent).toBe('WARN');
  });

  it('overall pill shows FAIL when data is 73h stale (freshness downgrade)', async () => {
    const staleTs = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    mockFetchWithItems([{
      dimensions: SEVEN_DIMS,
      overallStatus: 'PASS',
      lastCheckedAt: staleTs,
    }]);
    render(<DataSourceTestProvider client={qc}><ReadinessGate config={{}} /></DataSourceTestProvider>);
    await screen.findByText('CI');
    const pill = screen.getByTestId('overall-status-pill');
    expect(pill.textContent).toBe('FAIL');
  });
});
