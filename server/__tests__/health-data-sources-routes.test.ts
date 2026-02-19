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
import healthDataSourcesRoutes from '../health-data-sources-routes';
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
// Mock global fetch for HTTP-probe routes
// ============================================================================

global.fetch = vi.fn();

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

/** Mock successful HTTP probe response */
function mockFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Mock a failed HTTP probe (network error) */
function mockFetchFail() {
  return Promise.reject(new Error('Network error'));
}

/** Mock a non-OK HTTP probe response */
function mockFetchNotOk(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'not found' }),
  } as Response);
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/health/data-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PORT = '3000';
  });

  it('returns 200 with correct top-level shape', async () => {
    // All projections return empty (mock) state
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

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
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

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
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.eventBus.status).toBe('live');
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
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

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
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.extraction.status).toBe('live');
    expect(res.body.dataSources.extraction.lastEvent).toBe('2026-02-16T00:01:23Z');
  });

  it('reports status: live for validation when HTTP probe returns total_runs > 0', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/validation/summary')) {
        return mockFetchOk({ total_runs: 12 });
      }
      return mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      });
    });

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.validation.status).toBe('live');
  });

  it('reports status: error for insights when HTTP probe fails', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/insights/summary')) {
        return mockFetchFail();
      }
      return mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      });
    });

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.insights.status).toBe('error');
    expect(res.body.dataSources.insights.reason).toBe('api_unavailable');
  });

  it('reports status: error for patterns when HTTP probe returns non-OK', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/intelligence/patterns/patlearn')) {
        return mockFetchNotOk(500);
      }
      return mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      });
    });

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.patterns.status).toBe('error');
    expect(res.body.dataSources.patterns.reason).toBe('http_500');
  });

  it('computes summary counts correctly', async () => {
    // Set up: 2 live (event-bus, validation), rest mock/error
    const eventBusView = makeView({ totalEventsIngested: 5 });
    const noView = { getSnapshot: vi.fn().mockReturnValue(null) };

    vi.mocked(projectionService.getView).mockImplementation((viewId: string) => {
      if (viewId === 'event-bus') return eventBusView as any;
      return noView as any;
    });

    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/validation/summary')) {
        return mockFetchOk({ total_runs: 5 });
      }
      if (urlStr.includes('/api/insights/summary')) {
        return mockFetchFail(); // error
      }
      return mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      });
    });

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    const { summary } = res.body;
    // summary.live >= 2 (event-bus + validation)
    expect(summary.live).toBeGreaterThanOrEqual(2);
    expect(summary.live + summary.mock + summary.error).toBe(13); // 13 total sources
  });

  it('includes all 13 expected data sources', async () => {
    vi.mocked(projectionService.getView).mockReturnValue(null);
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

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
    vi.mocked(global.fetch).mockImplementation(() =>
      mockFetchOk({
        total_runs: 0,
        insights: [],
        total_patterns: 0,
        nodes: [],
        total_evaluations: 0,
      })
    );

    const app = makeApp();
    const res = await request(app).get('/api/health/data-sources');

    expect(res.status).toBe(200);
    expect(res.body.dataSources.baselines.status).toBe('mock');
    expect(res.body.dataSources.baselines.reason).toBe('empty_tables');
  });
});
