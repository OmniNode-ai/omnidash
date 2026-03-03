/**
 * LlmRoutingProjection.queryByModel tests (OMN-3442)
 *
 * Exercises queryByModel() with a mocked DB to verify:
 *   1. Returns empty array when no rows
 *   2. Maps DB row fields to LlmRoutingByModel shape
 *   3. Computes agreement_rate correctly (agreed / (agreed + disagreed))
 *   4. Falls back to 'unknown' when model column is null
 *   5. agreement_rate is 0 when both agreed and disagreed are 0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmRoutingProjection } from '../llm-routing-projection';

// ============================================================================
// Mock storage (prevent real DB connections on import)
// ============================================================================

const mockTryGet = vi.fn(() => null);

vi.mock('../../storage', () => ({
  tryGetIntelligenceDb: (...args: unknown[]) => mockTryGet(...args),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// ============================================================================
// Helpers
// ============================================================================

function buildMockDb(results: Record<string, unknown>[][]) {
  let callIndex = 0;
  return {
    execute: vi.fn(() => {
      const rows = results[callIndex] ?? [];
      callIndex++;
      return Promise.resolve({ rows });
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('LlmRoutingProjection.queryByModel', () => {
  let projection: LlmRoutingProjection;

  beforeEach(() => {
    projection = new LlmRoutingProjection();
  });

  it('returns empty array when no rows', async () => {
    const db = buildMockDb([[]]);
    const result = await projection.queryByModel(db as never, '7d');
    expect(result).toEqual([]);
  });

  it('maps DB row fields to LlmRoutingByModel shape', async () => {
    const db = buildMockDb([
      [
        {
          model: 'claude-3-5-sonnet',
          total: 100,
          agreed: 80,
          disagreed: 20,
          avg_llm_latency_ms: 350,
          avg_cost_usd: '0.00012',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
      ],
    ]);

    const result = await projection.queryByModel(db as never, '7d');

    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.model).toBe('claude-3-5-sonnet');
    expect(row.total).toBe(100);
    expect(row.agreed).toBe(80);
    expect(row.disagreed).toBe(20);
    expect(row.avg_llm_latency_ms).toBe(350);
    expect(row.avg_cost_usd).toBeCloseTo(0.00012);
    expect(row.prompt_tokens_avg).toBe(0);
    expect(row.completion_tokens_avg).toBe(0);
  });

  it('computes agreement_rate as agreed / (agreed + disagreed)', async () => {
    const db = buildMockDb([
      [
        {
          model: 'claude-3-5-sonnet',
          total: 100,
          agreed: 75,
          disagreed: 25,
          avg_llm_latency_ms: 300,
          avg_cost_usd: '0.0001',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
      ],
    ]);

    const result = await projection.queryByModel(db as never, '7d');
    expect(result[0].agreement_rate).toBeCloseTo(0.75);
  });

  it('falls back to "unknown" when model column is null', async () => {
    const db = buildMockDb([
      [
        {
          model: null,
          total: 10,
          agreed: 5,
          disagreed: 5,
          avg_llm_latency_ms: 200,
          avg_cost_usd: '0',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
      ],
    ]);

    // The SQL COALESCE maps null → 'unknown' before we even get here,
    // but the mapper also guards with String(r.model ?? 'unknown').
    const result = await projection.queryByModel(db as never, '7d');
    expect(result[0].model).toBe('unknown');
  });

  it('returns agreement_rate of 0 when agreed and disagreed are both 0', async () => {
    const db = buildMockDb([
      [
        {
          model: 'fallback-only-model',
          total: 5,
          agreed: 0,
          disagreed: 0,
          avg_llm_latency_ms: 0,
          avg_cost_usd: '0',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
      ],
    ]);

    const result = await projection.queryByModel(db as never, '7d');
    expect(result[0].agreement_rate).toBe(0);
  });

  it('handles multiple models and preserves order', async () => {
    const db = buildMockDb([
      [
        {
          model: 'gpt-4o',
          total: 200,
          agreed: 160,
          disagreed: 40,
          avg_llm_latency_ms: 500,
          avg_cost_usd: '0.0005',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
        {
          model: 'claude-3-5-sonnet',
          total: 100,
          agreed: 70,
          disagreed: 30,
          avg_llm_latency_ms: 350,
          avg_cost_usd: '0.00012',
          prompt_tokens_avg: 0,
          completion_tokens_avg: 0,
        },
      ],
    ]);

    const result = await projection.queryByModel(db as never, '7d');
    expect(result).toHaveLength(2);
    expect(result[0].model).toBe('gpt-4o');
    expect(result[0].total).toBe(200);
    expect(result[1].model).toBe('claude-3-5-sonnet');
    expect(result[1].total).toBe(100);
  });
});
