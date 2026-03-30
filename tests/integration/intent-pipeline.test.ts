/**
 * Integration Tests: Intent Classification Pipeline (OMN-7001)
 *
 * Verifies the intent classify -> project -> API chain by:
 * 1. Mounting the intent routes on a test Express app
 * 2. Storing a test intent via the POST endpoint
 * 3. Querying the GET endpoint to verify the intent appears
 *
 * Unlike pattern and effectiveness tests, the intent system uses an
 * in-memory circular buffer (not PostgreSQL projections), so we can
 * seed data directly via the API without needing a running consumer.
 *
 * Run with:   npx vitest run tests/integration/intent-pipeline.test.ts
 *
 * @see OMN-6995 Platform Subsystem Verification epic
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import intentRoutes from '../../server/intent-routes';

// ============================================================================
// Test App Factory
// ============================================================================

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', true);
  app.use('/api/intents', intentRoutes);
  return app;
}

// ============================================================================
// Test Data
// ============================================================================

function makeTestIntent(marker: string) {
  return {
    intentId: `intent-pipeline-test-${marker}`,
    sessionRef: `sess-pipeline-${marker}`,
    intentCategory: 'code_generation',
    confidence: 0.95,
    keywords: ['integration-test', marker],
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// Pipeline Integration Tests
// ============================================================================

describe('Intent Classification Pipeline (OMN-7001)', () => {
  it('POST + GET round-trip: stored intent appears in recent list', async () => {
    const app = buildTestApp();
    const marker = `test-${Date.now()}`;
    const intent = makeTestIntent(marker);

    // Store the intent
    const postRes = await request(app).post('/api/intents').send(intent);

    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);

    // Retrieve recent intents
    const getRes = await request(app).get('/api/intents/recent');

    expect(getRes.status).toBe(200);
    expect(getRes.body.ok).toBe(true);
    expect(Array.isArray(getRes.body.intents)).toBe(true);
    expect(getRes.body.intents.length).toBeGreaterThan(0);

    // The stored intent must appear with our unique marker.
    // POST accepts camelCase (intentId), GET returns snake_case (intent_id).
    const found = getRes.body.intents.find(
      (i: { intent_id?: string }) => i.intent_id === intent.intentId
    );
    expect(found).toBeDefined();
    expect(found.intent_category).toBe('code_generation');
    expect(found.confidence).toBe(0.95);
  });

  it('GET /api/intents/recent returns valid shape even when empty', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/intents/recent');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('intents');
    expect(Array.isArray(res.body.intents)).toBe(true);
  });

  it('GET /api/intents/distribution returns valid shape', async () => {
    const app = buildTestApp();

    // Seed some data first
    const intent = makeTestIntent(`dist-${Date.now()}`);
    await request(app).post('/api/intents').send(intent);

    const res = await request(app).get('/api/intents/distribution');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok');
  });

  it('seeded intent marker survives full store-retrieve cycle', async () => {
    const app = buildTestApp();
    const uniqueMarker = `pipeline-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const intent = makeTestIntent(uniqueMarker);

    // Store
    await request(app).post('/api/intents').send(intent);

    // Retrieve and verify the exact marker
    const res = await request(app).get('/api/intents/recent');
    const markers = res.body.intents.map((i: { intent_id?: string }) => i.intent_id);
    expect(markers).toContain(intent.intentId);
  });
});
