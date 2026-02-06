/**
 * Tests for cross-repo validation routes and event handlers.
 *
 * The handlers now persist to PostgreSQL via Drizzle ORM, so we mock
 * `tryGetIntelligenceDb` from `../storage` to return a fake query builder.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
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

let runStore: RunRow[] = [];
let violationStore: ViolationRow[] = [];
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
      let targetTable: 'runs' | 'violations' | null = null;
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
        }

        // Rebuild resolver based on target table
        buildThenable(() => {
          if (targetTable === 'runs') return [...runStore];
          if (targetTable === 'violations') return [...violationStore];
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
      return {
        values: vi.fn().mockImplementation((rows: any) => {
          // Determine table from shape
          const rowArray = Array.isArray(rows) ? rows : [rows];
          if (rowArray.length > 0 && 'runId' in rowArray[0] && 'repos' in rowArray[0]) {
            // validation_runs insert
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
          } else if (rowArray.length > 0 && 'batchIndex' in rowArray[0]) {
            // validation_violations insert
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
  });
});
