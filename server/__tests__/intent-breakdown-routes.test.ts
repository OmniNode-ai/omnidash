/**
 * Intent Breakdown API Tests (OMN-5288)
 *
 * Tests the GET /api/intents/breakdown endpoint that queries intent_signals
 * grouped by intent_type, returning [{intent_type, count}].
 *
 * These are unit-level tests using a mocked database layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import intentBreakdownRoutes from '../intent-breakdown-routes';

// Mock the storage module
vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(),
}));

import { tryGetIntelligenceDb } from '../storage';
const mockTryGetIntelligenceDb = vi.mocked(tryGetIntelligenceDb);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intents/breakdown', intentBreakdownRoutes);
  return app;
}

describe('GET /api/intents/breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty breakdown when db is not available', async () => {
    mockTryGetIntelligenceDb.mockReturnValue(null);
    const app = createApp();

    const res = await request(app).get('/api/intents/breakdown');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ breakdown: [] });
  });

  it('should return grouped counts from intent_signals', async () => {
    const mockRows = [
      { intent_type: 'REFACTOR', count: 42 },
      { intent_type: 'BUGFIX', count: 28 },
      { intent_type: 'FEATURE', count: 15 },
    ];
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: mockRows }),
    };
    mockTryGetIntelligenceDb.mockReturnValue(mockDb as any);
    const app = createApp();

    const res = await request(app).get('/api/intents/breakdown');

    expect(res.status).toBe(200);
    expect(res.body.breakdown).toHaveLength(3);
    expect(res.body.breakdown[0]).toEqual({ intent_type: 'REFACTOR', count: 42 });
    expect(res.body.breakdown[1]).toEqual({ intent_type: 'BUGFIX', count: 28 });
    expect(res.body.breakdown[2]).toEqual({ intent_type: 'FEATURE', count: 15 });
  });

  it('should return empty breakdown on database error', async () => {
    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    mockTryGetIntelligenceDb.mockReturnValue(mockDb as any);
    const app = createApp();

    const res = await request(app).get('/api/intents/breakdown');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ breakdown: [] });
  });

  it('should return empty array when no intent_signals exist', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    mockTryGetIntelligenceDb.mockReturnValue(mockDb as any);
    const app = createApp();

    const res = await request(app).get('/api/intents/breakdown');

    expect(res.status).toBe(200);
    expect(res.body.breakdown).toEqual([]);
  });
});
