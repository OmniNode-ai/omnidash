/**
 * Cost Routes Tests (OMN-2300)
 *
 * Exercises the /api/costs endpoints (summary, trend, by-model, by-repo,
 * by-pattern, token-usage, alerts) by mocking the CostMetricsProjection view.
 *
 * The routes access data through projectionService.getView() rather than
 * direct DB queries. Tests mock the projection's ensureFresh() and
 * ensureFreshForWindow() to return specific payloads without hitting the DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import type { CostMetricsPayload } from '../projections/cost-metrics-projection';

// ---------------------------------------------------------------------------
// Mock projection service
// ---------------------------------------------------------------------------

// vi.hoisted() ensures this runs before vi.mock() factory execution
const { mockEnsureFresh, mockEnsureFreshForWindow } = vi.hoisted(() => ({
  mockEnsureFresh: vi.fn(),
  mockEnsureFreshForWindow: vi.fn(),
}));

vi.mock('../projection-bootstrap', () => {
  const mockView = {
    viewId: 'cost-metrics',
    ensureFresh: mockEnsureFresh,
    ensureFreshForWindow: mockEnsureFreshForWindow,
    forceRefresh: mockEnsureFresh,
    getSnapshot: vi.fn(),
    getEventsSince: vi.fn(),
    applyEvent: vi.fn(() => false),
    reset: vi.fn(),
    // Public query methods (for completeness)
    querySummary: vi.fn(),
    queryTrend: vi.fn(),
    queryByModel: vi.fn(),
    queryByRepo: vi.fn(),
    queryByPattern: vi.fn(),
    queryTokenUsage: vi.fn(),
  };

  return {
    projectionService: {
      getView: vi.fn((viewId: string) => {
        if (viewId === 'cost-metrics') return mockView;
        return undefined;
      }),
      viewIds: ['cost-metrics'],
      registerView: vi.fn(),
      unregisterView: vi.fn(),
      on: vi.fn(),
      emit: vi.fn(),
    },
    eventBusProjection: { viewId: 'event-bus' },
    extractionMetricsProjection: { viewId: 'extraction-metrics' },
    effectivenessMetricsProjection: { viewId: 'effectiveness-metrics' },
    costMetricsProjection: mockView,
    wireProjectionSources: vi.fn(() => () => {}),
  };
});

// Also mock storage to prevent DB connection attempts during import
vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(() => null),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPayload(): CostMetricsPayload {
  return {
    summary: {
      total_cost_usd: 0,
      reported_cost_usd: 0,
      estimated_cost_usd: 0,
      reported_coverage_pct: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      session_count: 0,
      model_count: 0,
      avg_cost_per_session: 0,
      cost_change_pct: 0,
      active_alerts: 0,
    },
    trend: [],
    byModel: [],
    byRepo: [],
    byPattern: [],
    tokenUsage: [],
  };
}

function makePayload(overrides: Partial<CostMetricsPayload> = {}): CostMetricsPayload {
  return { ...emptyPayload(), ...overrides };
}

// ---------------------------------------------------------------------------
// Import routes AFTER mocks are set up
// ---------------------------------------------------------------------------

import costRoutes from '../cost-routes';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Cost Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureFresh.mockResolvedValue(emptyPayload());
    mockEnsureFreshForWindow.mockResolvedValue(emptyPayload());

    app = express();
    app.use(express.json());
    app.use('/api/costs', costRoutes);
  });

  // =========================================================================
  // GET /api/costs/summary
  // =========================================================================

  describe('GET /api/costs/summary', () => {
    it('should return empty summary when view returns empty payload', async () => {
      const res = await request(app).get('/api/costs/summary').expect(200);

      expect(res.body.total_cost_usd).toBe(0);
      expect(res.body.reported_cost_usd).toBe(0);
      expect(res.body.estimated_cost_usd).toBe(0);
      expect(res.body.session_count).toBe(0);
      expect(res.body.model_count).toBe(0);
      expect(res.body.active_alerts).toBe(0);
    });

    it('should return summary data from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          summary: {
            total_cost_usd: 42.5,
            reported_cost_usd: 38.0,
            estimated_cost_usd: 4.5,
            reported_coverage_pct: 89.4,
            total_tokens: 500000,
            prompt_tokens: 300000,
            completion_tokens: 200000,
            session_count: 120,
            model_count: 3,
            avg_cost_per_session: 0.354,
            cost_change_pct: -12.5,
            active_alerts: 1,
          },
        })
      );

      const res = await request(app).get('/api/costs/summary').expect(200);

      expect(res.body.total_cost_usd).toBeCloseTo(42.5);
      expect(res.body.reported_cost_usd).toBeCloseTo(38.0);
      expect(res.body.session_count).toBe(120);
      expect(res.body.model_count).toBe(3);
      expect(res.body.active_alerts).toBe(1);
      expect(res.body.cost_change_pct).toBeCloseTo(-12.5);
    });

    it('should use ensureFreshForWindow for window=24h', async () => {
      mockEnsureFreshForWindow.mockResolvedValue(
        makePayload({
          summary: {
            total_cost_usd: 5.0,
            reported_cost_usd: 5.0,
            estimated_cost_usd: 0,
            reported_coverage_pct: 100,
            total_tokens: 50000,
            prompt_tokens: 30000,
            completion_tokens: 20000,
            session_count: 10,
            model_count: 2,
            avg_cost_per_session: 0.5,
            cost_change_pct: 0,
            active_alerts: 0,
          },
        })
      );

      const res = await request(app).get('/api/costs/summary?window=24h').expect(200);

      expect(mockEnsureFreshForWindow).toHaveBeenCalledWith('24h');
      expect(mockEnsureFresh).not.toHaveBeenCalled();
      expect(res.body.total_cost_usd).toBeCloseTo(5.0);
    });

    it('should use ensureFreshForWindow for window=30d', async () => {
      mockEnsureFreshForWindow.mockResolvedValue(emptyPayload());

      await request(app).get('/api/costs/summary?window=30d').expect(200);

      expect(mockEnsureFreshForWindow).toHaveBeenCalledWith('30d');
    });

    it('should use ensureFresh for default window=7d', async () => {
      await request(app).get('/api/costs/summary?window=7d').expect(200);

      expect(mockEnsureFresh).toHaveBeenCalled();
      expect(mockEnsureFreshForWindow).not.toHaveBeenCalled();
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB connection lost'));

      const res = await request(app).get('/api/costs/summary').expect(500);

      expect(res.body.error).toBe('Failed to fetch cost summary');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/trend
  // =========================================================================

  describe('GET /api/costs/trend', () => {
    it('should return empty trend with empty data', async () => {
      const res = await request(app).get('/api/costs/trend').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return trend data points', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          trend: [
            {
              timestamp: '2026-02-10 00:00:00+00',
              total_cost_usd: 6.25,
              reported_cost_usd: 6.0,
              estimated_cost_usd: 0.25,
              session_count: 15,
            },
            {
              timestamp: '2026-02-11 00:00:00+00',
              total_cost_usd: 8.1,
              reported_cost_usd: 8.1,
              estimated_cost_usd: 0,
              session_count: 20,
            },
          ],
        })
      );

      const res = await request(app).get('/api/costs/trend').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].total_cost_usd).toBeCloseTo(6.25);
      expect(res.body[1].session_count).toBe(20);
    });

    it('should use ensureFreshForWindow for window=24h', async () => {
      mockEnsureFreshForWindow.mockResolvedValue(makePayload({ trend: [] }));

      await request(app).get('/api/costs/trend?window=24h').expect(200);

      expect(mockEnsureFreshForWindow).toHaveBeenCalledWith('24h');
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/trend').expect(500);

      expect(res.body.error).toBe('Failed to fetch cost trend');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/by-model
  // =========================================================================

  describe('GET /api/costs/by-model', () => {
    it('should return empty array with empty data', async () => {
      const res = await request(app).get('/api/costs/by-model').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return model breakdown from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          byModel: [
            {
              model_name: 'claude-sonnet-4-6',
              total_cost_usd: 25.0,
              reported_cost_usd: 25.0,
              estimated_cost_usd: 0,
              total_tokens: 250000,
              prompt_tokens: 150000,
              completion_tokens: 100000,
              request_count: 80,
              usage_source: 'API',
            },
            {
              model_name: 'gpt-4',
              total_cost_usd: 17.5,
              reported_cost_usd: 17.5,
              estimated_cost_usd: 0,
              total_tokens: 100000,
              prompt_tokens: 60000,
              completion_tokens: 40000,
              request_count: 40,
              usage_source: 'API',
            },
          ],
        })
      );

      const res = await request(app).get('/api/costs/by-model').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].model_name).toBe('claude-sonnet-4-6');
      expect(res.body[0].total_cost_usd).toBeCloseTo(25.0);
      expect(res.body[1].model_name).toBe('gpt-4');
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/by-model').expect(500);

      expect(res.body.error).toBe('Failed to fetch cost by model');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/by-repo
  // =========================================================================

  describe('GET /api/costs/by-repo', () => {
    it('should return empty array with empty data', async () => {
      const res = await request(app).get('/api/costs/by-repo').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return repo breakdown from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          byRepo: [
            {
              repo_name: 'my-repo',
              total_cost_usd: 18.0,
              reported_cost_usd: 18.0,
              estimated_cost_usd: 0,
              total_tokens: 180000,
              session_count: 45,
              usage_source: 'API',
            },
          ],
        })
      );

      const res = await request(app).get('/api/costs/by-repo').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].repo_name).toBe('my-repo');
      expect(res.body[0].session_count).toBe(45);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/by-repo').expect(500);

      expect(res.body.error).toBe('Failed to fetch cost by repo');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/by-pattern
  // =========================================================================

  describe('GET /api/costs/by-pattern', () => {
    it('should return empty array with empty data', async () => {
      const res = await request(app).get('/api/costs/by-pattern').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return pattern breakdown from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          byPattern: [
            {
              pattern_id: 'P001',
              pattern_name: 'ONEX Node Pattern',
              total_cost_usd: 12.0,
              reported_cost_usd: 12.0,
              estimated_cost_usd: 0,
              prompt_tokens: 80000,
              completion_tokens: 40000,
              injection_count: 60,
              avg_cost_per_injection: 0.2,
              usage_source: 'API',
            },
          ],
        })
      );

      const res = await request(app).get('/api/costs/by-pattern').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].pattern_id).toBe('P001');
      expect(res.body[0].avg_cost_per_injection).toBeCloseTo(0.2);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/by-pattern').expect(500);

      expect(res.body.error).toBe('Failed to fetch cost by pattern');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/token-usage
  // =========================================================================

  describe('GET /api/costs/token-usage', () => {
    it('should return empty array with empty data', async () => {
      const res = await request(app).get('/api/costs/token-usage').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return token usage time series', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          tokenUsage: [
            {
              timestamp: '2026-02-10 00:00:00+00',
              prompt_tokens: 150000,
              completion_tokens: 100000,
              total_tokens: 250000,
              usage_source: 'API',
            },
          ],
        })
      );

      const res = await request(app).get('/api/costs/token-usage').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].total_tokens).toBe(250000);
      expect(res.body[0].usage_source).toBe('API');
    });

    it('should use ensureFreshForWindow for window=24h', async () => {
      mockEnsureFreshForWindow.mockResolvedValue(makePayload({ tokenUsage: [] }));

      await request(app).get('/api/costs/token-usage?window=24h').expect(200);

      expect(mockEnsureFreshForWindow).toHaveBeenCalledWith('24h');
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/token-usage').expect(500);

      expect(res.body.error).toBe('Failed to fetch token usage');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/costs/alerts
  // =========================================================================

  describe('GET /api/costs/alerts', () => {
    it('should return empty array (budget alerts not yet implemented)', async () => {
      const res = await request(app).get('/api/costs/alerts').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 200 regardless of DB state', async () => {
      // alerts endpoint does not use projection at all
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/costs/alerts').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // =========================================================================
  // Graceful degradation — projection view unavailable
  //
  // When projectionService.getView('cost-metrics') returns undefined (e.g.
  // the view has not been registered yet during startup), every cost endpoint
  // should fall back to a hardcoded zero/empty response rather than throwing.
  // =========================================================================

  describe('graceful degradation when cost-metrics view is unavailable', () => {
    // Re-import projection-bootstrap mock so we can override getView locally
    // for this describe block without affecting other suites.
    let getViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      // Dynamically import the (already mocked) projection-bootstrap module
      // and override getView to return undefined for every call.
      const bootstrap = await import('../projection-bootstrap');
      getViewSpy = vi.spyOn(bootstrap.projectionService, 'getView').mockReturnValue(undefined);
    });

    afterEach(() => {
      getViewSpy.mockRestore();
    });

    it('GET /api/costs/summary returns 200 with all-zero payload', async () => {
      const res = await request(app).get('/api/costs/summary').expect(200);

      expect(res.body.total_cost_usd).toBe(0);
      expect(res.body.reported_cost_usd).toBe(0);
      expect(res.body.estimated_cost_usd).toBe(0);
      expect(res.body.reported_coverage_pct).toBe(0);
      expect(res.body.total_tokens).toBe(0);
      expect(res.body.prompt_tokens).toBe(0);
      expect(res.body.completion_tokens).toBe(0);
      expect(res.body.session_count).toBe(0);
      expect(res.body.model_count).toBe(0);
      expect(res.body.avg_cost_per_session).toBe(0);
      expect(res.body.cost_change_pct).toBe(0);
      expect(res.body.active_alerts).toBe(0);
    });

    it('GET /api/costs/trend returns 200 with empty array', async () => {
      const res = await request(app).get('/api/costs/trend').expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
