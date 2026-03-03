/**
 * LlmRoutingProjection — queryFuzzyConfidenceDistribution + queryModels (OMN-3447)
 *
 * Tests:
 *   queryFuzzyConfidenceDistribution:
 *     1. Returns empty array when no rows
 *     2. Maps DB row fields (bucket, sort_key, count) correctly
 *     3. Preserves sort_key ordering
 *     4. Handles null sort_key / count gracefully
 *
 *   queryModels:
 *     1. Returns empty array when no rows
 *     2. Returns distinct model names as strings
 *     3. Falls back to 'unknown' when model column returns null
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
// queryFuzzyConfidenceDistribution tests
// ============================================================================

describe('LlmRoutingProjection.queryFuzzyConfidenceDistribution', () => {
  let projection: LlmRoutingProjection;

  beforeEach(() => {
    projection = new LlmRoutingProjection();
  });

  it('returns empty array when no rows', async () => {
    const db = buildMockDb([[]]);
    const result = await projection.queryFuzzyConfidenceDistribution(db as never, '7d');
    expect(result).toEqual([]);
  });

  it('maps DB row fields correctly', async () => {
    const db = buildMockDb([
      [
        { bucket: 'no_data', sort_key: 0, count: 10 },
        { bucket: '0–30%', sort_key: 1, count: 5 },
        { bucket: '90–100%', sort_key: 5, count: 42 },
      ],
    ]);
    const result = await projection.queryFuzzyConfidenceDistribution(db as never, '7d');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ bucket: 'no_data', sort_key: 0, count: 10 });
    expect(result[1]).toEqual({ bucket: '0–30%', sort_key: 1, count: 5 });
    expect(result[2]).toEqual({ bucket: '90–100%', sort_key: 5, count: 42 });
  });

  it('preserves sort_key ordering as returned by DB', async () => {
    const db = buildMockDb([
      [
        { bucket: '70–90%', sort_key: 4, count: 100 },
        { bucket: '50–70%', sort_key: 3, count: 200 },
        { bucket: '90–100%', sort_key: 5, count: 50 },
      ],
    ]);
    const result = await projection.queryFuzzyConfidenceDistribution(db as never, '24h');
    // Order matches DB output; sort_key values are preserved
    expect(result[0]?.sort_key).toBe(4);
    expect(result[1]?.sort_key).toBe(3);
    expect(result[2]?.sort_key).toBe(5);
  });

  it('handles null sort_key and count gracefully', async () => {
    const db = buildMockDb([[{ bucket: 'no_data', sort_key: null, count: null }]]);
    const result = await projection.queryFuzzyConfidenceDistribution(db as never, '7d');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ bucket: 'no_data', sort_key: 0, count: 0 });
  });
});

// ============================================================================
// queryModels tests
// ============================================================================

describe('LlmRoutingProjection.queryModels', () => {
  let projection: LlmRoutingProjection;

  beforeEach(() => {
    projection = new LlmRoutingProjection();
  });

  it('returns empty array when no rows', async () => {
    const db = buildMockDb([[]]);
    const result = await projection.queryModels(db as never);
    expect(result).toEqual([]);
  });

  it('returns model names as strings', async () => {
    const db = buildMockDb([
      [{ model: 'gpt-4o' }, { model: 'claude-3-haiku' }, { model: 'gemini-pro' }],
    ]);
    const result = await projection.queryModels(db as never);
    expect(result).toEqual(['gpt-4o', 'claude-3-haiku', 'gemini-pro']);
  });

  it('falls back to "unknown" when model column returns null', async () => {
    const db = buildMockDb([[{ model: null }, { model: 'gpt-4o' }]]);
    const result = await projection.queryModels(db as never);
    expect(result).toEqual(['unknown', 'gpt-4o']);
  });
});
