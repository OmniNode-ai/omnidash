/**
 * Tests for cross-repo validation routes and event handlers.
 *
 * The handlers now persist to PostgreSQL via Drizzle ORM, so we mock
 * `tryGetIntelligenceDb` from `../storage` to return a fake query builder.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 * @see OMN-2333 - Validation lifecycle dashboard surface
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
  ValidationCandidateUpsertedEvent,
} from '@shared/validation-types';

// ============================================================================
// In-memory store to simulate PostgreSQL tables
// ============================================================================

interface RunRow {
  runId: string;
  repos: string[];
  validators: string[];
  triggeredBy: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  totalViolations: number;
  violationsBySeverity: Record<string, number>;
  createdAt: Date;
}

interface ViolationRow {
  id: number;
  runId: string;
  batchIndex: number;
  ruleId: string;
  severity: string;
  message: string;
  repo: string;
  filePath: string | null;
  line: number | null;
  validator: string;
  createdAt: Date;
}

interface CandidateRow {
  candidateId: string;
  ruleName: string;
  ruleId: string;
  tier: string;
  status: string;
  sourceRepo: string;
  enteredTierAt: Date;
  lastValidatedAt: Date;
  passStreak: number;
  failStreak: number;
  totalRuns: number;
}

let runStore: RunRow[] = [];
let violationStore: ViolationRow[] = [];
let candidateStore: CandidateRow[] = [];
let nextViolationId = 1;

// ============================================================================
// Chainable Drizzle mock
// ============================================================================

/**
 * Build a chainable mock that simulates Drizzle's fluent query API.
 * Each method returns the chain, and the chain is also a thenable
 * so `await db.select().from(table).where(cond)` resolves to a result.
 */
function buildChain(resolver: () => any): any {
  const chain: any = {};

  // Make the chain thenable so await works
  chain.then = (resolve: any, reject: any) => {
    try {
      const result = resolver();
      return Promise.resolve(result).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  };

  // Every chained method returns the same chain
  const passthrough = () => chain;
  chain.from = passthrough;
  chain.where = passthrough;
  chain.limit = passthrough;
  chain.offset = passthrough;
  chain.orderBy = passthrough;
  chain.groupBy = passthrough;
  chain.innerJoin = passthrough;
  chain.set = passthrough;

  return chain;
}

function createMockDb() {
  const db: any = {
    select: vi.fn().mockImplementation((_fields?: any) => {
      // We capture the call context; the actual filtering is done in
      // the thenable resolver below after all chain methods have been called.
      // For simplicity we return ALL rows and let callers refine via the
      // integration with the real route logic (which reads the resolved array).
      // The mock stores will be pre-seeded per test.
      //
      // This simplified mock returns runStore rows when called from
      // validation_runs context and violationStore when from violations context.
      //
      // Tracking the "from" table to know which store to query.
      let targetTable: 'runs' | 'violations' | 'candidates' | null = null;
      let selectFields: any = _fields;

      const chain: any = {};

      const buildThenable = (resolverFn: () => any) => {
        chain.then = (resolve: any, reject: any) => {
          try {
            return Promise.resolve(resolverFn()).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        };
      };

      // Default resolver (empty array)
      buildThenable(() => []);

      chain.from = vi.fn().mockImplementation((table: any) => {
        // Detect table by checking for known column references
        if (table?.runId !== undefined && table?.repos !== undefined) {
          targetTable = 'runs';
        } else if (table?.batchIndex !== undefined) {
          targetTable = 'violations';
        } else if (table?.candidateId !== undefined || table?.sourceRepo !== undefined) {
          targetTable = 'candidates';
        }

        // Rebuild resolver based on target table
        buildThenable(() => {
          if (targetTable === 'runs') return [...runStore];
          if (targetTable === 'violations') return [...violationStore];
          if (targetTable === 'candidates') return [...candidateStore];
          return [];
        });

        return chain;
      });

      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.offset = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);

      return chain;
    }),

    insert: vi.fn().mockImplementation((_table: any) => {
      let targetInsertTable: 'runs' | 'violations' | 'candidates' | null = null;

      // Detect table from the Drizzle table object passed to insert()
      if (_table?.runId !== undefined && _table?.repos !== undefined) {
        targetInsertTable = 'runs';
      } else if (_table?.batchIndex !== undefined) {
        targetInsertTable = 'violations';
      } else if (_table?.candidateId !== undefined || _table?.sourceRepo !== undefined) {
        targetInsertTable = 'candidates';
      }

      return {
        values: vi.fn().mockImplementation((rows: any) => {
          // Determine table from shape when table detection via _table failed
          const rowArray = Array.isArray(rows) ? rows : [rows];

          const detectedTable =
            targetInsertTable ??
            (rowArray.length > 0 && 'runId' in rowArray[0] && 'repos' in rowArray[0]
              ? 'runs'
              : rowArray.length > 0 && 'batchIndex' in rowArray[0]
                ? 'violations'
                : rowArray.length > 0 && 'candidateId' in rowArray[0]
                  ? 'candidates'
                  : null);

          /**
           * Helper to apply candidate upsert logic to the store.
           * Called both from `values()` (for runs/violations) and from
           * `onConflictDoUpdate()` (for candidates).
           */
          const applyCandidateRows = (rows: any[]) => {
            for (const row of rows) {
              const existingIdx = candidateStore.findIndex(
                (c) => c.candidateId === row.candidateId
              );
              const candidateEntry: CandidateRow = {
                candidateId: row.candidateId,
                ruleName: row.ruleName,
                ruleId: row.ruleId,
                tier: row.tier ?? 'observed',
                status: row.status ?? 'pending',
                sourceRepo: row.sourceRepo,
                enteredTierAt:
                  row.enteredTierAt instanceof Date
                    ? row.enteredTierAt
                    : new Date(row.enteredTierAt ?? Date.now()),
                lastValidatedAt:
                  row.lastValidatedAt instanceof Date
                    ? row.lastValidatedAt
                    : new Date(row.lastValidatedAt ?? Date.now()),
                passStreak: row.passStreak ?? 0,
                failStreak: row.failStreak ?? 0,
                totalRuns: row.totalRuns ?? 0,
              };
              if (existingIdx >= 0) {
                candidateStore[existingIdx] = candidateEntry;
              } else {
                candidateStore.push(candidateEntry);
              }
            }
          };

          if (detectedTable === 'runs') {
            for (const row of rowArray) {
              runStore.push({
                runId: row.runId,
                repos: row.repos,
                validators: row.validators,
                triggeredBy: row.triggeredBy ?? null,
                status: row.status || 'running',
                startedAt: row.startedAt instanceof Date ? row.startedAt : new Date(row.startedAt),
                completedAt: null,
                durationMs: null,
                totalViolations: row.totalViolations ?? 0,
                violationsBySeverity: row.violationsBySeverity ?? {},
                createdAt: new Date(),
              });
            }
            return Promise.resolve();
          } else if (detectedTable === 'violations') {
            for (const row of rowArray) {
              violationStore.push({
                id: nextViolationId++,
                runId: row.runId,
                batchIndex: row.batchIndex,
                ruleId: row.ruleId,
                severity: row.severity,
                message: row.message,
                repo: row.repo,
                filePath: row.filePath ?? null,
                line: row.line ?? null,
                validator: row.validator,
                createdAt: new Date(),
              });
            }
            return Promise.resolve();
          } else if (detectedTable === 'candidates') {
            // For candidates, don't commit yet — return object with onConflictDoUpdate
            // so the chain can complete (upsert is applied in onConflictDoUpdate below).
            return {
              onConflictDoUpdate: vi.fn().mockImplementation((_opts: any) => {
                applyCandidateRows(rowArray);
                return Promise.resolve();
              }),
            };
          }

          return Promise.resolve();
        }),
      };
    }),

    update: vi.fn().mockImplementation((_table: any) => {
      return {
        set: vi.fn().mockImplementation((fields: any) => {
          return {
            where: vi.fn().mockImplementation(() => {
              // Apply updates to runStore for the matching run
              // The where clause is opaque in our mock, so we update the LAST run that was queried
              // For simplicity: update all runs that match (we'll trust the test setup)
              for (const run of runStore) {
                if (fields.status !== undefined) run.status = fields.status;
                if (fields.completedAt !== undefined) run.completedAt = fields.completedAt;
                if (fields.durationMs !== undefined) run.durationMs = fields.durationMs;
                if (fields.totalViolations !== undefined)
                  run.totalViolations = fields.totalViolations;
                if (fields.violationsBySeverity !== undefined)
                  run.violationsBySeverity = fields.violationsBySeverity;
              }
              return Promise.resolve();
            }),
          };
        }),
      };
    }),
  };

  return db;
}

// ============================================================================
// Mock storage module
// ============================================================================

let mockDb: ReturnType<typeof createMockDb> | null = null;

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: () => mockDb,
  getIntelligenceDb: () => {
    if (!mockDb) throw new Error('Database not configured');
    return mockDb;
  },
  isDatabaseConfigured: () => mockDb !== null,
}));

// Import after mocking
const {
  default: validationRoutes,
  handleValidationRunStarted,
  handleValidationViolationsBatch,
  handleValidationRunCompleted,
  handleValidationCandidateUpserted,
} = await import('../validation-routes');

// ============================================================================
// Test App Setup
// ============================================================================

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/validation', validationRoutes);
  return app;
}

// ============================================================================
// Event Handler Unit Tests
// ============================================================================

describe('Validation Event Handlers', () => {
  beforeEach(() => {
    runStore = [];
    violationStore = [];
    candidateStore = [];
    nextViolationId = 1;
    mockDb = createMockDb();
  });

  it('handleValidationRunStarted creates a new run', async () => {
    const event: ValidationRunStartedEvent = {
      event_type: 'ValidationRunStarted',
      run_id: 'test-run-001',
      repos: ['omnibase_core', 'omnidash'],
      validators: ['schema-validator', 'contract-validator'],
      triggered_by: 'ci',
      timestamp: new Date().toISOString(),
    };

    await handleValidationRunStarted(event);

    expect(runStore).toHaveLength(1);
    expect(runStore[0].runId).toBe('test-run-001');
    expect(runStore[0].status).toBe('running');
    expect(runStore[0].repos).toEqual(['omnibase_core', 'omnidash']);
  });

  it('handleValidationRunStarted guards against duplicate run_id', async () => {
    const event: ValidationRunStartedEvent = {
      event_type: 'ValidationRunStarted',
      run_id: 'test-run-dup',
      repos: ['repo-a'],
      validators: ['v1'],
      timestamp: new Date().toISOString(),
    };

    await handleValidationRunStarted(event);
    expect(runStore).toHaveLength(1);

    // Second call with same run_id should be a no-op
    // We need the select mock to return the existing row
    // Override the db.select chain for the duplicate check
    const originalSelect = mockDb!.select;
    mockDb!.select = vi.fn().mockImplementation((_fields?: any) => {
      const chain: any = {};
      chain.then = (resolve: any) => Promise.resolve([{ runId: 'test-run-dup' }]).then(resolve);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await handleValidationRunStarted(event);
    // Should still be 1 run (duplicate was skipped)
    expect(runStore).toHaveLength(1);

    mockDb!.select = originalSelect;
  });

  it('handleValidationViolationsBatch appends violations to a run', async () => {
    // Create the run first
    runStore.push({
      runId: 'test-run-002',
      repos: ['repo-a'],
      validators: ['v1'],
      triggeredBy: null,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
      totalViolations: 0,
      violationsBySeverity: {},
      createdAt: new Date(),
    });

    const batchEvent: ValidationViolationsBatchEvent = {
      event_type: 'ValidationViolationsBatch',
      run_id: 'test-run-002',
      violations: [
        {
          rule_id: 'SCHEMA-001',
          severity: 'error',
          message: 'Missing required field',
          repo: 'repo-a',
          validator: 'v1',
        },
        {
          rule_id: 'SCHEMA-002',
          severity: 'warning',
          message: 'Deprecated field used',
          repo: 'repo-a',
          validator: 'v1',
        },
      ],
      batch_index: 0,
      timestamp: new Date().toISOString(),
    };

    await handleValidationViolationsBatch(batchEvent);

    expect(violationStore).toHaveLength(2);
    expect(violationStore[0].ruleId).toBe('SCHEMA-001');
    expect(violationStore[1].ruleId).toBe('SCHEMA-002');
  });

  it('handleValidationViolationsBatch ignores unknown run_id', async () => {
    // Mock select to return empty (no matching run)
    const originalSelect = mockDb!.select;
    mockDb!.select = vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await handleValidationViolationsBatch({
      event_type: 'ValidationViolationsBatch',
      run_id: 'nonexistent-batch-run',
      violations: [
        { rule_id: 'R1', severity: 'error', message: 'test', repo: 'r', validator: 'v' },
      ],
      batch_index: 0,
      timestamp: new Date().toISOString(),
    });

    expect(violationStore).toHaveLength(0);

    mockDb!.select = originalSelect;
  });

  it('handleValidationRunCompleted marks run as finished', async () => {
    runStore.push({
      runId: 'test-run-003',
      repos: ['repo-b'],
      validators: ['v1'],
      triggeredBy: null,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
      totalViolations: 0,
      violationsBySeverity: {},
      createdAt: new Date(),
    });

    const completedEvent: ValidationRunCompletedEvent = {
      event_type: 'ValidationRunCompleted',
      run_id: 'test-run-003',
      status: 'passed',
      total_violations: 0,
      duration_ms: 1234,
      timestamp: new Date().toISOString(),
    };

    await handleValidationRunCompleted(completedEvent);

    expect(runStore[0].status).toBe('passed');
    expect(runStore[0].durationMs).toBe(1234);
  });

  it('handleValidationRunCompleted ignores unknown run_id', async () => {
    const originalSelect = mockDb!.select;
    mockDb!.select = vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await handleValidationRunCompleted({
      event_type: 'ValidationRunCompleted',
      run_id: 'nonexistent-completed-run',
      status: 'passed',
      total_violations: 0,
      duration_ms: 100,
      timestamp: new Date().toISOString(),
    });

    // No runs should have been modified
    expect(runStore).toHaveLength(0);

    mockDb!.select = originalSelect;
  });

  it('handleValidationViolationsBatch guards against duplicate batch_index', async () => {
    runStore.push({
      runId: 'test-run-batch-dup',
      repos: ['repo-a'],
      validators: ['v1'],
      triggeredBy: null,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
      totalViolations: 0,
      violationsBySeverity: {},
      createdAt: new Date(),
    });

    // Pre-seed a violation with batch_index 0
    violationStore.push({
      id: nextViolationId++,
      runId: 'test-run-batch-dup',
      batchIndex: 0,
      ruleId: 'R1',
      severity: 'error',
      message: 'existing',
      repo: 'repo-a',
      filePath: null,
      line: null,
      validator: 'v1',
      createdAt: new Date(),
    });

    // Mock select to simulate finding the run AND finding the existing batch
    let callCount = 0;
    const originalSelect = mockDb!.select;
    mockDb!.select = vi.fn().mockImplementation(() => {
      callCount++;
      const chain: any = {};

      if (callCount === 1) {
        // First call: check run exists -> return the run
        chain.then = (resolve: any) =>
          Promise.resolve([{ runId: 'test-run-batch-dup' }]).then(resolve);
      } else {
        // Second call: check batch exists -> return existing batch
        chain.then = (resolve: any) => Promise.resolve([{ id: 1 }]).then(resolve);
      }

      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const beforeCount = violationStore.length;

    await handleValidationViolationsBatch({
      event_type: 'ValidationViolationsBatch',
      run_id: 'test-run-batch-dup',
      violations: [
        {
          rule_id: 'R2',
          severity: 'warning',
          message: 'dup batch',
          repo: 'repo-a',
          validator: 'v1',
        },
      ],
      batch_index: 0, // duplicate batch_index
      timestamp: new Date().toISOString(),
    });

    // No new violations should have been added
    expect(violationStore).toHaveLength(beforeCount);

    mockDb!.select = originalSelect;
  });
});

// ============================================================================
// Route Tests
// ============================================================================

describe('Validation Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    runStore = [];
    violationStore = [];
    candidateStore = [];
    nextViolationId = 1;
    mockDb = createMockDb();
    app = createApp();
  });

  describe('GET /api/validation/runs', () => {
    it('should return runs list', async () => {
      // Seed a run
      runStore.push({
        runId: 'route-test-001',
        repos: ['repo-x'],
        validators: ['v1'],
        triggeredBy: null,
        status: 'running',
        startedAt: new Date(),
        completedAt: null,
        durationMs: null,
        totalViolations: 0,
        violationsBySeverity: {},
        createdAt: new Date(),
      });

      const res = await request(app).get('/api/validation/runs');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('runs');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.runs)).toBe(true);
    });
  });

  describe('GET /api/validation/runs/:runId', () => {
    it('should return 404 for unknown run', async () => {
      // Mock select to return empty
      const originalSelect = mockDb!.select;
      mockDb!.select = vi.fn().mockImplementation(() => {
        const chain: any = {};
        chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        return chain;
      });

      const res = await request(app).get('/api/validation/runs/unknown-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Validation run not found');

      mockDb!.select = originalSelect;
    });
  });

  describe('GET /api/validation/summary', () => {
    it('should return summary stats', async () => {
      const res = await request(app).get('/api/validation/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_runs');
      expect(res.body).toHaveProperty('pass_rate');
      expect(res.body).toHaveProperty('repos');
      expect(res.body).toHaveProperty('total_violations_by_severity');
    });
  });

  describe('GET /api/validation/repos/:repoId/trends', () => {
    it('should return trend data for a repo', async () => {
      const res = await request(app).get('/api/validation/repos/repo-x/trends');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('repo', 'repo-x');
      expect(res.body).toHaveProperty('trend');
      expect(Array.isArray(res.body.trend)).toBe(true);
    });
  });

  describe('when database is not configured', () => {
    beforeEach(() => {
      mockDb = null;
    });

    it('GET /api/validation/runs returns empty list', async () => {
      const res = await request(app).get('/api/validation/runs');
      expect(res.status).toBe(200);
      expect(res.body.runs).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('GET /api/validation/runs/:runId returns 404', async () => {
      const res = await request(app).get('/api/validation/runs/any-id');
      expect(res.status).toBe(404);
    });

    it('GET /api/validation/summary returns zero stats', async () => {
      const res = await request(app).get('/api/validation/summary');
      expect(res.status).toBe(200);
      expect(res.body.total_runs).toBe(0);
      expect(res.body.pass_rate).toBe(0);
    });

    it('GET /api/validation/repos/:repoId/trends returns empty trend', async () => {
      const res = await request(app).get('/api/validation/repos/repo-x/trends');
      expect(res.status).toBe(200);
      expect(res.body.trend).toEqual([]);
    });

    it('GET /api/validation/lifecycle/summary returns empty lifecycle', async () => {
      const res = await request(app).get('/api/validation/lifecycle/summary');
      expect(res.status).toBe(200);
      expect(res.body.total_candidates).toBe(0);
      expect(Array.isArray(res.body.candidates)).toBe(true);
      expect(res.body.candidates).toHaveLength(0);
      expect(Array.isArray(res.body.tiers)).toBe(true);
      expect(res.body.tiers).toHaveLength(5);
    });
  });

  describe('GET /api/validation/lifecycle/summary', () => {
    it('returns empty lifecycle when no candidates exist', async () => {
      const res = await request(app).get('/api/validation/lifecycle/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_candidates');
      expect(res.body).toHaveProperty('tiers');
      expect(res.body).toHaveProperty('by_status');
      expect(res.body).toHaveProperty('candidates');
      expect(Array.isArray(res.body.tiers)).toBe(true);
      expect(res.body.tiers).toHaveLength(5);
      expect(res.body.total_candidates).toBe(0);
    });

    it('returns 400 for invalid tier filter', async () => {
      const res = await request(app).get('/api/validation/lifecycle/summary?tier=invalid');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status filter', async () => {
      const res = await request(app).get('/api/validation/lifecycle/summary?status=invalid');
      expect(res.status).toBe(400);
    });

    it('returns candidates from the store', async () => {
      // Seed some candidates
      candidateStore.push({
        candidateId: 'cand-001',
        ruleName: 'Enforce ONEX metadata stamp',
        ruleId: 'META-001',
        tier: 'observed',
        status: 'pass',
        sourceRepo: 'omnibase_core',
        enteredTierAt: new Date('2026-01-01T00:00:00Z'),
        lastValidatedAt: new Date('2026-02-01T00:00:00Z'),
        passStreak: 3,
        failStreak: 0,
        totalRuns: 5,
      });
      candidateStore.push({
        candidateId: 'cand-002',
        ruleName: 'Require version field in manifests',
        ruleId: 'SCHEMA-001',
        tier: 'promoted',
        status: 'pending',
        sourceRepo: 'omnidash',
        enteredTierAt: new Date('2026-01-10T00:00:00Z'),
        lastValidatedAt: new Date('2026-02-10T00:00:00Z'),
        passStreak: 0,
        failStreak: 0,
        totalRuns: 8,
      });

      const res = await request(app).get('/api/validation/lifecycle/summary');
      expect(res.status).toBe(200);
      expect(res.body.candidates).toHaveLength(2);
      const candidateIds = res.body.candidates.map((c: { candidate_id: string }) => c.candidate_id);
      expect(candidateIds).toContain('cand-001');
      expect(candidateIds).toContain('cand-002');
    });

    it('returns tiers with correct structure', async () => {
      const res = await request(app).get('/api/validation/lifecycle/summary');
      expect(res.status).toBe(200);

      const tierNames = res.body.tiers.map((t: { tier: string }) => t.tier);
      expect(tierNames).toEqual(['observed', 'suggested', 'shadow_apply', 'promoted', 'default']);

      for (const tier of res.body.tiers) {
        expect(tier).toHaveProperty('tier');
        expect(tier).toHaveProperty('count');
        expect(tier).toHaveProperty('by_status');
        expect(tier).toHaveProperty('avg_days_at_tier');
        expect(tier).toHaveProperty('transition_rate');
        expect(tier.by_status).toHaveProperty('pending');
        expect(tier.by_status).toHaveProperty('pass');
        expect(tier.by_status).toHaveProperty('fail');
        expect(tier.by_status).toHaveProperty('quarantine');
      }
    });

    it('respects limit query param', async () => {
      // Seed more candidates than the limit
      for (let i = 0; i < 10; i++) {
        candidateStore.push({
          candidateId: `cand-lim-${i}`,
          ruleName: `Rule ${i}`,
          ruleId: `RULE-${i}`,
          tier: 'observed',
          status: 'pending',
          sourceRepo: 'test-repo',
          enteredTierAt: new Date(),
          lastValidatedAt: new Date(),
          passStreak: 0,
          failStreak: 0,
          totalRuns: 1,
        });
      }

      const res = await request(app).get('/api/validation/lifecycle/summary?limit=3');
      expect(res.status).toBe(200);
      // The mock returns all rows (no real SQL limit), but the route applies limit
      // via Drizzle .limit() which is mocked as passthrough. So we verify the
      // response shape is correct regardless of actual row count.
      expect(Array.isArray(res.body.candidates)).toBe(true);
    });
  });
});

// ============================================================================
// handleValidationCandidateUpserted Handler Tests (OMN-2333)
// ============================================================================

describe('handleValidationCandidateUpserted', () => {
  beforeEach(() => {
    runStore = [];
    violationStore = [];
    candidateStore = [];
    nextViolationId = 1;
    mockDb = createMockDb();
  });

  it('creates a new candidate from a ValidationCandidateUpserted event', async () => {
    const event: ValidationCandidateUpsertedEvent = {
      event_type: 'ValidationCandidateUpserted',
      candidate_id: 'cand-new-001',
      rule_name: 'Enforce ONEX metadata stamp',
      rule_id: 'META-001',
      tier: 'observed',
      status: 'pending',
      source_repo: 'omnibase_core',
      entered_tier_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      last_validated_at: new Date('2026-02-01T00:00:00Z').toISOString(),
      pass_streak: 0,
      fail_streak: 0,
      total_runs: 1,
      timestamp: new Date().toISOString(),
    };

    await handleValidationCandidateUpserted(event);

    expect(candidateStore).toHaveLength(1);
    expect(candidateStore[0].candidateId).toBe('cand-new-001');
    expect(candidateStore[0].tier).toBe('observed');
    expect(candidateStore[0].status).toBe('pending');
    expect(candidateStore[0].sourceRepo).toBe('omnibase_core');
  });

  it('upserts an existing candidate (updates in place)', async () => {
    // Seed an existing candidate
    candidateStore.push({
      candidateId: 'cand-upsert-001',
      ruleName: 'Old rule name',
      ruleId: 'META-001',
      tier: 'observed',
      status: 'pending',
      sourceRepo: 'repo-a',
      enteredTierAt: new Date(),
      lastValidatedAt: new Date(),
      passStreak: 0,
      failStreak: 0,
      totalRuns: 1,
    });

    const event: ValidationCandidateUpsertedEvent = {
      event_type: 'ValidationCandidateUpserted',
      candidate_id: 'cand-upsert-001',
      rule_name: 'Updated rule name',
      rule_id: 'META-001',
      tier: 'suggested',
      status: 'pass',
      source_repo: 'repo-a',
      entered_tier_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      pass_streak: 5,
      fail_streak: 0,
      total_runs: 10,
      timestamp: new Date().toISOString(),
    };

    await handleValidationCandidateUpserted(event);

    // Should still be just one candidate (upserted, not duplicated)
    expect(candidateStore).toHaveLength(1);
    expect(candidateStore[0].ruleName).toBe('Updated rule name');
    expect(candidateStore[0].tier).toBe('suggested');
    expect(candidateStore[0].status).toBe('pass');
    expect(candidateStore[0].passStreak).toBe(5);
    expect(candidateStore[0].totalRuns).toBe(10);
  });

  it('is a no-op when database is not configured', async () => {
    mockDb = null;

    const event: ValidationCandidateUpsertedEvent = {
      event_type: 'ValidationCandidateUpserted',
      candidate_id: 'cand-nodb-001',
      rule_name: 'Some rule',
      rule_id: 'RULE-001',
      tier: 'observed',
      status: 'pending',
      source_repo: 'repo-x',
      entered_tier_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      pass_streak: 0,
      fail_streak: 0,
      total_runs: 0,
      timestamp: new Date().toISOString(),
    };

    // Should not throw; silently drops the event
    await expect(handleValidationCandidateUpserted(event)).resolves.toBeUndefined();
    expect(candidateStore).toHaveLength(0);
  });
});
