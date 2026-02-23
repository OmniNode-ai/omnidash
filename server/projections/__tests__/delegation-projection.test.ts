/**
 * DelegationProjection Tests (OMN-2650)
 *
 * Exercises the DelegationProjection class with mocked DB to verify:
 * 1. emptyPayload returns zeros
 * 2. ensureFreshForWindow rejects invalid windows
 * 3. ensureFreshForWindow returns empty when DB is null
 * 4. querySnapshot builds correct summary from DB rows
 * 5. byTaskType grouping and rate calculation
 * 6. shadow-divergence endpoint returns empty array (per API contract)
 * 7. trend data is assembled correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationProjection } from '../delegation-projection';

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
// Call-order mock DB builder
// ============================================================================

/**
 * Build a mock DB that returns results in order of db.execute() invocations.
 *
 * The DelegationProjection._queryForWindow uses Promise.all to run 6 queries
 * concurrently. Within _querySummary, there are 4 sequential db.execute()
 * calls. Due to Node.js microtask scheduling with Promise.all:
 *
 * Call order observed:
 *   0: _querySummary delegation_events aggregate
 *   1: _queryByTaskType (first to resolve from Promise.all after summary's first await)
 *   2: _queryCostSavings
 *   3: _queryQualityGates
 *   4: _queryShadowDivergence
 *   5: _queryTrend
 *   6: _querySummary shadow comparisons (resumes after all single-call queries start)
 *   7: _querySummary agent_actions count
 *   8: _querySummary quality gate trend
 *
 * To avoid depending on this fragile ordering, we use the simpler approach
 * of making all queries return the same data-rich rows. The projection code
 * only maps specific columns from each query, so irrelevant columns are ignored.
 */
function buildOrderedMockDb(results: Record<string, unknown>[][]) {
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

describe('DelegationProjection', () => {
  let projection: DelegationProjection;

  beforeEach(() => {
    projection = new DelegationProjection();
    mockTryGet.mockReturnValue(null);
  });

  // --------------------------------------------------------------------------
  // 1. emptyPayload
  // --------------------------------------------------------------------------

  it('should return zeros from getSnapshot when DB is unavailable', () => {
    const snapshot = projection.getSnapshot();
    expect(snapshot.payload.summary.total_delegations).toBe(0);
    expect(snapshot.payload.summary.delegation_rate).toBe(0);
    expect(snapshot.payload.summary.quality_gate_pass_rate).toBe(0);
    expect(snapshot.payload.summary.counts.total).toBe(0);
    expect(snapshot.payload.byTaskType).toEqual([]);
    expect(snapshot.payload.costSavings).toEqual([]);
    expect(snapshot.payload.qualityGates).toEqual([]);
    expect(snapshot.payload.shadowDivergence).toEqual([]);
    expect(snapshot.payload.trend).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 2. Invalid window rejection
  // --------------------------------------------------------------------------

  it('should throw for invalid window in ensureFreshForWindow', async () => {
    await expect(projection.ensureFreshForWindow('1h')).rejects.toThrow(
      'invalid window "1h"'
    );
    await expect(projection.ensureFreshForWindow('90d')).rejects.toThrow(
      'invalid window "90d"'
    );
  });

  // --------------------------------------------------------------------------
  // 3. ensureFreshForWindow returns empty when DB is null
  // --------------------------------------------------------------------------

  it('should return emptyPayload when DB is unavailable', async () => {
    mockTryGet.mockReturnValue(null);
    const payload = await projection.ensureFreshForWindow('7d');
    expect(payload.summary.total_delegations).toBe(0);
    expect(payload.byTaskType).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 4. Summary from DB rows -- using forceRefresh which calls querySnapshot
  // --------------------------------------------------------------------------

  it('should compute summary correctly', async () => {
    // We'll test _querySummary by creating a fresh projection and calling
    // ensureFreshForWindow. We set up the mock to handle the interleaved calls.
    // Rather than guess the exact interleaving order, provide enough rows
    // for every call (20 slots). The key insight is that _querySummary makes
    // 4 sequential execute() calls and the other 5 are single-call queries
    // from Promise.all.

    // Approach: provide a generous array where summary-related rows are at
    // expected positions and the rest return empty.
    const allResults: Record<string, unknown>[][] = [];
    // Fill 20 slots with empty
    for (let i = 0; i < 20; i++) allResults.push([]);

    // _querySummary call 1: delegation aggregate (always first due to sequential)
    allResults[0] = [{ total: 10, qg_passed: 8, qg_failed: 2, total_cost_savings: '50.00', avg_cost_savings: '5.00', avg_latency: 150 }];

    // After the first await in _querySummary, the remaining 5 Promise.all
    // queries that each make one execute() call will interleave. The exact
    // order depends on microtask scheduling. Let's trace it:
    // Promise.all starts: _querySummary, _queryByTaskType, _queryCostSavings,
    //   _queryQualityGates, _queryShadowDivergence, _queryTrend
    // All 6 start concurrently. Each calls db.execute() immediately.
    // _querySummary's first execute() resolves -> calls 1-5 haven't started
    // yet because they're async functions that start with db.execute().
    // Actually with Promise.all, all 6 async functions start executing
    // synchronously up to their first await.
    //
    // So the call order is:
    // 0: _querySummary's 1st execute (delegation agg)
    // 1: _queryByTaskType's execute
    // 2: _queryCostSavings's execute
    // 3: _queryQualityGates's execute
    // 4: _queryShadowDivergence's execute
    // 5: _queryTrend's execute
    // Then after all resolve (microtask queue), _querySummary resumes:
    // 6: _querySummary's 2nd execute (shadow agg)
    // 7: _querySummary's 3rd execute (action count)
    // 8: _querySummary's 4th execute (qg trend)

    allResults[1] = []; // byTaskType
    allResults[2] = []; // costSavings
    allResults[3] = []; // qualityGates
    allResults[4] = []; // shadowDivergence
    allResults[5] = []; // trend
    allResults[6] = [{ total_shadow: 4, diverged: 1, agreed: 3 }]; // summary shadow
    allResults[7] = [{ action_count: 100 }]; // summary action count
    allResults[8] = [{ date: '2026-02-20', value: 0.8 }]; // summary qg trend

    const db = buildOrderedMockDb(allResults);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFreshForWindow('7d');

    expect(payload.summary.total_delegations).toBe(10);
    expect(payload.summary.delegation_rate).toBe(0.1); // 10/100
    expect(payload.summary.quality_gate_pass_rate).toBe(0.8); // 8/10
    expect(payload.summary.total_cost_savings_usd).toBe(50);
    expect(payload.summary.avg_cost_savings_usd).toBe(5);
    expect(payload.summary.shadow_divergence_rate).toBe(0.25); // 1/4
    expect(payload.summary.total_shadow_comparisons).toBe(4);
    expect(payload.summary.avg_delegation_latency_ms).toBe(150);
    expect(payload.summary.counts.quality_gate_passed).toBe(8);
    expect(payload.summary.counts.quality_gate_failed).toBe(2);
    expect(payload.summary.counts.shadow_diverged).toBe(1);
    expect(payload.summary.counts.shadow_agreed).toBe(3);
    expect(payload.summary.quality_gate_trend).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // 5. byTaskType grouping and rate calculation
  // --------------------------------------------------------------------------

  it('should compute byTaskType with correct pass rates', async () => {
    const allResults: Record<string, unknown>[][] = [];
    for (let i = 0; i < 20; i++) allResults.push([]);

    // summary delegation agg
    allResults[0] = [{ total: 5, qg_passed: 4, qg_failed: 1, total_cost_savings: '20.00', avg_cost_savings: '4.00', avg_latency: 100 }];
    // byTaskType (index 1 in Promise.all interleave)
    allResults[1] = [
      { task_type: 'code-review', total: 3, qg_passed: 2, total_cost_savings: '12.00', avg_cost_savings: '4.00', avg_latency: 100, shadow_divergences: 0 },
      { task_type: 'refactor', total: 2, qg_passed: 2, total_cost_savings: '8.00', avg_cost_savings: '4.00', avg_latency: 120, shadow_divergences: 1 },
    ];
    // summary shadow (index 6)
    allResults[6] = [{ total_shadow: 0, diverged: 0, agreed: 0 }];
    // summary action count (index 7)
    allResults[7] = [{ action_count: 50 }];

    const db = buildOrderedMockDb(allResults);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFreshForWindow('7d');

    expect(payload.byTaskType).toHaveLength(2);
    expect(payload.byTaskType[0].task_type).toBe('code-review');
    expect(payload.byTaskType[0].quality_gate_pass_rate).toBeCloseTo(0.6667, 3);
    expect(payload.byTaskType[1].task_type).toBe('refactor');
    expect(payload.byTaskType[1].quality_gate_pass_rate).toBe(1);
    expect(payload.byTaskType[1].shadow_divergences).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 6. Shadow divergence returns empty per API contract
  // --------------------------------------------------------------------------

  it('should return empty array for shadowDivergence when no divergent data', async () => {
    const allResults: Record<string, unknown>[][] = [];
    for (let i = 0; i < 20; i++) allResults.push([]);

    allResults[0] = [{ total: 0, qg_passed: 0, qg_failed: 0, total_cost_savings: '0', avg_cost_savings: '0', avg_latency: 0 }];
    allResults[6] = [{ total_shadow: 0, diverged: 0, agreed: 0 }];
    allResults[7] = [{ action_count: 0 }];

    const db = buildOrderedMockDb(allResults);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFreshForWindow('24h');
    expect(payload.shadowDivergence).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 7. Trend data assembly
  // --------------------------------------------------------------------------

  it('should assemble trend data correctly', async () => {
    const allResults: Record<string, unknown>[][] = [];
    for (let i = 0; i < 20; i++) allResults.push([]);

    allResults[0] = [{ total: 4, qg_passed: 3, qg_failed: 1, total_cost_savings: '10.00', avg_cost_savings: '2.50', avg_latency: 80 }];
    // trend (index 5)
    allResults[5] = [
      { bucket: '2026-02-20', qg_pass_rate: 0.75, shadow_divergence_rate: 0.5, cost_savings_usd: '5.00', total_delegations: 2 },
      { bucket: '2026-02-21', qg_pass_rate: 1.0, shadow_divergence_rate: 0, cost_savings_usd: '5.00', total_delegations: 2 },
    ];
    allResults[6] = [{ total_shadow: 2, diverged: 1, agreed: 1 }];
    allResults[7] = [{ action_count: 20 }];

    const db = buildOrderedMockDb(allResults);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFreshForWindow('7d');

    expect(payload.trend).toHaveLength(2);
    expect(payload.trend[0].quality_gate_pass_rate).toBe(0.75);
    expect(payload.trend[0].shadow_divergence_rate).toBe(0.5);
    expect(payload.trend[0].total_delegations).toBe(2);
    expect(payload.trend[1].quality_gate_pass_rate).toBe(1.0);
    expect(payload.trend[1].cost_savings_usd).toBe(5);
  });
});
