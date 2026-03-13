/**
 * Cold-cache race condition tests (OMN-4965)
 *
 * Verifies that EffectivenessMetricsProjection and ExtractionMetricsProjection
 * are subclasses of DbBackedProjectionView and thus automatically registered
 * in the warmAll() startup sequence (OMN-4958).
 *
 * Background: Before OMN-4958, the first API call after a restart would get
 * emptyPayload() from these projections because no cache existed yet. The
 * warmAll() mechanism now forces an eager DB query at startup, but this test
 * verifies the inheritance chain that makes it work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage before importing projections
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};

vi.mock('../../storage', () => ({
  tryGetIntelligenceDb: () => mockDb,
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// Mock drizzle-orm operators used by projections
vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      _tag: 'sql',
      toString: () => strings.join('?'),
    }),
    {
      raw: (s: string) => ({ _tag: 'sql-raw', value: s }),
      join: (...args: unknown[]) => ({ _tag: 'sql-join', args }),
    }
  ),
  desc: vi.fn((col) => col),
  gte: vi.fn(() => true),
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn(() => true),
}));

// Mock the intelligence schema tables
vi.mock('@shared/intelligence-schema', () => ({
  injectionEffectiveness: {
    cohort: 'cohort',
    injectionOccurred: 'injection_occurred',
    utilizationScore: 'utilization_score',
    utilizationMethod: 'utilization_method',
    agentMatchScore: 'agent_match_score',
    userVisibleLatencyMs: 'user_visible_latency_ms',
    sessionId: 'session_id',
    agentName: 'agent_name',
    detectionMethod: 'detection_method',
    createdAt: 'created_at',
    sessionOutcome: 'session_outcome',
  },
  latencyBreakdowns: {
    cohort: 'cohort',
    userVisibleLatencyMs: 'user_visible_latency_ms',
    routingTimeMs: 'routing_time_ms',
    retrievalTimeMs: 'retrieval_time_ms',
    injectionTimeMs: 'injection_time_ms',
    cacheHit: 'cache_hit',
    createdAt: 'created_at',
    sessionId: 'session_id',
    promptId: 'prompt_id',
  },
  patternHitRates: {
    patternId: 'pattern_id',
    utilizationScore: 'utilization_score',
    createdAt: 'created_at',
  },
}));

import { DbBackedProjectionView } from '../db-backed-projection-view';
import { EffectivenessMetricsProjection } from '../effectiveness-metrics-projection';
import { ExtractionMetricsProjection } from '../extraction-metrics-projection';

describe('OMN-4965: Cold-cache race prevention', () => {
  beforeEach(() => {
    DbBackedProjectionView.resetInstances();
    // Reset mock return values
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.groupBy.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.execute.mockResolvedValue({
      rows: [
        {
          total_injections: 0,
          total_patterns_matched: 0,
          avg_utilization_score: null,
          avg_latency_ms: null,
          success_count: 0,
          total_with_outcome: 0,
          last_event_at: null,
        },
      ],
    });
  });

  it('EffectivenessMetricsProjection extends DbBackedProjectionView', () => {
    const projection = new EffectivenessMetricsProjection();
    expect(projection).toBeInstanceOf(DbBackedProjectionView);
  });

  it('ExtractionMetricsProjection extends DbBackedProjectionView', () => {
    const projection = new ExtractionMetricsProjection();
    expect(projection).toBeInstanceOf(DbBackedProjectionView);
  });

  it('both projections auto-register for warmAll()', async () => {
    const effectiveness = new EffectivenessMetricsProjection();
    const extraction = new ExtractionMetricsProjection();

    // warmAll should process both without throwing
    await expect(DbBackedProjectionView.warmAll()).resolves.toBeUndefined();

    // After warm-up, getSnapshot should return non-empty payloads
    // (they will have real structure even if data is zeros/nulls)
    const effSnap = effectiveness.getSnapshot();
    expect(effSnap.viewId).toBe('effectiveness-metrics');
    expect(effSnap.payload).toBeDefined();
    expect(effSnap.payload).toHaveProperty('summary');
    expect(effSnap.payload).toHaveProperty('throttle');

    const extSnap = extraction.getSnapshot();
    expect(extSnap.viewId).toBe('extraction-metrics');
    expect(extSnap.payload).toBeDefined();
    expect(extSnap.payload).toHaveProperty('summary');
    expect(extSnap.payload).toHaveProperty('pipelineHealth');
  });

  it('returns emptyPayload before warmAll (confirming the cold-cache bug existed)', () => {
    const effectiveness = new EffectivenessMetricsProjection();

    // Before warm-up, the projection has no cache and returns emptyPayload
    const snap = effectiveness.getSnapshot();
    expect(snap.payload.summary.total_sessions).toBe(0);
    expect(snap.payload.ab.cohorts).toEqual([]);
  });
});
