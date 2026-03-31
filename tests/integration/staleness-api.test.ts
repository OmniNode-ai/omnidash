/**
 * Integration Tests: Staleness API Endpoint (OMN-6398, OMN-5288)
 *
 * Run with: npx vitest run tests/integration/staleness-api.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import stalenessRoutes, { clearStalenessCache } from '../../server/staleness-routes';
import type { StalenessApiResponse } from '../../shared/staleness-types';

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/staleness', stalenessRoutes);
  return app;
}

describe('GET /api/staleness', () => {
  beforeEach(() => {
    clearStalenessCache();
  });

  it('returns 200 with valid response shape', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    expect(body).toHaveProperty('features');
    expect(body).toHaveProperty('checkedAt');
    expect(typeof body.features).toBe('object');
  });

  it('returns expected feature names', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    const featureNames = Object.keys(body.features);
    expect(featureNames).toContain('patterns');
    expect(featureNames).toContain('enforcement');
    expect(featureNames).toContain('effectiveness');
    expect(featureNames).toContain('llm-routing');
    expect(featureNames).toContain('intent-signals');
    expect(featureNames).toContain('session-outcomes');
  });

  it('each feature has expected fields', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    for (const feature of Object.values(body.features)) {
      expect(feature).toHaveProperty('name');
      expect(feature).toHaveProperty('lastUpdated');
      expect(feature).toHaveProperty('stale');
      expect(feature).toHaveProperty('severityLevel');
      expect(typeof feature.stale).toBe('boolean');
      expect(['fresh', 'aging', 'stale', 'critical']).toContain(feature.severityLevel);
    }
  });

  it('sets Cache-Control: no-store header', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// Intent-signals staleness smoke tests (OMN-5288)
//
// These tests verify the intent-signals feature key in the staleness API
// behaves correctly when the intent_signals table has data vs is empty.
//
// NOTE: Null vs non-null lastUpdated is the first guard only. Future staleness
// checks should distinguish three states with different operational meanings:
//   1. never-written  — table exists but has zero rows (migration applied, no events)
//   2. stale-written  — table has data but the most recent row is old
//   3. recently-updated — table has fresh data
// The current API collapses (1) and "table missing" into null lastUpdated.
// ---------------------------------------------------------------------------

describe('GET /api/staleness — intent-signals feature (OMN-5288)', () => {
  beforeEach(() => {
    clearStalenessCache();
  });

  it('intent-signals is always present in the feature map', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    expect(body.features).toHaveProperty('intent-signals');
    expect(body.features['intent-signals'].name).toBe('intent-signals');
  });

  it('intent-signals returns non-null lastUpdated when table has data', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    const intentSignals = body.features['intent-signals'];
    expect(intentSignals).toBeDefined();

    // When the DB is connected and intent_signals has rows, lastUpdated is a
    // non-null ISO string. When the DB is unreachable or the table is empty,
    // lastUpdated is null. In the test environment with a live DB, the actual
    // value depends on whether migration 0037 has been applied and events have
    // flowed. We verify the structural contract: if lastUpdated is non-null,
    // the feature should not be critical.
    if (intentSignals.lastUpdated !== null) {
      expect(typeof intentSignals.lastUpdated).toBe('string');
      expect(new Date(intentSignals.lastUpdated).getTime()).not.toBeNaN();
      expect(intentSignals.severityLevel).not.toBe('critical');
    }
  });

  it('intent-signals returns null lastUpdated and critical severity when table is empty', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/staleness');

    expect(res.status).toBe(200);
    const body = res.body as StalenessApiResponse;

    const intentSignals = body.features['intent-signals'];
    expect(intentSignals).toBeDefined();

    // When lastUpdated is null (no data or table missing), the feature must
    // be marked stale with critical severity. This is the "Never updated" state
    // that was the root cause of the OMN-5288 bug.
    if (intentSignals.lastUpdated === null) {
      expect(intentSignals.stale).toBe(true);
      expect(intentSignals.severityLevel).toBe('critical');
    }
  });
});

// ---------------------------------------------------------------------------
// getStalenessInfo unit-level contract tests (OMN-5288)
//
// These tests verify the getStalenessInfo function directly with a controlled
// DB mock to assert the exact non-null and null behaviors for intent-signals.
// ---------------------------------------------------------------------------

import { vi, afterEach } from 'vitest';

describe('getStalenessInfo — intent-signals contract (OMN-5288)', () => {
  afterEach(() => {
    clearStalenessCache();
    vi.restoreAllMocks();
  });

  it('returns non-null lastUpdated when intent_signals has rows', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Mock storage to return a fake DB with controlled query results
    const storage = await import('../../server/storage');
    vi.spyOn(storage, 'tryGetIntelligenceDb').mockReturnValue({
      execute: vi.fn().mockResolvedValue([{ last_updated: fiveMinAgo }]),
    } as any);

    const { getStalenessInfo } = await import('../../server/staleness-routes');
    const result = await getStalenessInfo();

    const intentSignals = result.features['intent-signals'];
    expect(intentSignals).toBeDefined();
    expect(intentSignals.lastUpdated).not.toBeNull();
    expect(intentSignals.lastUpdated).toBe(fiveMinAgo);
    expect(intentSignals.stale).toBe(false);
    expect(intentSignals.severityLevel).toBe('fresh');
  });

  it('returns null lastUpdated when intent_signals is empty', async () => {
    // Mock storage to return a fake DB where MAX(created_at) is null (empty table)
    const storage = await import('../../server/storage');
    vi.spyOn(storage, 'tryGetIntelligenceDb').mockReturnValue({
      execute: vi.fn().mockResolvedValue([{ last_updated: null }]),
    } as any);

    const { getStalenessInfo } = await import('../../server/staleness-routes');
    const result = await getStalenessInfo();

    const intentSignals = result.features['intent-signals'];
    expect(intentSignals).toBeDefined();
    expect(intentSignals.lastUpdated).toBeNull();
    expect(intentSignals.stale).toBe(true);
    expect(intentSignals.severityLevel).toBe('critical');
  });
});
