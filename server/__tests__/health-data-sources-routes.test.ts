/**
 * Tests for GET /api/health/data-sources (OMN-2307)
 *
 * These tests verify that the endpoint:
 * 1. Returns the correct shape (dataSources, summary, checkedAt)
 * 2. Reads projection snapshots correctly
 * 3. Handles missing projections gracefully (status: 'mock')
 * 4. Summarises counts correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import healthDataSourcesRoutes, { clearHealthCache } from '../health-data-sources-routes';
import { projectionService } from '../projection-bootstrap';

// ============================================================================
// Mock projection-bootstrap so we can control getView() return values
// ============================================================================

vi.mock('../projection-bootstrap', () => ({
  projectionService: {
    getView: vi.fn(),
  },
}));

// ============================================================================
// Mock storage (tryGetIntelligenceDb) for DB-based probes
// ============================================================================

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(),
}));

// ============================================================================
// Mock insight-queries (queryInsightsSummary) for the insights probe
// ============================================================================

vi.mock('../insight-queries', () => ({
  queryInsightsSummary: vi.fn(),
}));

// ============================================================================
// Mock event-bus-data-source (getEventBusDataSource) for the execution probe
// ============================================================================

vi.mock('../event-bus-data-source', () => ({
  getEventBusDataSource: vi.fn(),
}));

// ============================================================================
// Import mocks after vi.mock declarations
// ============================================================================

import { tryGetIntelligenceDb } from '../storage';
import { queryInsightsSummary } from '../insight-queries';
import { getEventBusDataSource } from '../event-bus-data-source';

// ============================================================================
// Helpers
// ============================================================================

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/health', healthDataSourcesRoutes);
  return app;
}

/** Build a minimal mock ProjectionView snapshot. */
function makeSnapshot(payload: unknown, snapshotTimeMs = Date.now()) {
  return {
    viewId: 'test',
    cursor: 0,
    snapshotTimeMs,
    payload,
  };
}

/** Return a mock view with getSnapshot() resolving to the given payload. */
function makeView(payload: unknown) {
  return {
    getSnapshot: vi.fn().mockReturnValue(makeSnapshot(payload)),
  };
}

/**
 * Build a mock Drizzle db object that returns `rows` from any `.select()` chain.
 * The chain is: db.select(...).from(...) => Promise<rows>
 */
function makeMockDb(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
  };
}

// ============================================================================
// Default mock setup helpers
// ============================================================================

/** Set up all DB-backed probes to return empty/no-data (mock status). */
function setupEmptyDb() {
  vi.mocked(tryGetIntelligenceDb).mockReturnValue(makeMockDb([{ count: 0 }]) as any);
  vi.mocked(queryInsightsSummary).mockResolvedValue({
    insights: [],
    total: 0,
    new_this_week: 0,
    avg_confidence: 0,
    total_sessions_analyzed: 0,
    by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
  });
  vi.mocked(getEventBusDataSource).mockReturnValue(null);
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/health/data-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHealthCache();
  });

  it('returns 200 with correct top-level shape', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dataSources');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('checkedAt');
    expect(typeof res.body.checkedAt).toBe('string');
  });

  it('reports status: mock when no projections are registered', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    // All projection-based sources should be mock
    const { dataSources } = res.body;
    expect(dataSources.eventBus.status).toBe('mock');
    expect(dataSources.effectiveness.status).toBe('mock');
    expect(dataSources.extraction.status).toBe('mock');
    expect(dataSources.baselines.status).toBe('mock');
    expect(dataSources.costTrends.status).toBe('mock');
    expect(dataSources.intents.status).toBe('mock');
    expect(dataSources.nodeRegistry.status).toBe('mock');
  });

  it('reports status: live for event-bus when projection has events', async () => {
    const eventBusView = makeView({ totalEventsIngested: 42, events: [] });
    const mockView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'event-bus') return eventBusView as any;
      return mockView as any;
    });
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.eventBus.status).toBe('live');
    // correlationTrace is a shallow copy of eventBus — it must also be live
    expect(res.body.dataSources.correlationTrace.status).toBe('live');
  });

  it('reports status: live for effectiveness when total_sessions > 0', async () => {
    const effectivenessView = makeView({
      summary: { total_sessions: 100 },
    });
    const noView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'effectiveness-metrics') return effectivenessView as any;
      return noView as any;
    });
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.effectiveness.status).toBe('live');
  });

  it('reports status: live for extraction when last_event_at is set', async () => {
    const extractionView = makeView({
      summary: { total_injections: 5, last_event_at: '2026-02-16T00:01:23Z' },
    });
    const noView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'extraction-metrics') return extractionView as any;
      return noView as any;
    });
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.extraction.status).toBe('live');
    expect(res.body.dataSources.extraction.lastEvent).toBe('2026-02-16T00:01:23Z');
  });

  it('reports status: live for validation when DB returns total_runs > 0', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    // validation probe queries validationRuns directly; patterns probe also calls
    // tryGetIntelligenceDb — using mockReturnValue (not Once) means both probes
    // get the same db returning count: 12, so patterns will also be 'live'.
    vi.mocked(tryGetIntelligenceDb).mockReturnValue(makeMockDb([{ count: 12 }]) as any);
    vi.mocked(queryInsightsSummary).mockResolvedValue({
      insights: [],
      total: 0,
      new_this_week: 0,
      avg_confidence: 0,
      total_sessions_analyzed: 0,
      by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
    });
    vi.mocked(getEventBusDataSource).mockReturnValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.validation.status).toBe('live');
    // patterns also receives count: 12 from the shared mockReturnValue, so it too is 'live'
    expect(res.body.dataSources.patterns.status).toBe('live');
  });

  it('reports status: error for insights when queryInsightsSummary throws', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(tryGetIntelligenceDb).mockReturnValue(makeMockDb([{ count: 0 }]) as any);
    vi.mocked(queryInsightsSummary).mockRejectedValue(new Error('DB connection failed'));
    vi.mocked(getEventBusDataSource).mockReturnValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.insights.status).toBe('error');
    expect(res.body.dataSources.insights.reason).toBe('probe_threw');
  });

  it('reports status: mock for patterns when DB returns 0 rows', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(tryGetIntelligenceDb).mockReturnValue(makeMockDb([{ count: 0 }]) as any);
    vi.mocked(queryInsightsSummary).mockResolvedValue({
      insights: [],
      total: 0,
      new_this_week: 0,
      avg_confidence: 0,
      total_sessions_analyzed: 0,
      by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
    });
    vi.mocked(getEventBusDataSource).mockReturnValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.patterns.status).toBe('mock');
    expect(res.body.dataSources.patterns.reason).toBe('empty_tables');
  });

  it('computes summary counts correctly', async () => {
    // Set up: 2 live (event-bus, validation), rest mock
    const eventBusView = makeView({ totalEventsIngested: 5 });
    const noView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'event-bus') return eventBusView as any;
      return noView as any;
    });

    // validation returns live (count > 0), patterns returns mock (count = 0).
    //
    // WHY the mockReturnValueOnce sequence is deterministic:
    //   1. JS evaluates array literals left-to-right, so the Promise.all([probeValidation(),
    //      probeInsights(), probePatterns(), ...]) call invokes probeValidation() before
    //      probePatterns() — both functions are entered (and their synchronous preamble runs)
    //      before the event-loop yields to any async continuation.
    //   2. In probeValidation(), `tryGetIntelligenceDb()` is the very first statement —
    //      it executes synchronously before the `await db.select(...)` on the next line.
    //   3. In probePatterns(), `tryGetIntelligenceDb()` is likewise the very first statement,
    //      before its own `await db.select(...)`.
    //   Therefore call #1 → probeValidation, call #2 → probePatterns, guaranteed.
    vi.mocked(tryGetIntelligenceDb)
      .mockReturnValueOnce(makeMockDb([{ count: 5 }]) as any) // probeValidation → live
      .mockReturnValueOnce(makeMockDb([{ count: 0 }]) as any); // probePatterns → mock
    vi.mocked(queryInsightsSummary).mockResolvedValue({
      insights: [],
      total: 0,
      new_this_week: 0,
      avg_confidence: 0,
      total_sessions_analyzed: 0,
      by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
    });
    vi.mocked(getEventBusDataSource).mockReturnValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    const { summary } = res.body;
    // summary.live >= 2 (event-bus + validation + correlationTrace mirrors event-bus)
    expect(summary.live).toBeGreaterThanOrEqual(2);
    expect(summary.live + summary.mock + summary.error).toBe(13); // 13 total sources
  });

  it('includes all 13 expected data sources', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    const keys = Object.keys(res.body.dataSources);
    const expectedKeys = [
      'eventBus',
      'effectiveness',
      'extraction',
      'baselines',
      'costTrends',
      'intents',
      'nodeRegistry',
      'correlationTrace',
      'validation',
      'insights',
      'patterns',
      'executionGraph',
      'enforcement',
    ];
    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }
    expect(keys.length).toBe(13);
  });

  it('returns status: mock with reason for empty baselines projection', async () => {
    const baselinesView = makeView({
      summary: { total_comparisons: 0 },
    });
    const noView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'baselines') return baselinesView as any;
      return noView as any;
    });
    setupEmptyDb();

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.baselines.status).toBe('mock');
    expect(res.body.dataSources.baselines.reason).toBe('empty_tables');
  });
});
