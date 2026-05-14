import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DELEGATION_ENDPOINTS,
  fetchDelegationSummary,
  fetchRecentDelegations,
  fetchModelRouting,
  fetchQualityGate,
  fetchDelegationSavings,
} from './delegation-api';
import { TOPICS } from '@shared/types/topics';

describe('DELEGATION_ENDPOINTS', () => {
  it('maps all 5 endpoints to canonical topic strings from TOPICS', () => {
    expect(DELEGATION_ENDPOINTS.summary).toBe(TOPICS.delegationSummary);
    expect(DELEGATION_ENDPOINTS.recentDelegations).toBe(TOPICS.delegationDecisions);
    expect(DELEGATION_ENDPOINTS.modelRouting).toBe(TOPICS.delegationModelRouting);
    expect(DELEGATION_ENDPOINTS.qualityGate).toBe(TOPICS.delegationQualityGate);
    expect(DELEGATION_ENDPOINTS.savings).toBe(TOPICS.delegationSavings);
  });
});

describe('delegation-api fetch functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchDelegationSummary calls /api/delegation/summary and returns array', async () => {
    const row = { totalDelegations: 5, qualityGatePassRate: 0.8, qualityGatePassed: 4, qualityGateTotal: 5, totalSavingsUsd: 1.2, byTaskType: [], byModel: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [row] }));

    const result = await fetchDelegationSummary();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(row);
    expect(fetch).toHaveBeenCalledWith('/api/delegation/summary');
  });

  it('fetchDelegationSummary unwraps envelope with rows field', async () => {
    const row = { totalDelegations: 3, qualityGatePassRate: 1, qualityGatePassed: 3, qualityGateTotal: 3, totalSavingsUsd: 0, byTaskType: [], byModel: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [row], cursor: null }) }));

    const result = await fetchDelegationSummary();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(row);
  });

  it('fetchRecentDelegations calls /api/delegation/recent-delegations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchRecentDelegations();
    expect(fetch).toHaveBeenCalledWith('/api/delegation/recent-delegations');
  });

  it('fetchModelRouting calls /api/delegation/model-routing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchModelRouting();
    expect(fetch).toHaveBeenCalledWith('/api/delegation/model-routing');
  });

  it('fetchQualityGate calls /api/delegation/quality-gate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchQualityGate();
    expect(fetch).toHaveBeenCalledWith('/api/delegation/quality-gate');
  });

  it('fetchDelegationSavings calls /api/delegation/savings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchDelegationSavings();
    expect(fetch).toHaveBeenCalledWith('/api/delegation/savings');
  });

  it('returns empty array on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    const result = await fetchDelegationSummary();
    expect(result).toEqual([]);
  });

  it('accepts a custom baseUrl option', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchDelegationSummary({ baseUrl: 'http://localhost:8085' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:8085/summary');
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }));
    await fetchModelRouting({ baseUrl: 'http://example.com/api/delegation/' });
    expect(fetch).toHaveBeenCalledWith('http://example.com/api/delegation/model-routing');
  });

  it('does not reference process.env for delegation connection', async () => {
    // Read the compiled module source and assert no process.env reference
    // appears anywhere in the URL-resolution path. This proves the adapter
    // is browser-safe and does not depend on Node-only globals.
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const path = await import('node:path');
    const modulePath = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      'delegation-api.ts',
    );
    const source = await fs.readFile(modulePath, 'utf-8');
    expect(source).not.toMatch(/process\.env/);
  });
});
