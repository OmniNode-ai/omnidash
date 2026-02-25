/**
 * CostSource Tests (OMN-2242)
 *
 * Tests for the cost trend data source with API-first + mock-fallback.
 * Follows the same pattern as baselines-source.test.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';
import type {
  CostSummary,
  CostTrendPoint,
  CostByModel,
  CostByRepo,
  CostByPattern,
  TokenUsagePoint,
  BudgetAlert,
} from '@shared/cost-types';

// Re-import fresh for each test to reset singleton state
let costSource: (typeof import('../cost-source'))['costSource'];

// ===========================
// Test Fixtures
// ===========================

const createValidSummary = (overrides: Partial<CostSummary> = {}): CostSummary => ({
  total_cost_usd: 87.15,
  reported_cost_usd: 71.46,
  estimated_cost_usd: 15.69,
  reported_coverage_pct: 82.0,
  total_tokens: 1_736_000,
  prompt_tokens: 1_302_000,
  completion_tokens: 434_000,
  session_count: 238,
  model_count: 5,
  avg_cost_per_session: 0.3662,
  cost_change_pct: -8.3,
  active_alerts: 1,
  ...overrides,
});

const createValidTrend = (): CostTrendPoint[] => [
  {
    timestamp: '2026-02-10',
    total_cost_usd: 12.5,
    reported_cost_usd: 10.0,
    estimated_cost_usd: 2.5,
    session_count: 8,
  },
  {
    timestamp: '2026-02-11',
    total_cost_usd: 14.2,
    reported_cost_usd: 11.8,
    estimated_cost_usd: 2.4,
    session_count: 10,
  },
];

const createValidByModel = (): CostByModel[] => [
  {
    model_name: 'claude-3-opus',
    total_cost_usd: 28.5,
    reported_cost_usd: 28.5,
    estimated_cost_usd: 0,
    total_tokens: 42_000,
    prompt_tokens: 30_000,
    completion_tokens: 12_000,
    request_count: 17,
    usage_source: 'API',
  },
];

const createValidByRepo = (): CostByRepo[] => [
  {
    repo_name: 'repo-orchestrator',
    total_cost_usd: 22.4,
    reported_cost_usd: 22.4,
    estimated_cost_usd: 0,
    total_tokens: 145_000,
    session_count: 48,
    usage_source: 'API',
  },
];

const createValidByPattern = (): CostByPattern[] => [
  {
    pattern_id: 'pat-0001',
    pattern_name: 'Error Retry with Backoff',
    total_cost_usd: 8.4,
    reported_cost_usd: 8.4,
    estimated_cost_usd: 0,
    prompt_tokens: 48_000,
    completion_tokens: 20_000,
    injection_count: 145,
    avg_cost_per_injection: 0.0579,
    usage_source: 'API',
  },
];

const createValidTokenUsage = (): TokenUsagePoint[] => [
  {
    timestamp: '2026-02-10',
    prompt_tokens: 24_000,
    completion_tokens: 8_000,
    total_tokens: 32_000,
    usage_source: 'API',
  },
];

const createValidAlerts = (): BudgetAlert[] => [
  {
    id: 'alert-001',
    name: 'Daily Spend Limit',
    threshold_usd: 25.0,
    period: 'daily',
    current_spend_usd: 18.42,
    utilization_pct: 73.7,
    is_triggered: false,
    last_evaluated: '2026-02-16T12:00:00Z',
  },
  {
    id: 'alert-002',
    name: 'Weekly Budget',
    threshold_usd: 150.0,
    period: 'weekly',
    current_spend_usd: 162.8,
    utilization_pct: 108.5,
    is_triggered: true,
    last_evaluated: '2026-02-16T12:00:00Z',
  },
];

// ===========================
// Tests
// ===========================

describe('CostSource', () => {
  beforeEach(async () => {
    resetFetchMock();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    const mod = await import('../cost-source');
    costSource = mod.costSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================
  // summary() tests
  // ===========================

  describe('summary()', () => {
    it('returns API data when total_tokens > 0', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/costs/summary', createMockResponse(mockData)]]));

      const result = await costSource.summary();

      expect(result.total_cost_usd).toBe(87.15);
      expect(result.model_count).toBe(5);
    });

    it('returns empty API data as-is by default (no mockOnEmpty)', async () => {
      const emptyData = createValidSummary({ total_tokens: 0 });
      setupFetchMock(new Map([['/api/costs/summary', createMockResponse(emptyData)]]));

      const result = await costSource.summary();

      expect(result.total_tokens).toBe(0);
      expect(costSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock when summary is empty and mockOnEmpty is true', async () => {
      const emptyData = createValidSummary({ total_tokens: 0, session_count: 0 });
      setupFetchMock(new Map([['/api/costs/summary', createMockResponse(emptyData)]]));

      const result = await costSource.summary('7d', { mockOnEmpty: true });

      expect(result.total_tokens).toBeGreaterThan(0);
    });

    it('falls back to mock on HTTP error', async () => {
      setupFetchMock(
        new Map([
          ['/api/costs/summary', createMockResponse(null, { status: 500, statusText: 'Error' })],
        ])
      );

      const result = await costSource.summary('7d', { fallbackToMock: true });

      expect(result.total_tokens).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for summary')
      );
    });

    it('throws on HTTP error when fallback disabled', async () => {
      setupFetchMock(
        new Map([
          ['/api/costs/summary', createMockResponse(null, { status: 500, statusText: 'Error' })],
        ])
      );

      await expect(costSource.summary('7d', { fallbackToMock: false })).rejects.toThrow();
    });
  });

  // ===========================
  // trend() tests
  // ===========================

  describe('trend()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidTrend();
      setupFetchMock(new Map([['/api/costs/trend', createMockResponse(mockData)]]));

      const result = await costSource.trend();

      expect(result).toHaveLength(2);
      expect(result[0].total_cost_usd).toBe(12.5);
    });

    it('returns empty array as-is by default (no mockOnEmpty)', async () => {
      setupFetchMock(new Map([['/api/costs/trend', createMockResponse([])]]));

      const result = await costSource.trend();

      expect(result).toHaveLength(0);
      expect(costSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/trend', createMockResponse([])]]));

      const result = await costSource.trend('7d', { mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/trend', new Error('Connection refused')]]));

      const result = await costSource.trend('7d', { fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for trend')
      );
    });
  });

  // ===========================
  // byModel() tests
  // ===========================

  describe('byModel()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidByModel();
      setupFetchMock(new Map([['/api/costs/by-model', createMockResponse(mockData)]]));

      const result = await costSource.byModel();

      expect(result).toHaveLength(1);
      expect(result[0].model_name).toBe('claude-3-opus');
    });

    it('returns empty array as-is by default (no mockOnEmpty)', async () => {
      setupFetchMock(new Map([['/api/costs/by-model', createMockResponse([])]]));

      const result = await costSource.byModel();

      expect(result).toHaveLength(0);
      expect(costSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/by-model', createMockResponse([])]]));

      const result = await costSource.byModel({ mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/by-model', new Error('Network error')]]));

      const result = await costSource.byModel({ fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for by-model')
      );
    });
  });

  // ===========================
  // byRepo() tests
  // ===========================

  describe('byRepo()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidByRepo();
      setupFetchMock(new Map([['/api/costs/by-repo', createMockResponse(mockData)]]));

      const result = await costSource.byRepo();

      expect(result).toHaveLength(1);
      expect(result[0].repo_name).toBe('repo-orchestrator');
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/by-repo', createMockResponse([])]]));

      const result = await costSource.byRepo({ mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/by-repo', new Error('Connection refused')]]));

      const result = await costSource.byRepo({ fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for by-repo')
      );
    });
  });

  // ===========================
  // byPattern() tests
  // ===========================

  describe('byPattern()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidByPattern();
      setupFetchMock(new Map([['/api/costs/by-pattern', createMockResponse(mockData)]]));

      const result = await costSource.byPattern();

      expect(result).toHaveLength(1);
      expect(result[0].pattern_name).toBe('Error Retry with Backoff');
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/by-pattern', createMockResponse([])]]));

      const result = await costSource.byPattern({ mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/by-pattern', new Error('Network error')]]));

      const result = await costSource.byPattern({ fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for by-pattern')
      );
    });
  });

  // ===========================
  // tokenUsage() tests
  // ===========================

  describe('tokenUsage()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidTokenUsage();
      setupFetchMock(new Map([['/api/costs/token-usage', createMockResponse(mockData)]]));

      const result = await costSource.tokenUsage();

      expect(result).toHaveLength(1);
      expect(result[0].prompt_tokens).toBe(24_000);
    });

    it('returns empty array as-is by default (no mockOnEmpty)', async () => {
      setupFetchMock(new Map([['/api/costs/token-usage', createMockResponse([])]]));

      const result = await costSource.tokenUsage();

      expect(result).toHaveLength(0);
      expect(costSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/token-usage', createMockResponse([])]]));

      const result = await costSource.tokenUsage('7d', { mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/token-usage', new Error('Connection refused')]]));

      const result = await costSource.tokenUsage('7d', { fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for token-usage')
      );
    });
  });

  // ===========================
  // alerts() tests
  // ===========================

  describe('alerts()', () => {
    it('returns API data when array is non-empty', async () => {
      const mockData = createValidAlerts();
      setupFetchMock(new Map([['/api/costs/alerts', createMockResponse(mockData)]]));

      const result = await costSource.alerts();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Daily Spend Limit');
      expect(result[1].is_triggered).toBe(true);
    });

    it('returns empty array as-is by default (no mockOnEmpty)', async () => {
      setupFetchMock(new Map([['/api/costs/alerts', createMockResponse([])]]));

      const result = await costSource.alerts();

      expect(result).toHaveLength(0);
      expect(costSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock when array is empty and mockOnEmpty is true', async () => {
      setupFetchMock(new Map([['/api/costs/alerts', createMockResponse([])]]));

      const result = await costSource.alerts({ mockOnEmpty: true });

      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/costs/alerts', new Error('Network error')]]));

      const result = await costSource.alerts({ fallbackToMock: true });

      expect(result.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable for alerts')
      );
    });

    it('throws on HTTP error when fallback disabled', async () => {
      setupFetchMock(
        new Map([
          ['/api/costs/alerts', createMockResponse(null, { status: 500, statusText: 'Error' })],
        ])
      );

      await expect(costSource.alerts({ fallbackToMock: false })).rejects.toThrow();
    });
  });

  // ===========================
  // isUsingMockData tracking
  // ===========================

  describe('isUsingMockData', () => {
    it('reports false when all endpoints return real data', async () => {
      const summary = createValidSummary();
      const trend = createValidTrend();
      setupFetchMock(
        new Map([
          ['/api/costs/summary', createMockResponse(summary)],
          ['/api/costs/trend', createMockResponse(trend)],
        ])
      );

      await costSource.summary();
      await costSource.trend();

      expect(costSource.isUsingMockData).toBe(false);
    });

    it('reports true when any endpoint falls back to mock', async () => {
      const summary = createValidSummary();
      setupFetchMock(
        new Map([
          ['/api/costs/summary', createMockResponse(summary)],
          ['/api/costs/trend', new Error('Network error')],
        ])
      );

      await costSource.summary();
      await costSource.trend('7d', { fallbackToMock: true });

      expect(costSource.isUsingMockData).toBe(true);
    });

    it('clears mock flag when endpoint recovers', async () => {
      // First call: API fails
      setupFetchMock(new Map([['/api/costs/trend', new Error('Network error')]]));
      await costSource.trend('7d', { fallbackToMock: true });
      expect(costSource.isUsingMockData).toBe(true);

      // Second call: API recovers
      const trend = createValidTrend();
      setupFetchMock(new Map([['/api/costs/trend', createMockResponse(trend)]]));
      await costSource.trend();
      expect(costSource.isUsingMockData).toBe(false);
    });
  });
});
