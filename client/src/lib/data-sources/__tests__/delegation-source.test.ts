/**
 * DelegationSource Tests (OMN-2284)
 *
 * Tests for the delegation metrics data source with API-first +
 * mock-fallback behavior. Follows the same pattern as llm-routing-source.test.ts.
 *
 * Coverage:
 *  - API-first + mock-fallback on network/HTTP errors
 *  - Empty-response mock promotion (mockOnEmpty flag)
 *  - Singleton mock-state tracking (isUsingMockData / clearMockState)
 *  - Primary vs non-primary endpoint classification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockResponse, setupFetchMock, resetFetchMock } from '@/tests/utils/mock-fetch';
import type { DelegationSummary } from '@shared/delegation-types';

// Re-import the singleton fresh per test so state does not leak between cases.
let delegationSource: (typeof import('../delegation-source'))['delegationSource'];

// ===========================
// Test Fixtures
// ===========================

const createValidSummary = (overrides: Partial<DelegationSummary> = {}): DelegationSummary => ({
  total_delegations: 2_940,
  delegation_rate: 0.68,
  quality_gate_pass_rate: 0.83,
  total_cost_savings_usd: 7.056,
  avg_cost_savings_usd: 0.0024,
  shadow_divergence_rate: 0.14,
  total_shadow_comparisons: 1_323,
  avg_delegation_latency_ms: 42,
  counts: {
    total: 2_940,
    quality_gate_passed: 2_440,
    quality_gate_failed: 500,
    shadow_diverged: 185,
    shadow_agreed: 1_138,
  },
  quality_gate_trend: [
    { date: '2026-02-12', value: 0.79 },
    { date: '2026-02-13', value: 0.81 },
    { date: '2026-02-14', value: 0.83 },
  ],
  ...overrides,
});

// ===========================
// Tests
// ===========================

describe('DelegationSource', () => {
  beforeEach(async () => {
    resetFetchMock();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset module cache to get a fresh singleton each test.
    vi.resetModules();
    const mod = await import('../delegation-source');
    delegationSource = mod.delegationSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================
  // isUsingMockData initial state
  // ===========================

  describe('isUsingMockData', () => {
    it('returns false initially before any fetch', () => {
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('returns true when summary() falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/summary', new Error('Connection refused')]]));

      await delegationSource.summary('7d', { fallbackToMock: true });

      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('returns false when summary() returns real data', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/delegation/summary', createMockResponse(mockData)]]));

      await delegationSource.summary('7d');

      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('returns true when byTaskType() falls back to mock on HTTP 500', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/delegation/by-task-type',
            createMockResponse(null, { status: 500, statusText: 'Internal Server Error' }),
          ],
        ])
      );

      await delegationSource.byTaskType('7d', { fallbackToMock: true });

      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('returns true when qualityGates() falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/quality-gates', new Error('Network timeout')]]));

      await delegationSource.qualityGates('7d', { fallbackToMock: true });

      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('returns false when only trend() uses mock (not a primary endpoint)', async () => {
      // summary, byTaskType, and qualityGates all succeed with real data
      const summaryData = createValidSummary();
      setupFetchMock(
        new Map([
          ['/api/delegation/summary', createMockResponse(summaryData)],
          ['/api/delegation/by-task-type', createMockResponse([])],
          ['/api/delegation/quality-gates', createMockResponse([])],
          ['/api/delegation/trend', new Error('Network error')],
        ])
      );

      await delegationSource.summary('7d');
      await delegationSource.byTaskType('7d');
      await delegationSource.qualityGates('7d');
      await delegationSource.trend('7d', { fallbackToMock: true });

      // trend is not a primary signal, so the flag stays false.
      expect(delegationSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // clearMockState()
  // ===========================

  describe('clearMockState()', () => {
    it('clears mock endpoint tracking so isUsingMockData resets to false', async () => {
      // Force mock state via a network failure.
      setupFetchMock(new Map([['/api/delegation/summary', new Error('Network error')]]));
      await delegationSource.summary('7d', { fallbackToMock: true });
      expect(delegationSource.isUsingMockData).toBe(true);

      delegationSource.clearMockState();
      expect(delegationSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // summary() tests
  // ===========================

  describe('summary()', () => {
    it('returns real API data when total_delegations > 0', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/delegation/summary', createMockResponse(mockData)]]));

      const result = await delegationSource.summary('7d');

      expect(result.total_delegations).toBe(2_940);
      expect(result.quality_gate_pass_rate).toBe(0.83);
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on HTTP error and marks endpoint as mock', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/delegation/summary',
            createMockResponse(null, { status: 503, statusText: 'Service Unavailable' }),
          ],
        ])
      );

      const result = await delegationSource.summary('7d', { fallbackToMock: true });

      // Mock summary always has non-zero delegations.
      expect(result.total_delegations).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[DelegationSource] fetch failed for summary'),
        expect.anything()
      );
    });

    it('falls back to mock when total_delegations is 0 and mockOnEmpty is true', async () => {
      const emptyData = createValidSummary({ total_delegations: 0 });
      setupFetchMock(new Map([['/api/delegation/summary', createMockResponse(emptyData)]]));

      const result = await delegationSource.summary('7d', { mockOnEmpty: true });

      expect(result.total_delegations).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
      // Shape assertions
      expect(result).toHaveProperty('quality_gate_pass_rate');
      expect(result).toHaveProperty('total_cost_savings_usd');
      expect(result).toHaveProperty('shadow_divergence_rate');
      expect(result).toHaveProperty('counts');
      expect(result).toHaveProperty('quality_gate_trend');
    });

    it('returns live empty result when total_delegations is 0 and mockOnEmpty is false (default)', async () => {
      const emptyData = createValidSummary({ total_delegations: 0 });
      setupFetchMock(new Map([['/api/delegation/summary', createMockResponse(emptyData)]]));

      const result = await delegationSource.summary('7d');

      expect(result.total_delegations).toBe(0);
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/summary', new Error('Network error')]]));

      await expect(delegationSource.summary('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch delegation summary'
      );
    });

    it('returns mock data immediately when demoMode is true', async () => {
      const result = await delegationSource.summary('7d', { demoMode: true });

      expect(result.total_delegations).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
    });
  });

  // ===========================
  // byTaskType() tests
  // ===========================

  describe('byTaskType()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          task_type: 'code-review',
          total: 1840,
          quality_gate_passed: 1585,
          quality_gate_pass_rate: 0.861,
          total_cost_savings_usd: 5.704,
          avg_cost_savings_usd: 0.0031,
          avg_latency_ms: 38,
          shadow_divergences: 64,
        },
      ];
      setupFetchMock(new Map([['/api/delegation/by-task-type', createMockResponse(data)]]));

      const result = await delegationSource.byTaskType('7d');

      expect(result).toHaveLength(1);
      expect(result[0].task_type).toBe('code-review');
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/by-task-type', new Error('Connection refused')]]));

      const result = await delegationSource.byTaskType('7d', { fallbackToMock: true });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('falls back to mock when result is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/delegation/by-task-type', createMockResponse([])]]));

      const result = await delegationSource.byTaskType('7d', { mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/by-task-type', new Error('Network error')]]));

      await expect(delegationSource.byTaskType('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch delegation by task type'
      );
    });
  });

  // ===========================
  // costSavings() tests
  // ===========================

  describe('costSavings()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          date: '2026-02-17',
          cost_savings_usd: 1.008,
          total_cost_usd: 1.596,
          total_delegations: 420,
          avg_savings_usd: 0.0024,
        },
      ];
      setupFetchMock(new Map([['/api/delegation/cost-savings', createMockResponse(data)]]));

      const result = await delegationSource.costSavings('7d');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-02-17');
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/cost-savings', new Error('Network error')]]));

      const result = await delegationSource.costSavings('7d', { fallbackToMock: true });

      expect(Array.isArray(result)).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/cost-savings', new Error('Network error')]]));

      await expect(delegationSource.costSavings('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch delegation cost savings'
      );
    });
  });

  // ===========================
  // qualityGates() tests
  // ===========================

  describe('qualityGates()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          date: '2026-02-17',
          pass_rate: 0.83,
          total_checked: 420,
          passed: 349,
          failed: 71,
        },
      ];
      setupFetchMock(new Map([['/api/delegation/quality-gates', createMockResponse(data)]]));

      const result = await delegationSource.qualityGates('7d');

      expect(result).toHaveLength(1);
      expect(result[0].pass_rate).toBe(0.83);
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on HTTP 502', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/delegation/quality-gates',
            createMockResponse(null, { status: 502, statusText: 'Bad Gateway' }),
          ],
        ])
      );

      const result = await delegationSource.qualityGates('7d', { fallbackToMock: true });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(delegationSource.isUsingMockData).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/quality-gates', new Error('Network error')]]));

      await expect(delegationSource.qualityGates('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch delegation quality gates'
      );
    });
  });

  // ===========================
  // shadowDivergence() tests
  // ===========================

  describe('shadowDivergence()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          occurred_at: '2026-02-17T10:00:00Z',
          primary_agent: 'python-fastapi-expert',
          shadow_agent: 'testing',
          task_type: 'code-review',
          count: 128,
          avg_divergence_score: 0.34,
          avg_primary_latency_ms: 88,
          avg_shadow_latency_ms: 142,
        },
      ];
      setupFetchMock(new Map([['/api/delegation/shadow-divergence', createMockResponse(data)]]));

      const result = await delegationSource.shadowDivergence('7d');

      expect(result).toHaveLength(1);
      expect(result[0].primary_agent).toBe('python-fastapi-expert');
      // shadow-divergence is not a primary signal.
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/shadow-divergence', new Error('Network error')]]));

      const result = await delegationSource.shadowDivergence('7d', { fallbackToMock: true });

      expect(Array.isArray(result)).toBe(true);
      // shadow-divergence is not a primary signal.
      expect(delegationSource.isUsingMockData).toBe(false);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/shadow-divergence', new Error('Network error')]]));

      await expect(
        delegationSource.shadowDivergence('7d', { fallbackToMock: false })
      ).rejects.toThrow('Failed to fetch delegation shadow divergence');
    });
  });

  // ===========================
  // trend() tests
  // ===========================

  describe('trend()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          date: '2026-02-17',
          quality_gate_pass_rate: 0.83,
          shadow_divergence_rate: 0.14,
          cost_savings_usd: 1.008,
          total_delegations: 420,
        },
      ];
      setupFetchMock(new Map([['/api/delegation/trend', createMockResponse(data)]]));

      const result = await delegationSource.trend('7d');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-02-17');
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/delegation/trend', new Error('Network error')]]));

      const result = await delegationSource.trend('7d', { fallbackToMock: true });

      expect(Array.isArray(result)).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/delegation/trend', new Error('Network error')]]));

      await expect(delegationSource.trend('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch delegation trend'
      );
    });
  });
});
