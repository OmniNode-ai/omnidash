/**
 * Wave 2 Projection Tests (OMN-2925)
 *
 * Exercises the four Wave 2 querySnapshot() implementations with mocked DB:
 *   - EpicRunProjection    (epic_run_events + epic_run_lease)
 *   - PrWatchProjection    (pr_watch_state)
 *   - PipelineBudgetProjection (pipeline_budget_state)
 *   - DebugEscalationProjection (debug_escalation_counts)
 *
 * Each suite covers:
 *   1. emptyPayload shape-stability when DB is unavailable
 *   2. Non-null returns with all expected keys present
 *   3. Correct mapping from DB rows to payload
 *   4. Graceful degradation on "table does not exist" (pgCode 42P01)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicRunProjection } from '../epic-run-projection';
import { PrWatchProjection } from '../pr-watch-projection';
import { PipelineBudgetProjection } from '../pipeline-budget-projection';
import { DebugEscalationProjection } from '../debug-escalation-projection';

// ============================================================================
// Mock storage (prevent real DB connections on import)
// ============================================================================

const mockTryGet = vi.fn(() => null);

vi.mock('../../storage', () => ({
  tryGetIntelligenceDb: (...args: unknown[]) => mockTryGet(...args),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// ============================================================================
// Helpers
// ============================================================================

function buildMockDb(results: Record<string, unknown>[][]) {
  let callIndex = 0;
  return {
    execute: vi.fn(() => {
      const rows = results[callIndex] ?? [];
      callIndex++;
      return Promise.resolve({ rows });
    }),
  };
}

// ============================================================================
// EpicRunProjection
// ============================================================================

describe('EpicRunProjection', () => {
  let projection: EpicRunProjection;

  beforeEach(() => {
    projection = new EpicRunProjection();
    mockTryGet.mockReturnValue(null);
  });

  it('emptyPayload is shape-stable with all keys present and zero values', () => {
    const snapshot = projection.getSnapshot();
    const p = snapshot.payload;
    expect(p.events).toEqual([]);
    expect(p.leases).toEqual([]);
    expect(p.summary.active_runs).toBe(0);
    expect(p.summary.total_events).toBe(0);
    expect(p.summary.recent_event_types).toEqual([]);
  });

  it('returns emptyPayload when DB is null (ensureFresh)', async () => {
    mockTryGet.mockReturnValue(null);
    // ensureFresh calls forceRefresh which calls querySnapshot; DB is null so returns empty
    // We can't call ensureFresh directly on abstract method, but we can confirm via getSnapshot
    // since no DB means refreshAsync short-circuits
    const snapshot = projection.getSnapshot();
    expect(snapshot.payload).toEqual({
      events: [],
      leases: [],
      summary: { active_runs: 0, total_events: 0, recent_event_types: [] },
    });
  });

  it('maps DB rows to payload correctly', async () => {
    // Promise.all fires 3 execute() calls concurrently. All 3 start synchronously
    // up to their first await, so call order is: events(0), leases(1), summary(2).
    const db = buildMockDb([
      // eventRows
      [
        {
          correlation_id: 'corr-1',
          epic_run_id: 'run-abc',
          event_type: 'started',
          ticket_id: 'OMN-100',
          repo: 'omnidash',
          created_at: '2026-02-27T10:00:00Z',
        },
      ],
      // leaseRows
      [
        {
          epic_run_id: 'run-abc',
          lease_holder: 'agent-1',
          lease_expires_at: '2026-02-27T12:00:00Z',
          updated_at: '2026-02-27T10:00:00Z',
        },
      ],
      // summaryRows
      [{ total_events: 5, active_runs: 2, recent_types: 'started,completed' }],
    ]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();

    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].epic_run_id).toBe('run-abc');
    expect(payload.events[0].event_type).toBe('started');
    expect(payload.leases).toHaveLength(1);
    expect(payload.leases[0].lease_holder).toBe('agent-1');
    expect(payload.summary.active_runs).toBe(2);
    expect(payload.summary.total_events).toBe(5);
    expect(payload.summary.recent_event_types).toEqual(['started', 'completed']);
  });

  it('returns empty recent_event_types when recent_types is null', async () => {
    const db = buildMockDb([[], [], [{ total_events: 0, active_runs: 0, recent_types: null }]]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload.summary.recent_event_types).toEqual([]);
  });

  it('degrades gracefully on table-does-not-exist error (42P01)', async () => {
    const err = Object.assign(new Error('epic_run_events does not exist'), { code: '42P01' });
    const db = { execute: vi.fn(() => Promise.reject(err)) };
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload).toEqual({
      events: [],
      leases: [],
      summary: { active_runs: 0, total_events: 0, recent_event_types: [] },
    });
  });
});

// ============================================================================
// PrWatchProjection
// ============================================================================

describe('PrWatchProjection', () => {
  let projection: PrWatchProjection;

  beforeEach(() => {
    projection = new PrWatchProjection();
    mockTryGet.mockReturnValue(null);
  });

  it('emptyPayload is shape-stable with all keys present and zero values', () => {
    const snapshot = projection.getSnapshot();
    const p = snapshot.payload;
    expect(p.recent).toEqual([]);
    expect(p.summary.total).toBe(0);
    expect(p.summary.open).toBe(0);
    expect(p.summary.merged).toBe(0);
    expect(p.summary.closed).toBe(0);
    expect(p.summary.checks_passing).toBe(0);
  });

  it('maps DB rows to payload correctly', async () => {
    // Promise.all fires 2 execute() calls concurrently: recentRows(0), summaryRows(1)
    const db = buildMockDb([
      // recentRows
      [
        {
          correlation_id: 'corr-pr-1',
          pr_number: 42,
          repo: 'omnidash',
          state: 'open',
          checks_status: 'success',
          review_status: 'approved',
          created_at: '2026-02-27T09:00:00Z',
        },
        {
          correlation_id: 'corr-pr-2',
          pr_number: 43,
          repo: 'omniclaude',
          state: 'merged',
          checks_status: 'success',
          review_status: 'approved',
          created_at: '2026-02-26T09:00:00Z',
        },
      ],
      // summaryRows
      [{ total: 10, open: 3, merged: 5, closed: 2, checks_passing: 7 }],
    ]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();

    expect(payload.recent).toHaveLength(2);
    expect(payload.recent[0].pr_number).toBe(42);
    expect(payload.recent[0].state).toBe('open');
    expect(payload.recent[1].state).toBe('merged');
    expect(payload.summary.total).toBe(10);
    expect(payload.summary.open).toBe(3);
    expect(payload.summary.merged).toBe(5);
    expect(payload.summary.closed).toBe(2);
    expect(payload.summary.checks_passing).toBe(7);
  });

  it('returns zero summary when summaryRows is empty', async () => {
    const db = buildMockDb([[], []]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload.summary.total).toBe(0);
    expect(payload.summary.open).toBe(0);
  });

  it('degrades gracefully on table-does-not-exist error (42P01)', async () => {
    const err = Object.assign(new Error('pr_watch_state does not exist'), { code: '42P01' });
    const db = { execute: vi.fn(() => Promise.reject(err)) };
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload).toEqual({
      recent: [],
      summary: { total: 0, open: 0, merged: 0, closed: 0, checks_passing: 0 },
    });
  });
});

// ============================================================================
// PipelineBudgetProjection
// ============================================================================

describe('PipelineBudgetProjection', () => {
  let projection: PipelineBudgetProjection;

  beforeEach(() => {
    projection = new PipelineBudgetProjection();
    mockTryGet.mockReturnValue(null);
  });

  it('emptyPayload is shape-stable with all keys present and zero values', () => {
    const snapshot = projection.getSnapshot();
    const p = snapshot.payload;
    expect(p.recent).toEqual([]);
    expect(p.summary.total_cap_hits).toBe(0);
    expect(p.summary.affected_pipelines).toBe(0);
    expect(p.summary.token_cap_hits).toBe(0);
    expect(p.summary.cost_cap_hits).toBe(0);
  });

  it('maps DB rows to payload correctly', async () => {
    // Promise.all fires 2 execute() calls: recentRows(0), summaryRows(1)
    const db = buildMockDb([
      // recentRows
      [
        {
          correlation_id: 'corr-budget-1',
          pipeline_id: 'pipe-abc',
          budget_type: 'tokens',
          cap_value: 100000,
          current_value: 105000,
          cap_hit: true,
          repo: 'omnidash',
          created_at: '2026-02-27T08:00:00Z',
        },
      ],
      // summaryRows
      [{ total_cap_hits: 3, affected_pipelines: 2, token_cap_hits: 2, cost_cap_hits: 1 }],
    ]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();

    expect(payload.recent).toHaveLength(1);
    expect(payload.recent[0].pipeline_id).toBe('pipe-abc');
    expect(payload.recent[0].budget_type).toBe('tokens');
    expect(payload.recent[0].cap_hit).toBe(true);
    expect(payload.summary.total_cap_hits).toBe(3);
    expect(payload.summary.affected_pipelines).toBe(2);
    expect(payload.summary.token_cap_hits).toBe(2);
    expect(payload.summary.cost_cap_hits).toBe(1);
  });

  it('returns zero summary when summaryRows is empty', async () => {
    const db = buildMockDb([[], []]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload.summary.total_cap_hits).toBe(0);
    expect(payload.summary.affected_pipelines).toBe(0);
  });

  it('degrades gracefully on table-does-not-exist error (42P01)', async () => {
    const err = Object.assign(new Error('pipeline_budget_state does not exist'), { code: '42P01' });
    const db = { execute: vi.fn(() => Promise.reject(err)) };
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload).toEqual({
      recent: [],
      summary: { total_cap_hits: 0, affected_pipelines: 0, token_cap_hits: 0, cost_cap_hits: 0 },
    });
  });
});

// ============================================================================
// DebugEscalationProjection
// ============================================================================

describe('DebugEscalationProjection', () => {
  let projection: DebugEscalationProjection;

  beforeEach(() => {
    projection = new DebugEscalationProjection();
    mockTryGet.mockReturnValue(null);
  });

  it('emptyPayload is shape-stable with all keys present and zero/null values', () => {
    const snapshot = projection.getSnapshot();
    const p = snapshot.payload;
    expect(p.recent).toEqual([]);
    expect(p.summary.total_trips).toBe(0);
    expect(p.summary.affected_agents).toBe(0);
    expect(p.summary.affected_sessions).toBe(0);
    expect(p.summary.top_agent).toBeNull();
  });

  it('maps DB rows to payload correctly', async () => {
    // Promise.all fires 2 execute() calls: recentRows(0), summaryRows(1)
    const db = buildMockDb([
      // recentRows
      [
        {
          correlation_id: 'corr-dbg-1',
          session_id: 'sess-xyz',
          agent_name: 'ticket-work',
          escalation_count: 5,
          tripped: true,
          repo: 'omnidash',
          created_at: '2026-02-27T07:00:00Z',
        },
        {
          correlation_id: 'corr-dbg-2',
          session_id: 'sess-abc',
          agent_name: 'local-review',
          escalation_count: 3,
          tripped: true,
          repo: 'omniclaude',
          created_at: '2026-02-27T06:00:00Z',
        },
      ],
      // summaryRows
      [{ total_trips: 8, affected_agents: 2, affected_sessions: 3, top_agent: 'ticket-work' }],
    ]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();

    expect(payload.recent).toHaveLength(2);
    expect(payload.recent[0].agent_name).toBe('ticket-work');
    expect(payload.recent[0].tripped).toBe(true);
    expect(payload.recent[1].agent_name).toBe('local-review');
    expect(payload.summary.total_trips).toBe(8);
    expect(payload.summary.affected_agents).toBe(2);
    expect(payload.summary.affected_sessions).toBe(3);
    expect(payload.summary.top_agent).toBe('ticket-work');
  });

  it('top_agent is null when no data', async () => {
    const db = buildMockDb([
      [],
      [{ total_trips: 0, affected_agents: 0, affected_sessions: 0, top_agent: null }],
    ]);
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload.summary.top_agent).toBeNull();
    expect(payload.summary.total_trips).toBe(0);
  });

  it('degrades gracefully on table-does-not-exist error (42P01)', async () => {
    const err = Object.assign(new Error('debug_escalation_counts does not exist'), {
      code: '42P01',
    });
    const db = { execute: vi.fn(() => Promise.reject(err)) };
    mockTryGet.mockReturnValue(db);

    const payload = await projection.ensureFresh();
    expect(payload).toEqual({
      recent: [],
      summary: { total_trips: 0, affected_agents: 0, affected_sessions: 0, top_agent: null },
    });
  });
});
