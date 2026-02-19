/**
 * EnrichmentSource Tests (OMN-2280)
 *
 * Tests for the context enrichment data source with API-first + mock-fallback.
 * Follows the same pattern as cost-source.test.ts and effectiveness-source.test.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockResponse, setupFetchMock, resetFetchMock } from '@/tests/utils/mock-fetch';
import type { EnrichmentSummary } from '@shared/enrichment-types';

// Re-import fresh for each test to reset singleton state
let enrichmentSource: (typeof import('../enrichment-source'))['enrichmentSource'];

// ===========================
// Test Fixtures
// ===========================

const createValidSummary = (overrides: Partial<EnrichmentSummary> = {}): EnrichmentSummary => ({
  total_enrichments: 4_820,
  hit_rate: 0.73,
  net_tokens_saved: 128_400,
  p50_latency_ms: 42,
  p95_latency_ms: 185,
  avg_similarity_score: 0.81,
  inflation_alert_count: 3,
  error_rate: 0.01,
  counts: { hits: 3_519, misses: 1_108, errors: 48, inflated: 145 },
  ...overrides,
});

// ===========================
// Tests
// ===========================

describe('EnrichmentSource', () => {
  beforeEach(async () => {
    resetFetchMock();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset module cache to get a fresh singleton each test
    vi.resetModules();
    const mod = await import('../enrichment-source');
    enrichmentSource = mod.enrichmentSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================
  // isUsingMockData initial state
  // ===========================

  describe('isUsingMockData', () => {
    it('returns false initially before any fetch', () => {
      expect(enrichmentSource.isUsingMockData).toBe(false);
    });

    it('returns true when summary() falls back to mock on network error', async () => {
      setupFetchMock(new Map([['/api/enrichment/summary', new Error('Connection refused')]]));

      await enrichmentSource.summary('7d');

      expect(enrichmentSource.isUsingMockData).toBe(true);
    });

    it('returns false when summary() returns real data', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/enrichment/summary', createMockResponse(mockData)]]));

      await enrichmentSource.summary('7d');

      expect(enrichmentSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // clearMockState()
  // ===========================

  describe('clearMockState()', () => {
    it('clears mock endpoint tracking so isUsingMockData resets to false', async () => {
      // Force mock state by failing the fetch
      setupFetchMock(new Map([['/api/enrichment/summary', new Error('Network error')]]));
      await enrichmentSource.summary('7d');
      expect(enrichmentSource.isUsingMockData).toBe(true);

      // Clear should reset the flag
      enrichmentSource.clearMockState();
      expect(enrichmentSource.isUsingMockData).toBe(false);
    });
  });

  // ===========================
  // summary() tests
  // ===========================

  describe('summary()', () => {
    it('returns real API data when total_enrichments > 0', async () => {
      const mockData = createValidSummary();
      setupFetchMock(new Map([['/api/enrichment/summary', createMockResponse(mockData)]]));

      const result = await enrichmentSource.summary('7d');

      expect(result.total_enrichments).toBe(4_820);
      expect(result.hit_rate).toBe(0.73);
      expect(enrichmentSource.isUsingMockData).toBe(false);
    });

    it('falls back to mock on HTTP error and marks endpoint as mock', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/enrichment/summary',
            createMockResponse(null, { status: 500, statusText: 'Internal Server Error' }),
          ],
        ])
      );

      const result = await enrichmentSource.summary('7d');

      // Mock data always has non-zero enrichments
      expect(result.total_enrichments).toBeGreaterThan(0);
      expect(enrichmentSource.isUsingMockData).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[EnrichmentSource] fetch failed for summary'),
        expect.anything()
      );
    });

    it('falls back to mock when total_enrichments is 0 and mockOnEmpty is true', async () => {
      const emptyData = createValidSummary({ total_enrichments: 0 });
      setupFetchMock(new Map([['/api/enrichment/summary', createMockResponse(emptyData)]]));

      const result = await enrichmentSource.summary('7d', { mockOnEmpty: true });

      expect(result.total_enrichments).toBeGreaterThan(0);
      expect(enrichmentSource.isUsingMockData).toBe(true);
      // Structural assertions: verify the returned object has the expected EnrichmentSummary shape
      expect(result).toHaveProperty('hit_rate');
      expect(result).toHaveProperty('error_rate');
      expect(result).toHaveProperty('total_enrichments');
      expect(result).toHaveProperty('net_tokens_saved');
    });

    it('returns live empty result when total_enrichments is 0 and mockOnEmpty is false (default)', async () => {
      const emptyData = createValidSummary({ total_enrichments: 0 });
      setupFetchMock(new Map([['/api/enrichment/summary', createMockResponse(emptyData)]]));

      const result = await enrichmentSource.summary('7d');

      expect(result.total_enrichments).toBe(0);
      expect(enrichmentSource.isUsingMockData).toBe(false);
    });
  });
});
