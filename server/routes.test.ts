// T10 — supertest smoke coverage for every REST route in server/routes.ts.
// db.query is mocked so the tests do not need a live Postgres.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock db before importing routes so the real Pool is never constructed
// (which would otherwise throw because OMNIDASH_ANALYTICS_DB_URL is unset).
vi.mock('./db.js', () => {
  const query = vi.fn();
  return {
    query,
    pool: {} as unknown,
  };
});

import { query } from './db.js';
import routes from './routes.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(routes);
  return app;
}

describe('server/routes (T10 smoke coverage)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('GET /api/intelligence/cost/trends returns rows', async () => {
    mockQuery.mockResolvedValueOnce([
      { bucket_time: '2026-04-25', model_name: 'qwen', total_cost_usd: '1.00', total_tokens: 100 },
    ]);
    const res = await request(buildApp()).get('/api/intelligence/cost/trends?granularity=day');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].model_name).toBe('qwen');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['day']);
  });

  it('GET /api/intelligence/cost/trends defaults granularity to day', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await request(buildApp()).get('/api/intelligence/cost/trends');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['day']);
  });

  it('GET /api/intelligence/cost/trends returns 500 when query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    // Silence the route's error console.error during the test.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(buildApp()).get('/api/intelligence/cost/trends');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'query failed' });
    errSpy.mockRestore();
  });

  it('GET /api/delegation/summary returns aggregated counts', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { total: '10', pass_count: '8', total_savings_usd: '12.50' },
      ])
      .mockResolvedValueOnce([{ task_type: 'extraction', count: '6' }]);
    const res = await request(buildApp()).get('/api/delegation/summary');
    expect(res.status).toBe(200);
    expect(res.body.totalDelegations).toBe(10);
    expect(res.body.qualityGatePassRate).toBeCloseTo(0.8);
    expect(res.body.totalSavingsUsd).toBeCloseTo(12.5);
    expect(res.body.byTaskType).toEqual([{ taskType: 'extraction', count: 6 }]);
  });

  it('GET /api/llm-routing/decisions returns decision rows', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 'r1',
        created_at: '2026-04-25T00:00:00Z',
        llm_agent: 'agent-a',
        fuzzy_agent: 'agent-b',
        agreement: false,
        llm_confidence: 0.9,
        fuzzy_confidence: 0.5,
        cost_usd: 0.01,
      },
    ]);
    const res = await request(buildApp()).get('/api/llm-routing/decisions');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe('r1');
  });

  it('GET /api/baselines/summary returns 204 when no snapshot rows (M7)', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await request(buildApp()).get('/api/baselines/summary');
    expect(res.status).toBe(204);
    // 204 No Content has an empty body — supertest reports {} for that.
    expect(res.body).toEqual({});
  });

  it('GET /api/baselines/summary aggregates recommendations', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          snapshot_id: 's1',
          computed_at_utc: '2026-04-25T00:00:00Z',
          token_delta: 100,
          time_delta_ms: 500,
          retry_delta: -1,
          confidence: 0.85,
        },
      ])
      .mockResolvedValueOnce([
        { recommendation: 'promote', count: '3' },
        { recommendation: 'shadow', count: '1' },
      ]);
    const res = await request(buildApp()).get('/api/baselines/summary');
    expect(res.status).toBe(200);
    expect(res.body.snapshotId).toBe('s1');
    expect(res.body.recommendations).toEqual({
      promote: 3,
      shadow: 1,
      suppress: 0,
      fork: 0,
    });
  });

  it('GET /api/intelligence/quality/summary returns mean and distribution', async () => {
    // Server returns 5 buckets (1..5) — matches QualityScorePanel widget's
    // BAR_COUNT contract. See M9 fix.
    mockQuery
      .mockResolvedValueOnce([{ mean_score: 0.72, total: '50' }])
      .mockResolvedValueOnce([
        { bucket: '4', count: '20' },
        { bucket: '5', count: '15' },
      ]);
    const res = await request(buildApp()).get('/api/intelligence/quality/summary');
    expect(res.status).toBe(200);
    expect(res.body.meanScore).toBeCloseTo(0.72);
    expect(res.body.totalMeasurements).toBe(50);
    expect(res.body.distribution).toHaveLength(2);
  });

  it('GET /api/readiness/summary returns dimensions with derived overall status', async () => {
    // Four parallel counts: cost, delegation, routing, quality.
    mockQuery
      .mockResolvedValueOnce([{ count: '5' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ count: '3' }])
      .mockResolvedValueOnce([{ count: '2' }]);
    const res = await request(buildApp()).get('/api/readiness/summary');
    expect(res.status).toBe(200);
    expect(res.body.dimensions).toHaveLength(4);
    expect(res.body.overallStatus).toBe('WARN');
    expect(res.body.dimensions[1].status).toBe('WARN');
  });

  it('GET /api/events/recent returns [] gracefully when table is missing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation "event_bus_events" does not exist'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await request(buildApp()).get('/api/events/recent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    warnSpy.mockRestore();
  });
});
