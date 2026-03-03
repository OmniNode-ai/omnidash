/**
 * Unit tests for new llm-routing-routes endpoints (OMN-3447)
 *
 * Tests:
 *   GET /api/llm-routing/fuzzy-confidence?window=7d
 *     - returns fuzzy confidence buckets from projection
 *     - returns 400 on invalid window
 *   GET /api/llm-routing/models
 *     - returns model list from projection
 *     - returns 500 on projection error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// ---------------------------------------------------------------------------
// Mock projection-bootstrap
// ---------------------------------------------------------------------------

const mockEnsureFresh = vi.fn();
const mockEnsureFreshForWindow = vi.fn();

vi.mock('../projection-bootstrap', () => ({
  llmRoutingProjection: {
    viewId: 'llm-routing',
    ensureFresh: (...args: unknown[]) => mockEnsureFresh(...args),
    ensureFreshForWindow: (...args: unknown[]) => mockEnsureFreshForWindow(...args),
    forceRefresh: vi.fn(),
    getSnapshot: vi.fn(),
    getEventsSince: vi.fn(),
    applyEvent: vi.fn(() => false),
    reset: vi.fn(),
    invalidateCache: vi.fn(),
  },
  projectionService: {
    register: vi.fn(),
    get: vi.fn(),
  },
}));

import llmRoutingRoutes from '../llm-routing-routes';

// ---------------------------------------------------------------------------
// Base payload for a default projection result
// ---------------------------------------------------------------------------

function basePayload() {
  return {
    summary: {
      total_decisions: 0,
      agreement_rate: 0,
      fallback_rate: 0,
      avg_cost_usd: 0,
      llm_p50_latency_ms: 0,
      llm_p95_latency_ms: 0,
      fuzzy_p50_latency_ms: 0,
      fuzzy_p95_latency_ms: 0,
      counts: { total: 0, agreed: 0, disagreed: 0, fallback: 0 },
      agreement_rate_trend: [],
    },
    latency: [],
    byVersion: [],
    byModel: [],
    disagreements: [],
    trend: [],
    fuzzyConfidence: [],
    models: [],
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('llm-routing-routes OMN-3447 endpoints', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/llm-routing', llmRoutingRoutes);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /api/llm-routing/fuzzy-confidence
  // -------------------------------------------------------------------------

  describe('GET /api/llm-routing/fuzzy-confidence', () => {
    it('returns fuzzy confidence buckets for default 7d window', async () => {
      const buckets = [
        { bucket: 'no_data', sort_key: 0, count: 5 },
        { bucket: '70–90%', sort_key: 4, count: 42 },
      ];
      mockEnsureFresh.mockResolvedValue({ ...basePayload(), fuzzyConfidence: buckets });

      const res = await request(app).get('/api/llm-routing/fuzzy-confidence');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(buckets);
    });

    it('returns fuzzy confidence buckets for 24h window via ensureFreshForWindow', async () => {
      const buckets = [{ bucket: '90–100%', sort_key: 5, count: 20 }];
      mockEnsureFreshForWindow.mockResolvedValue({ ...basePayload(), fuzzyConfidence: buckets });

      const res = await request(app).get('/api/llm-routing/fuzzy-confidence?window=24h');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(buckets);
      expect(mockEnsureFreshForWindow).toHaveBeenCalledWith('24h');
    });

    it('returns 400 for invalid window parameter', async () => {
      const res = await request(app).get('/api/llm-routing/fuzzy-confidence?window=99d');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 500 when projection throws', async () => {
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/llm-routing/fuzzy-confidence');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/llm-routing/models
  // -------------------------------------------------------------------------

  describe('GET /api/llm-routing/models', () => {
    it('returns model list from projection', async () => {
      const models = ['gpt-4o', 'claude-3-haiku', 'gemini-pro'];
      mockEnsureFresh.mockResolvedValue({ ...basePayload(), models });

      const res = await request(app).get('/api/llm-routing/models');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(models);
    });

    it('returns empty array when no models', async () => {
      mockEnsureFresh.mockResolvedValue({ ...basePayload(), models: [] });

      const res = await request(app).get('/api/llm-routing/models');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 when projection throws', async () => {
      mockEnsureFresh.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/llm-routing/models');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });
});
