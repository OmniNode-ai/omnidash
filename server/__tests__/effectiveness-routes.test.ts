/**
 * Effectiveness Routes Tests (OMN-2325)
 *
 * Exercises the /api/effectiveness endpoints (summary, throttle, latency,
 * utilization, ab, trend) by mocking the EffectivenessMetricsProjection view.
 *
 * The routes now access data through projectionService.getView() rather than
 * direct DB queries. Tests mock the projection's ensureFresh() to return
 * specific payloads without hitting the database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import type { EffectivenessMetricsPayload } from '../projections/effectiveness-metrics-projection';

// ---------------------------------------------------------------------------
// Mock projection service
// ---------------------------------------------------------------------------

// vi.hoisted() ensures this runs before vi.mock() factory execution
const { mockEnsureFresh } = vi.hoisted(() => ({
  mockEnsureFresh: vi.fn(),
}));

vi.mock('../projection-bootstrap', () => {
  const mockView = {
    viewId: 'effectiveness-metrics',
    ensureFresh: mockEnsureFresh,
    forceRefresh: mockEnsureFresh,
    getSnapshot: vi.fn(),
    getEventsSince: vi.fn(),
    applyEvent: vi.fn(() => false),
    reset: vi.fn(),
  };

  return {
    projectionService: {
      getView: vi.fn((viewId: string) => {
        if (viewId === 'effectiveness-metrics') return mockView;
        return undefined;
      }),
      viewIds: ['effectiveness-metrics'],
      registerView: vi.fn(),
      unregisterView: vi.fn(),
      on: vi.fn(),
      emit: vi.fn(),
    },
    eventBusProjection: { viewId: 'event-bus' },
    extractionMetricsProjection: { viewId: 'extraction-metrics' },
    effectivenessMetricsProjection: mockView,
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

function emptyPayload(): EffectivenessMetricsPayload {
  return {
    summary: {
      injection_rate: 0,
      injection_rate_target: 0.8,
      median_utilization: 0,
      utilization_target: 0.6,
      mean_agent_accuracy: 0,
      accuracy_target: 0.8,
      latency_delta_p95_ms: 0,
      latency_delta_target_ms: 150,
      total_sessions: 0,
      treatment_sessions: 0,
      control_sessions: 0,
      throttle_active: false,
      throttle_reason: null,
    },
    throttle: {
      active: false,
      reason: null,
      latency_delta_p95_1h: null,
      median_utilization_1h: null,
      injected_sessions_1h: 0,
      window_start: null,
    },
    latency: {
      breakdowns: [],
      trend: [],
      cache: { hit_rate: 0, total_hits: 0, total_misses: 0 },
    },
    utilization: {
      histogram: [],
      by_method: [],
      pattern_rates: [],
      low_utilization_sessions: [],
    },
    ab: { cohorts: [], total_sessions: 0 },
    trend: [],
  };
}

function makePayload(
  overrides: Partial<EffectivenessMetricsPayload> = {}
): EffectivenessMetricsPayload {
  return { ...emptyPayload(), ...overrides };
}

// ---------------------------------------------------------------------------
// Import routes AFTER mocks are set up
// ---------------------------------------------------------------------------

import effectivenessRoutes from '../effectiveness-routes';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Effectiveness Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureFresh.mockResolvedValue(emptyPayload());

    app = express();
    app.use(express.json());
    app.use('/api/effectiveness', effectivenessRoutes);
  });

  // =========================================================================
  // GET /api/effectiveness/summary
  // =========================================================================

  describe('GET /api/effectiveness/summary', () => {
    it('should return empty summary when view returns empty payload', async () => {
      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBe(0);
      expect(res.body.total_sessions).toBe(0);
      expect(res.body.treatment_sessions).toBe(0);
      expect(res.body.control_sessions).toBe(0);
      expect(res.body.throttle_active).toBe(false);
      expect(res.body.throttle_reason).toBeNull();
      expect(res.body.injection_rate_target).toBe(0.8);
    });

    it('should return aggregated summary with real data', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          summary: {
            injection_rate: 0.8,
            injection_rate_target: 0.8,
            median_utilization: 0.72,
            utilization_target: 0.6,
            mean_agent_accuracy: 0.85,
            accuracy_target: 0.8,
            latency_delta_p95_ms: 30,
            latency_delta_target_ms: 150,
            total_sessions: 200,
            treatment_sessions: 100,
            control_sessions: 100,
            throttle_active: false,
            throttle_reason: null,
          },
        })
      );

      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBeCloseTo(0.8);
      expect(res.body.median_utilization).toBeCloseTo(0.72);
      expect(res.body.mean_agent_accuracy).toBeCloseTo(0.85);
      expect(res.body.latency_delta_p95_ms).toBeCloseTo(30);
      expect(res.body.total_sessions).toBe(200);
      expect(res.body.treatment_sessions).toBe(100);
      expect(res.body.control_sessions).toBe(100);
      expect(res.body.throttle_active).toBe(false);
    });

    it('should handle injection_rate=0 when treatment=0', async () => {
      // Default empty payload already has 0 values
      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBe(0);
      expect(res.body.median_utilization).toBe(0);
      expect(res.body.mean_agent_accuracy).toBe(0);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB connection lost'));

      const res = await request(app).get('/api/effectiveness/summary').expect(500);

      expect(res.body.error).toBe('Failed to get effectiveness summary');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/throttle
  // =========================================================================

  describe('GET /api/effectiveness/throttle', () => {
    it('should return inactive throttle with empty data', async () => {
      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(false);
      expect(res.body.reason).toBeNull();
      expect(res.body.injected_sessions_1h).toBe(0);
    });

    it('should return throttle status from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          throttle: {
            active: true,
            reason: 'P95 latency delta 250ms exceeds 200ms threshold (60 sessions in 1h)',
            latency_delta_p95_1h: 250,
            median_utilization_1h: 0.7,
            injected_sessions_1h: 60,
            window_start: '2026-02-16T12:00:00.000Z',
          },
        })
      );

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(true);
      expect(res.body.reason).toContain('P95 latency delta');
      expect(res.body.reason).toContain('250ms');
      expect(res.body.injected_sessions_1h).toBe(60);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/effectiveness/throttle').expect(500);
      expect(res.body.error).toBe('Failed to get throttle status');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/latency
  // =========================================================================

  describe('GET /api/effectiveness/latency', () => {
    it('should return empty latency details with empty data', async () => {
      const res = await request(app).get('/api/effectiveness/latency').expect(200);

      expect(res.body.breakdowns).toEqual([]);
      expect(res.body.trend).toEqual([]);
      expect(res.body.cache.hit_rate).toBe(0);
    });

    it('should return latency data from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          latency: {
            breakdowns: [
              {
                cohort: 'treatment',
                p50_ms: 80,
                p95_ms: 180,
                p99_ms: 250,
                routing_avg_ms: 20,
                retrieval_avg_ms: 40,
                injection_avg_ms: 15,
                sample_count: 100,
              },
            ],
            trend: [
              {
                date: '2026-02-15',
                treatment_p50: 80,
                treatment_p95: 180,
                control_p50: 70,
                control_p95: 150,
                delta_p95: 30,
              },
            ],
            cache: { hit_rate: 0.65, total_hits: 65, total_misses: 35 },
          },
        })
      );

      const res = await request(app).get('/api/effectiveness/latency').expect(200);

      expect(res.body.breakdowns).toHaveLength(1);
      expect(res.body.breakdowns[0].cohort).toBe('treatment');
      expect(res.body.breakdowns[0].p50_ms).toBe(80);
      expect(res.body.cache.hit_rate).toBeCloseTo(0.65);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('timeout'));

      const res = await request(app).get('/api/effectiveness/latency').expect(500);
      expect(res.body.error).toBe('Failed to get latency details');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/utilization
  // =========================================================================

  describe('GET /api/effectiveness/utilization', () => {
    it('should return empty utilization with empty data', async () => {
      const res = await request(app).get('/api/effectiveness/utilization').expect(200);

      expect(res.body.histogram).toEqual([]);
      expect(res.body.by_method).toEqual([]);
      expect(res.body.pattern_rates).toEqual([]);
      expect(res.body.low_utilization_sessions).toEqual([]);
    });

    it('should return utilization data from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          utilization: {
            histogram: [{ range_start: 0.7, range_end: 0.8, count: 45 }],
            by_method: [{ method: 'ast', median_score: 0.72, session_count: 80 }],
            pattern_rates: [{ pattern_id: 'P001', avg_utilization: 0.85, session_count: 30 }],
            low_utilization_sessions: [
              {
                session_id: 's-001',
                utilization_score: 0.1,
                agent_name: 'test-agent',
                detection_method: 'ast',
                created_at: '2026-02-16T12:00:00.000Z',
              },
            ],
          },
        })
      );

      const res = await request(app).get('/api/effectiveness/utilization').expect(200);

      expect(res.body.histogram).toHaveLength(1);
      expect(res.body.by_method).toHaveLength(1);
      expect(res.body.pattern_rates).toHaveLength(1);
      expect(res.body.low_utilization_sessions).toHaveLength(1);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/effectiveness/utilization').expect(500);
      expect(res.body.error).toBe('Failed to get utilization details');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/ab
  // =========================================================================

  describe('GET /api/effectiveness/ab', () => {
    it('should return empty AB comparison with empty data', async () => {
      const res = await request(app).get('/api/effectiveness/ab').expect(200);

      expect(res.body.cohorts).toEqual([]);
      expect(res.body.total_sessions).toBe(0);
    });

    it('should return AB data from projection', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          ab: {
            cohorts: [
              {
                cohort: 'treatment',
                session_count: 100,
                median_utilization_pct: 72,
                avg_accuracy_pct: 85,
                success_rate_pct: 90,
                avg_latency_ms: 180,
              },
              {
                cohort: 'control',
                session_count: 100,
                median_utilization_pct: 0,
                avg_accuracy_pct: 0,
                success_rate_pct: 88,
                avg_latency_ms: 150,
              },
            ],
            total_sessions: 200,
          },
        })
      );

      const res = await request(app).get('/api/effectiveness/ab').expect(200);

      expect(res.body.cohorts).toHaveLength(2);
      expect(res.body.total_sessions).toBe(200);
      expect(res.body.cohorts[0].cohort).toBe('treatment');
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/effectiveness/ab').expect(500);
      expect(res.body.error).toBe('Failed to get A/B comparison');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/trend
  // =========================================================================

  describe('GET /api/effectiveness/trend', () => {
    it('should return empty trend with empty data', async () => {
      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return trend data points', async () => {
      mockEnsureFresh.mockResolvedValue(
        makePayload({
          trend: [
            {
              date: '2026-02-05 00:00:00',
              injection_rate: 0.75,
              avg_utilization: 0.65,
              avg_accuracy: 0.82,
              avg_latency_delta_ms: 25,
            },
            {
              date: '2026-02-06 00:00:00',
              injection_rate: 0.8,
              avg_utilization: 0.7,
              avg_accuracy: 0.85,
              avg_latency_delta_ms: 20,
            },
          ],
        })
      );

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-02-05 00:00:00');
      expect(res.body[0].injection_rate).toBeCloseTo(0.75);
    });

    it('should return 500 on projection error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/effectiveness/trend').expect(500);
      expect(res.body.error).toBe('Failed to get trend');
      consoleErrorSpy.mockRestore();
    });
  });
});
