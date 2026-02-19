/**
 * LlmRoutingSource Tests (OMN-2279)
 *
 * Tests for the LLM routing effectiveness data source with API-first +
 * mock-fallback behavior.  Follows the same pattern as enrichment-source.test.ts.
 *
 * Coverage:
 *  - API-first + mock-fallback on network/HTTP errors
 *  - Empty-response mock promotion (mockOnEmpty flag)
 *  - Singleton mock-state tracking (isUsingMockData / clearMockState)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockResponse, setupFetchMock, resetFetchMock } from '@/tests/utils/mock-fetch';
import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
} from '@shared/llm-routing-types';

// Re-import the singleton fresh per test so state does not leak between cases.
let llmRoutingSource: (typeof import('../llm-routing-source'))['llmRoutingSource'];

// ===========================
// Test Fixtures
// ===========================

const createValidSummary = (overrides: Partial<LlmRoutingSummary> = {}): LlmRoutingSummary => ({
  total_decisions: 1_200,
  agreement_rate: 0.72,
  fallback_rate: 0.08,
  avg_cost_usd: 0.0004,
  llm_p50_latency_ms: 320,
  llm_p95_latency_ms: 890,
  fuzzy_p50_latency_ms: 4,
  fuzzy_p95_latency_ms: 18,
  counts: { total: 1_200, agreed: 864, disagreed: 336, fallback: 96 },
  agreement_rate_trend: [
    { date: '2026-02-12', value: 0.68 },
    { date: '2026-02-13', value: 0.71 },
    { date: '2026-02-14', value: 0.72 },
  ],
  ...overrides,
});

const createValidLatencyPoints = (): LlmRoutingLatencyPoint[] => [
  { method: 'LLM', p50_ms: 320, p90_ms: 720, p95_ms: 890, p99_ms: 1_200, sample_count: 1_200 },
  { method: 'Fuzzy', p50_ms: 4, p90_ms: 14, p95_ms: 18, p99_ms: 32, sample_count: 1_200 },
];

const createValidByVersion = (): LlmRoutingByVersion[] => [
  {
    routing_prompt_version: 'v1.0.0',
    total: 600,
    agreed: 390,
    disagreed: 210,
    agreement_rate: 0.65,
    avg_llm_latency_ms: 360,
    avg_fuzzy_latency_ms: 5,
    avg_cost_usd: 0.00045,
  },
  {
    routing_prompt_version: 'v1.1.0',
    total: 600,
    agreed: 474,
    disagreed: 126,
    agreement_rate: 0.79,
    avg_llm_latency_ms: 290,
    avg_fuzzy_latency_ms: 4,
    avg_cost_usd: 0.00038,
  },
];

// ===========================
// Tests
// ===========================

describe('LlmRoutingSource', () => {
  beforeEach(async () => {
    resetFetchMock();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset module cache to get a fresh singleton each test.
    vi.resetModules();
    const mod = await import('../llm-routing-source');
    llmRoutingSource = mod.llmRoutingSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================
  // isUsingMockData initial state
  // ===========================

  describe('isUsingMockData', () => {
    it('returns false initially before any fetch', () => {
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('returns true when summary() falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/llm-routing/summary', new Error('Connection refused')]]));

      await llmRoutingSource.summary('7d');

      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('returns false when summary() returns real data', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/llm-routing/summary', createMockResponse(mockData)]]));

      await llmRoutingSource.summary('7d');

      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('returns true when latency() falls back to mock on HTTP 500', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/llm-routing/latency',
            createMockResponse(null, { status: 500, statusText: 'Internal Server Error' }),
          ],
        ])
      );

      await llmRoutingSource.latency('7d');

      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('returns true when byVersion() falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/llm-routing/by-version', new Error('Network timeout')]]));

      await llmRoutingSource.byVersion('7d');

      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('returns false when only disagreements() uses mock (not a primary endpoint)', async () => {
      // summary, latency, by-version all succeed with real data
      const summaryData = createValidSummary();
      const latencyData = createValidLatencyPoints();
      const byVersionData = createValidByVersion();
      setupFetchMock(
        new Map([
          ['/api/llm-routing/summary', createMockResponse(summaryData)],
          ['/api/llm-routing/latency', createMockResponse(latencyData)],
          ['/api/llm-routing/by-version', createMockResponse(byVersionData)],
          ['/api/llm-routing/disagreements', new Error('Network error')],
        ])
      );

      await llmRoutingSource.summary('7d');
      await llmRoutingSource.latency('7d');
      await llmRoutingSource.byVersion('7d');
      await llmRoutingSource.disagreements('7d');

      // Disagreements is not a primary signal, so the flag stays false.
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // clearMockState()
  // ===========================

  describe('clearMockState()', () => {
    it('clears mock endpoint tracking so isUsingMockData resets to false', async () => {
      // Force mock state via a network failure.
      setupFetchMock(new Map([['/api/llm-routing/summary', new Error('Network error')]]));
      await llmRoutingSource.summary('7d');
      expect(llmRoutingSource.isUsingMockData).toBe(true);

      llmRoutingSource.clearMockState();
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // summary() tests
  // ===========================

  describe('summary()', () => {
    it('returns real API data when total_decisions > 0', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/llm-routing/summary', createMockResponse(mockData)]]));

      const result = await llmRoutingSource.summary('7d');

      expect(result.total_decisions).toBe(1_200);
      expect(result.agreement_rate).toBe(0.72);
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on HTTP error and marks endpoint as mock', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/llm-routing/summary',
            createMockResponse(null, { status: 503, statusText: 'Service Unavailable' }),
          ],
        ])
      );

      const result = await llmRoutingSource.summary('7d');

      // Mock summary always has non-zero decisions.
      expect(result.total_decisions).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[LlmRoutingSource] fetch failed for summary'),
        expect.anything()
      );
    });

    it('falls back to mock when total_decisions is 0 and mockOnEmpty is true', async () => {
      const emptyData = createValidSummary({ total_decisions: 0 });
      setupFetchMock(new Map([['/api/llm-routing/summary', createMockResponse(emptyData)]]));

      const result = await llmRoutingSource.summary('7d', { mockOnEmpty: true });

      expect(result.total_decisions).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
      // Shape assertions
      expect(result).toHaveProperty('agreement_rate');
      expect(result).toHaveProperty('fallback_rate');
      expect(result).toHaveProperty('avg_cost_usd');
      expect(result).toHaveProperty('counts');
      expect(result).toHaveProperty('agreement_rate_trend');
    });

    it('returns live empty result when total_decisions is 0 and mockOnEmpty is false (default)', async () => {
      const emptyData = createValidSummary({ total_decisions: 0 });
      setupFetchMock(new Map([['/api/llm-routing/summary', createMockResponse(emptyData)]]));

      const result = await llmRoutingSource.summary('7d');

      expect(result.total_decisions).toBe(0);
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/llm-routing/summary', new Error('Network error')]]));

      await expect(llmRoutingSource.summary('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch LLM routing summary'
      );
    });
  });

  // ===========================
  // latency() tests
  // ===========================

  describe('latency()', () => {
    it('returns real API data on success', async () => {
      const data = createValidLatencyPoints();
      setupFetchMock(new Map([['/api/llm-routing/latency', createMockResponse(data)]]));

      const result = await llmRoutingSource.latency('7d');

      expect(result).toHaveLength(2);
      expect(result[0].method).toBe('LLM');
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/llm-routing/latency', new Error('Connection refused')]]));

      const result = await llmRoutingSource.latency('7d');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('falls back to mock when result is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/llm-routing/latency', createMockResponse([])]]));

      const result = await llmRoutingSource.latency('7d', { mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('returns empty array when result is empty and mockOnEmpty is false (default)', async () => {
      setupFetchMock(new Map([['/api/llm-routing/latency', createMockResponse([])]]));

      const result = await llmRoutingSource.latency('7d');

      expect(result).toHaveLength(0);
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/llm-routing/latency', new Error('Network error')]]));

      await expect(llmRoutingSource.latency('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch LLM routing latency'
      );
    });
  });

  // ===========================
  // byVersion() tests
  // ===========================

  describe('byVersion()', () => {
    it('returns real API data on success', async () => {
      const data = createValidByVersion();
      setupFetchMock(new Map([['/api/llm-routing/by-version', createMockResponse(data)]]));

      const result = await llmRoutingSource.byVersion('7d');

      expect(result).toHaveLength(2);
      expect(result[0].routing_prompt_version).toBe('v1.0.0');
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on HTTP 502', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/llm-routing/by-version',
            createMockResponse(null, { status: 502, statusText: 'Bad Gateway' }),
          ],
        ])
      );

      const result = await llmRoutingSource.byVersion('7d');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('falls back to mock when result is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/llm-routing/by-version', createMockResponse([])]]));

      const result = await llmRoutingSource.byVersion('7d', { mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
      expect(llmRoutingSource.isUsingMockData).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/llm-routing/by-version', new Error('Network error')]]));

      await expect(llmRoutingSource.byVersion('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch LLM routing by version'
      );
    });
  });

  // ===========================
  // disagreements() tests
  // ===========================

  describe('disagreements()', () => {
    it('returns real API data on success', async () => {
      const data = [
        {
          occurred_at: '2026-02-17T10:00:00Z',
          llm_agent: 'agent-api',
          fuzzy_agent: 'agent-frontend',
          count: 5,
          avg_llm_confidence: 0.55,
          avg_fuzzy_confidence: 0.61,
          routing_prompt_version: 'v1.0.0',
        },
      ];
      setupFetchMock(new Map([['/api/llm-routing/disagreements', createMockResponse(data)]]));

      const result = await llmRoutingSource.disagreements('7d');

      expect(result).toHaveLength(1);
      expect(result[0].llm_agent).toBe('agent-api');
      // disagreements is not a primary endpoint, so isUsingMockData reflects
      // only summary/latency/by-version state (still false here).
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/llm-routing/disagreements', new Error('Network error')]]));

      const result = await llmRoutingSource.disagreements('7d');

      expect(Array.isArray(result)).toBe(true);
      // isUsingMockData remains false because disagreements is not a primary signal.
      expect(llmRoutingSource.isUsingMockData).toBe(false);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/llm-routing/disagreements', new Error('Network error')]]));

      await expect(llmRoutingSource.disagreements('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch LLM routing disagreements'
      );
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
          agreement_rate: 0.72,
          fallback_rate: 0.08,
          avg_cost_usd: 0.0004,
          total_decisions: 180,
        },
      ];
      setupFetchMock(new Map([['/api/llm-routing/trend', createMockResponse(data)]]));

      const result = await llmRoutingSource.trend('7d');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-02-17');
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/llm-routing/trend', new Error('Network error')]]));

      const result = await llmRoutingSource.trend('7d');

      expect(Array.isArray(result)).toBe(true);
    });

    it('throws when fallbackToMock is false and fetch fails', async () => {
      setupFetchMock(new Map([['/api/llm-routing/trend', new Error('Network error')]]));

      await expect(llmRoutingSource.trend('7d', { fallbackToMock: false })).rejects.toThrow(
        'Failed to fetch LLM routing trend'
      );
    });
  });
});
