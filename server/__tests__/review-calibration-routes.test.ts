/**
 * Review Calibration Routes Tests (OMN-6176)
 *
 * Exercises the /api/review-calibration endpoints (history, scores, fewshot-log)
 * by mocking the storage layer. Tests cover both happy path (data present)
 * and empty state (no DB or empty tables).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

// Chainable query builder mock
function createChainableMock(result: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  // When no limit is called (scores, fewshot-log), groupBy resolves
  // We need the terminal method to resolve. For queries without limit,
  // the last chained call should resolve.
  return chain;
}

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(() => null),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// Mock projection-bootstrap to prevent import side effects
vi.mock('../projection-bootstrap', () => ({
  projectionService: {
    getView: vi.fn(),
    viewIds: [],
    registerView: vi.fn(),
    unregisterView: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  },
  wireProjectionSources: vi.fn(() => () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: Express;

async function setupApp() {
  const routeModule = await import('../review-calibration-routes');
  app = express();
  app.use(express.json());
  app.use('/api/review-calibration', routeModule.default);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Review Calibration Routes', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // Reset tryGetIntelligenceDb to return null (no DB) by default
    const { tryGetIntelligenceDb } = await import('../storage');
    vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);
    await setupApp();
  });

  describe('GET /api/review-calibration/history', () => {
    it('returns empty runs array when DB is not configured', async () => {
      const res = await request(app).get('/api/review-calibration/history');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ runs: [] });
    });

    it('returns empty runs array when DB is configured but no data', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const chain = createChainableMock([]);
      const db = { select: vi.fn().mockReturnValue(chain) };
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(db as any);

      const res = await request(app).get('/api/review-calibration/history');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ runs: [] });
    });

    it('returns formatted runs when data exists', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const mockRuns = [
        {
          runId: 'run-1',
          groundTruthModel: 'claude-opus',
          challengerModel: 'deepseek-r1',
          precision: 0.85,
          recall: 0.9,
          f1: 0.875,
          noiseRatio: 0.1,
          createdAt: new Date('2026-03-23T10:00:00Z'),
        },
      ];
      const chain = createChainableMock(mockRuns);
      const db = { select: vi.fn().mockReturnValue(chain) };
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(db as any);

      const res = await request(app).get(
        '/api/review-calibration/history?model=deepseek-r1&limit=10'
      );
      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0]).toMatchObject({
        run_id: 'run-1',
        ground_truth_model: 'claude-opus',
        challenger_model: 'deepseek-r1',
        precision: 0.85,
        recall: 0.9,
        f1: 0.875,
        noise_ratio: 0.1,
      });
    });
  });

  describe('GET /api/review-calibration/scores', () => {
    it('returns empty models array when DB is not configured', async () => {
      const res = await request(app).get('/api/review-calibration/scores');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [] });
    });

    it('returns model scores when data exists', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const mockScores = [
        {
          modelId: 'deepseek-r1',
          scoreCorrectness: '0.8750',
          runCount: 10,
          calibrationRunCount: 5,
        },
      ];
      // For scores query, groupBy is the terminal before orderBy
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockResolvedValue(mockScores);
      const db = { select: vi.fn().mockReturnValue(chain) };
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(db as any);

      const res = await request(app).get('/api/review-calibration/scores');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
      expect(res.body.models[0]).toMatchObject({
        model_id: 'deepseek-r1',
        score_correctness: 0.875,
        run_count: 10,
        calibration_run_count: 5,
      });
    });
  });

  describe('GET /api/review-calibration/fewshot-log', () => {
    it('returns empty fewshot log when DB is not configured', async () => {
      const res = await request(app).get('/api/review-calibration/fewshot-log');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        prompt_version: null,
        example_count: 0,
        last_updated: null,
      });
    });

    it('returns fewshot metadata when data exists', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const mockResult = [
        {
          exampleCount: 42,
          lastUpdated: '2026-03-23 10:00:00+00',
        },
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockResolvedValue(mockResult);
      const db = { select: vi.fn().mockReturnValue(chain) };
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(db as any);

      const res = await request(app).get('/api/review-calibration/fewshot-log');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        prompt_version: 'v1',
        example_count: 42,
      });
    });
  });
});
