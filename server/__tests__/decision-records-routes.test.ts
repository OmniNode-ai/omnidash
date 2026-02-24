/**
 * Decision Records Routes Tests (OMN-2469)
 *
 * Tests for /api/decisions/* endpoints:
 *   GET /timeline?session_id=<id>       — Decision Timeline (View 2)
 *   GET /intent-vs-plan?session_id=<id> — Intent vs Plan (View 1)
 *   GET /:decision_id                   — Single DecisionRecord
 *
 * Uses the in-memory circular buffer via _testHelpers for isolation.
 * No DB mocking required — routes are OMN-2325 compliant (no direct DB access).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import decisionRecordsRouter, { _testHelpers } from '../decision-records-routes';
import type {
  DecisionRecord,
  DecisionTimelineResponse,
  IntentVsPlanResponse,
} from '@shared/decision-record-types';

// ============================================================================
// Test helpers
// ============================================================================

const BASE_TIME = new Date('2026-02-21T10:00:00.000Z').getTime();

function makeRecord(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    decision_id: `dr-${Math.random().toString(36).slice(2)}`,
    session_id: 'session-test-001',
    decided_at: new Date(BASE_TIME).toISOString(),
    decision_type: 'model_select',
    selected_candidate: 'claude-opus-4-6',
    candidates_considered: [
      {
        id: 'claude-opus-4-6',
        eliminated: false,
        selected: true,
        scoring_breakdown: { latency: 0.91, context: 1.0 },
        total_score: 0.95,
      },
      {
        id: 'claude-sonnet-4-6',
        eliminated: false,
        selected: false,
        scoring_breakdown: { latency: 0.95, context: 0.85 },
        total_score: 0.87,
      },
    ],
    constraints_applied: [
      {
        description: 'context_length >= 100k',
        eliminates: [],
        satisfied_by_selected: true,
      },
    ],
    tie_breaker: null,
    agent_rationale: 'Chose opus for complex reasoning task.',
    ...overrides,
  };
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/decisions', decisionRecordsRouter);
  return app;
}

// ============================================================================
// GET /api/decisions/timeline
// ============================================================================

describe('GET /api/decisions/timeline', () => {
  beforeEach(() => {
    _testHelpers.resetBuffer();
  });

  afterEach(() => {
    _testHelpers.resetBuffer();
  });

  it('returns 400 when session_id is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when session_id is empty string', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns empty rows array when no decisions exist for the session', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=nonexistent');
    expect(res.status).toBe(200);

    const body = res.body as DecisionTimelineResponse;
    expect(body.session_id).toBe('nonexistent');
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  it('returns timeline rows for a session', async () => {
    const record = makeRecord({ session_id: 'session-abc' });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=session-abc');
    expect(res.status).toBe(200);

    const body = res.body as DecisionTimelineResponse;
    expect(body.session_id).toBe('session-abc');
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].decision_id).toBe(record.decision_id);
    expect(body.rows[0].decision_type).toBe('model_select');
    expect(body.rows[0].selected_candidate).toBe('claude-opus-4-6');
    expect(body.rows[0].candidates_count).toBe(2);
  });

  it('filters records to the requested session only', async () => {
    const recordA1 = makeRecord({ session_id: 'session-A', decision_id: 'dr-a1' });
    const recordA2 = makeRecord({ session_id: 'session-A', decision_id: 'dr-a2' });
    const recordB = makeRecord({ session_id: 'session-B', decision_id: 'dr-b1' });

    _testHelpers.addToStore(recordA1);
    _testHelpers.addToStore(recordA2);
    _testHelpers.addToStore(recordB);

    const app = buildApp();

    const resA = await request(app).get('/api/decisions/timeline?session_id=session-A');
    expect(resA.status).toBe(200);
    expect(resA.body.total).toBe(2);
    expect(resA.body.rows.map((r: { decision_id: string }) => r.decision_id)).toContain('dr-a1');
    expect(resA.body.rows.map((r: { decision_id: string }) => r.decision_id)).toContain('dr-a2');
    expect(resA.body.rows.map((r: { decision_id: string }) => r.decision_id)).not.toContain(
      'dr-b1'
    );

    const resB = await request(app).get('/api/decisions/timeline?session_id=session-B');
    expect(resB.status).toBe(200);
    expect(resB.body.total).toBe(1);
    expect(resB.body.rows[0].decision_id).toBe('dr-b1');
  });

  it('returns rows sorted chronologically (oldest first)', async () => {
    const t1 = new Date(BASE_TIME).toISOString();
    const t2 = new Date(BASE_TIME + 1000).toISOString();
    const t3 = new Date(BASE_TIME + 2000).toISOString();

    // Add out of order
    const r3 = makeRecord({ decided_at: t3, decision_id: 'dr-newest', session_id: 'session-sort' });
    const r1 = makeRecord({ decided_at: t1, decision_id: 'dr-oldest', session_id: 'session-sort' });
    const r2 = makeRecord({ decided_at: t2, decision_id: 'dr-middle', session_id: 'session-sort' });

    _testHelpers.addToStore(r3);
    _testHelpers.addToStore(r1);
    _testHelpers.addToStore(r2);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=session-sort');
    expect(res.status).toBe(200);

    const ids = res.body.rows.map((r: { decision_id: string }) => r.decision_id);
    expect(ids[0]).toBe('dr-oldest');
    expect(ids[1]).toBe('dr-middle');
    expect(ids[2]).toBe('dr-newest');
  });

  it('includes full_record on each timeline row', async () => {
    const record = makeRecord({ session_id: 'session-full' });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=session-full');
    expect(res.status).toBe(200);

    const row = res.body.rows[0];
    expect(row.full_record).toBeDefined();
    expect(row.full_record.decision_id).toBe(record.decision_id);
    expect(row.full_record.constraints_applied).toHaveLength(1);
    expect(row.full_record.agent_rationale).toBe('Chose opus for complex reasoning task.');
  });

  it('counts candidates correctly including eliminated ones', async () => {
    const record = makeRecord({
      session_id: 'session-count',
      candidates_considered: [
        { id: 'candidate-a', eliminated: false, selected: true, total_score: 0.9 },
        { id: 'candidate-b', eliminated: true, elimination_reason: 'too slow', selected: false },
        { id: 'candidate-c', eliminated: false, selected: false, total_score: 0.7 },
      ],
    });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/timeline?session_id=session-count');
    expect(res.status).toBe(200);

    expect(res.body.rows[0].candidates_count).toBe(3);
  });
});

// ============================================================================
// GET /api/decisions/intent-vs-plan
// ============================================================================

describe('GET /api/decisions/intent-vs-plan', () => {
  beforeEach(() => {
    _testHelpers.resetBuffer();
  });

  afterEach(() => {
    _testHelpers.resetBuffer();
  });

  it('returns 400 when session_id is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when no decisions exist for session', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan?session_id=no-such-session');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns intent-vs-plan derived from session decisions', async () => {
    const record = makeRecord({
      session_id: 'session-ivp',
      decision_id: 'dr-ivp-001',
      decision_type: 'model_select',
      selected_candidate: 'claude-opus-4-6',
    });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan?session_id=session-ivp');
    expect(res.status).toBe(200);

    const body = res.body as IntentVsPlanResponse;
    expect(body.session_id).toBe('session-ivp');
    expect(body.executed_at).toBeDefined();
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0].field_name).toBe('model_select');
    expect(body.fields[0].resolved_value).toBe('claude-opus-4-6');
    expect(body.fields[0].decision_id).toBe('dr-ivp-001');
    expect(body.fields[0].intent_value).toBeNull(); // V1: user intent not stored yet
  });

  it('maps default_apply decisions to origin:default', async () => {
    const record = makeRecord({
      session_id: 'session-default',
      decision_type: 'default_apply',
      selected_candidate: '30s',
    });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan?session_id=session-default');
    expect(res.status).toBe(200);

    expect(res.body.fields[0].origin).toBe('default');
  });

  it('maps non-default decisions to origin:inferred', async () => {
    const record = makeRecord({
      session_id: 'session-inferred',
      decision_type: 'route_select',
      selected_candidate: 'agent-api-architect',
    });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan?session_id=session-inferred');
    expect(res.status).toBe(200);

    expect(res.body.fields[0].origin).toBe('inferred');
  });

  it('returns fields sorted chronologically', async () => {
    const t1 = new Date(BASE_TIME).toISOString();
    const t2 = new Date(BASE_TIME + 500).toISOString();

    const r1 = makeRecord({
      session_id: 'session-order',
      decided_at: t1,
      decision_id: 'dr-first',
      decision_type: 'model_select',
    });
    const r2 = makeRecord({
      session_id: 'session-order',
      decided_at: t2,
      decision_id: 'dr-second',
      decision_type: 'route_select',
    });

    _testHelpers.addToStore(r2); // Add out-of-order
    _testHelpers.addToStore(r1);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/intent-vs-plan?session_id=session-order');
    expect(res.status).toBe(200);

    expect(res.body.fields[0].decision_id).toBe('dr-first');
    expect(res.body.fields[1].decision_id).toBe('dr-second');
  });
});

// ============================================================================
// GET /api/decisions/:decision_id
// ============================================================================

describe('GET /api/decisions/:decision_id', () => {
  beforeEach(() => {
    _testHelpers.resetBuffer();
  });

  afterEach(() => {
    _testHelpers.resetBuffer();
  });

  it('returns 404 when decision_id is not found', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/decisions/dr-not-here');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns full DecisionRecord by decision_id', async () => {
    const record = makeRecord({ decision_id: 'dr-specific-001', session_id: 'session-xyz' });
    _testHelpers.addToStore(record);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/dr-specific-001');
    expect(res.status).toBe(200);

    const body = res.body as DecisionRecord;
    expect(body.decision_id).toBe('dr-specific-001');
    expect(body.session_id).toBe('session-xyz');
    expect(body.decision_type).toBe('model_select');
    expect(body.selected_candidate).toBe('claude-opus-4-6');
    expect(body.candidates_considered).toHaveLength(2);
    expect(body.constraints_applied).toHaveLength(1);
    expect(body.agent_rationale).toBe('Chose opus for complex reasoning task.');
    expect(body.tie_breaker).toBeNull();
  });

  it('returns the correct record when multiple exist', async () => {
    const r1 = makeRecord({ decision_id: 'dr-alpha', selected_candidate: 'model-A' });
    const r2 = makeRecord({ decision_id: 'dr-beta', selected_candidate: 'model-B' });
    const r3 = makeRecord({ decision_id: 'dr-gamma', selected_candidate: 'model-C' });

    _testHelpers.addToStore(r1);
    _testHelpers.addToStore(r2);
    _testHelpers.addToStore(r3);

    const app = buildApp();
    const res = await request(app).get('/api/decisions/dr-beta');
    expect(res.status).toBe(200);
    expect(res.body.decision_id).toBe('dr-beta');
    expect(res.body.selected_candidate).toBe('model-B');
  });
});

// ============================================================================
// _testHelpers — internal buffer behavior
// ============================================================================

describe('_testHelpers (circular buffer)', () => {
  beforeEach(() => {
    _testHelpers.resetBuffer();
  });

  afterEach(() => {
    _testHelpers.resetBuffer();
  });

  it('resetBuffer clears all records', () => {
    _testHelpers.addToStore(makeRecord({ decision_id: 'dr-x1' }));
    _testHelpers.addToStore(makeRecord({ decision_id: 'dr-x2' }));

    expect(_testHelpers.getBufferState().count).toBe(2);

    _testHelpers.resetBuffer();

    expect(_testHelpers.getBufferState().count).toBe(0);
    expect(_testHelpers.getBufferState().head).toBe(0);
    expect(_testHelpers.getAllRecords()).toEqual([]);
  });

  it('getAllRecords returns newest-first after multiple inserts', () => {
    const r1 = makeRecord({ decision_id: 'first' });
    const r2 = makeRecord({ decision_id: 'second' });
    const r3 = makeRecord({ decision_id: 'third' });

    _testHelpers.addToStore(r1);
    _testHelpers.addToStore(r2);
    _testHelpers.addToStore(r3);

    const records = _testHelpers.getAllRecords();
    expect(records[0].decision_id).toBe('third');
    expect(records[1].decision_id).toBe('second');
    expect(records[2].decision_id).toBe('first');
  });

  it('getBySession filters by session_id', () => {
    _testHelpers.addToStore(makeRecord({ session_id: 'session-1', decision_id: 'dr-s1' }));
    _testHelpers.addToStore(makeRecord({ session_id: 'session-2', decision_id: 'dr-s2' }));

    const s1Records = _testHelpers.getBySession('session-1');
    expect(s1Records).toHaveLength(1);
    expect(s1Records[0].decision_id).toBe('dr-s1');
  });

  it('getById returns the correct record', () => {
    _testHelpers.addToStore(makeRecord({ decision_id: 'dr-lookup' }));
    _testHelpers.addToStore(makeRecord({ decision_id: 'dr-other' }));

    const found = _testHelpers.getById('dr-lookup');
    expect(found).toBeDefined();
    expect(found!.decision_id).toBe('dr-lookup');

    const notFound = _testHelpers.getById('dr-missing');
    expect(notFound).toBeUndefined();
  });

  it('toTimelineRow derives correct candidates_count and lightweight fields', () => {
    const record = makeRecord({
      decision_id: 'dr-row-test',
      candidates_considered: [
        { id: 'a', eliminated: false, selected: true },
        { id: 'b', eliminated: true, selected: false },
        { id: 'c', eliminated: false, selected: false },
      ],
    });

    const row = _testHelpers.toTimelineRow(record);

    expect(row.decision_id).toBe('dr-row-test');
    expect(row.candidates_count).toBe(3);
    expect(row.full_record).toBe(record); // Same reference
    expect(row.decided_at).toBe(record.decided_at);
    expect(row.decision_type).toBe(record.decision_type);
    expect(row.selected_candidate).toBe(record.selected_candidate);
  });

  it('MAX_STORED_DECISIONS is a positive integer', () => {
    expect(_testHelpers.MAX_STORED_DECISIONS).toBeGreaterThan(0);
    expect(Number.isInteger(_testHelpers.MAX_STORED_DECISIONS)).toBe(true);
  });
});

// ============================================================================
// OMN-2325 compliance: no direct DB imports
// ============================================================================

describe('OMN-2325 compliance', () => {
  it('decision-records-routes does not import DB accessors', async () => {
    // Import the raw file source to check for forbidden imports
    const fs = await import('node:fs');
    const path = await import('node:path');

    const routePath = path.resolve(import.meta.dirname, '../decision-records-routes.ts');
    const content = fs.readFileSync(routePath, 'utf-8');

    expect(content).not.toMatch(/import\s.*getIntelligenceDb/);
    expect(content).not.toMatch(/import\s.*tryGetIntelligenceDb/);
  });
});
