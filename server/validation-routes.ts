/**
 * Cross-Repo Validation API Routes
 *
 * REST endpoints for querying cross-repo validation runs, violations, and trends.
 * Data is persisted in PostgreSQL via Drizzle ORM, populated by Kafka validation
 * events consumed by the event consumer.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 */

import { Router } from 'express';
import { eq, ne, and, desc, sql, gte, inArray } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import {
  validationRuns,
  validationViolations,
  validationCandidates,
} from '@shared/intelligence-schema';
import type {
  ValidationRun,
  Violation,
  RepoTrends,
  RepoTrendPoint,
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
  ValidationCandidateUpsertedEvent,
  LifecycleSummary,
  LifecycleTierMetrics,
  LifecycleCandidate,
  CandidateStatus,
} from '@shared/validation-types';
import { LIFECYCLE_TIERS } from '@shared/validation-types';

const router = Router();

// ============================================================================
// Explicit column selections (exclude projected_at which may not exist yet)
// ============================================================================

/**
 * Select only the columns guaranteed to exist in the database.
 * The `projected_at` column was added to the Drizzle schema but may not
 * have been migrated yet, so using `.select()` (which selects all schema
 * columns) would cause a "column does not exist" error at the database level.
 */
const validationRunColumns = {
  runId: validationRuns.runId,
  repos: validationRuns.repos,
  validators: validationRuns.validators,
  triggeredBy: validationRuns.triggeredBy,
  status: validationRuns.status,
  startedAt: validationRuns.startedAt,
  completedAt: validationRuns.completedAt,
  durationMs: validationRuns.durationMs,
  totalViolations: validationRuns.totalViolations,
  violationsBySeverity: validationRuns.violationsBySeverity,
  createdAt: validationRuns.createdAt,
} as const;

const validationViolationColumns = {
  id: validationViolations.id,
  runId: validationViolations.runId,
  batchIndex: validationViolations.batchIndex,
  ruleId: validationViolations.ruleId,
  severity: validationViolations.severity,
  message: validationViolations.message,
  repo: validationViolations.repo,
  filePath: validationViolations.filePath,
  line: validationViolations.line,
  validator: validationViolations.validator,
  createdAt: validationViolations.createdAt,
} as const;

/** Row shape returned by selecting validationRunColumns */
type ValidationRunRow = {
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
  createdAt: Date | null;
};

/** Row shape returned by selecting validationViolationColumns */
type ValidationViolationRow = {
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
  createdAt: Date | null;
};

/** Explicit column selection for validation_candidates (excludes projected_at). */
const validationCandidateColumns = {
  candidateId: validationCandidates.candidateId,
  ruleName: validationCandidates.ruleName,
  ruleId: validationCandidates.ruleId,
  tier: validationCandidates.tier,
  status: validationCandidates.status,
  sourceRepo: validationCandidates.sourceRepo,
  enteredTierAt: validationCandidates.enteredTierAt,
  lastValidatedAt: validationCandidates.lastValidatedAt,
  passStreak: validationCandidates.passStreak,
  failStreak: validationCandidates.failStreak,
  totalRuns: validationCandidates.totalRuns,
} as const;

/** Row shape returned by selecting validationCandidateColumns */
type ValidationCandidateRow = {
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
};

// ============================================================================
// Event Handlers (called by event-consumer.ts)
// ============================================================================

/**
 * Ingest a ValidationRunStarted event.
 * Called by the event consumer when a run.started event is received.
 *
 * Guards against duplicate run.started events to avoid data loss (Issue #2).
 */
export async function handleValidationRunStarted(event: ValidationRunStartedEvent): Promise<void> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[validation] Database not available, dropping run.started event');
    return;
  }

  try {
    // Guard: check for duplicate run.started events (idempotent replay)
    const existing = await db
      .select({ runId: validationRuns.runId })
      .from(validationRuns)
      .where(eq(validationRuns.runId, event.run_id))
      .limit(1);

    if (existing.length > 0) {
      console.warn(`[validation] Duplicate run.started for ${event.run_id}, skipping`);
      return;
    }

    await db.insert(validationRuns).values({
      runId: event.run_id,
      repos: event.repos,
      validators: event.validators,
      triggeredBy: event.triggered_by ?? null,
      status: 'running',
      startedAt: new Date(event.timestamp),
      totalViolations: 0,
      violationsBySeverity: {},
    });
  } catch (error) {
    console.error(`[validation] Error persisting run.started for ${event.run_id}:`, error);
  }
}

/**
 * Ingest a ValidationViolationsBatch event.
 * Appends violations to the matching run.
 *
 * Tracks processed batch_index per run to prevent duplicate violations
 * on event replay (Issue #3).
 */
export async function handleValidationViolationsBatch(
  event: ValidationViolationsBatchEvent
): Promise<void> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[validation] Database not available, dropping violations batch event');
    return;
  }

  try {
    // Verify the run exists
    const run = await db
      .select({ runId: validationRuns.runId })
      .from(validationRuns)
      .where(eq(validationRuns.runId, event.run_id))
      .limit(1);

    if (run.length === 0) {
      console.warn(`[validation] Received violations for unknown run_id: ${event.run_id}`);
      return;
    }

    // Guard: check for duplicate batch_index (idempotent replay)
    const existingBatch = await db
      .select({ id: validationViolations.id })
      .from(validationViolations)
      .where(
        and(
          eq(validationViolations.runId, event.run_id),
          eq(validationViolations.batchIndex, event.batch_index)
        )
      )
      .limit(1);

    if (existingBatch.length > 0) {
      console.warn(
        `[validation] Duplicate batch_index ${event.batch_index} for run ${event.run_id}, skipping`
      );
      return;
    }

    // Insert all violations from the batch
    if (event.violations.length > 0) {
      const rows = event.violations.map((v) => ({
        runId: event.run_id,
        batchIndex: event.batch_index,
        ruleId: v.rule_id,
        severity: v.severity,
        message: v.message,
        repo: v.repo,
        filePath: v.file_path ?? null,
        line: v.line ?? null,
        validator: v.validator,
      }));

      await db.insert(validationViolations).values(rows);
    }

    // Update run totals from the violations table
    const severityCounts = await db
      .select({
        severity: validationViolations.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(validationViolations)
      .where(eq(validationViolations.runId, event.run_id))
      .groupBy(validationViolations.severity);

    const violationsBySeverity: Record<string, number> = {};
    let totalViolations = 0;
    for (const row of severityCounts) {
      violationsBySeverity[row.severity] = row.count;
      totalViolations += row.count;
    }

    await db
      .update(validationRuns)
      .set({
        totalViolations,
        violationsBySeverity,
      })
      .where(eq(validationRuns.runId, event.run_id));
  } catch (error) {
    console.error(`[validation] Error persisting violations batch for run ${event.run_id}:`, error);
  }
}

/**
 * Ingest a ValidationRunCompleted event.
 * Marks the run as finished with final status.
 */
export async function handleValidationRunCompleted(
  event: ValidationRunCompletedEvent
): Promise<void> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[validation] Database not available, dropping run.completed event');
    return;
  }

  try {
    // Verify the run exists
    const run = await db
      .select({ runId: validationRuns.runId })
      .from(validationRuns)
      .where(eq(validationRuns.runId, event.run_id))
      .limit(1);

    if (run.length === 0) {
      console.warn(`[validation] Received completion for unknown run_id: ${event.run_id}`);
      return;
    }

    const updateFields: Record<string, unknown> = {
      status: event.status,
      completedAt: new Date(event.timestamp),
      durationMs: event.duration_ms,
    };

    if (event.violations_by_severity) {
      updateFields.violationsBySeverity = event.violations_by_severity;
    }
    if (event.total_violations !== undefined) {
      updateFields.totalViolations = event.total_violations;
    }

    await db.update(validationRuns).set(updateFields).where(eq(validationRuns.runId, event.run_id));
  } catch (error) {
    console.error(`[validation] Error persisting run.completed for ${event.run_id}:`, error);
  }
}

/**
 * Ingest a ValidationCandidateUpserted event (OMN-2333).
 * Creates or updates a lifecycle candidate in the validation_candidates table.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE (upsert) so event replay is idempotent.
 * Called by the event consumer when a candidate event arrives from the
 * OMN-2018 artifact store.
 */
export async function handleValidationCandidateUpserted(
  event: ValidationCandidateUpsertedEvent
): Promise<void> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[validation] Database not available, dropping candidate upsert event');
    return;
  }

  try {
    await db
      .insert(validationCandidates)
      .values({
        candidateId: event.candidate_id,
        ruleName: event.rule_name,
        ruleId: event.rule_id,
        tier: event.tier,
        status: event.status,
        sourceRepo: event.source_repo,
        enteredTierAt: new Date(event.entered_tier_at),
        lastValidatedAt: new Date(event.last_validated_at),
        passStreak: event.pass_streak,
        failStreak: event.fail_streak,
        totalRuns: event.total_runs,
      })
      .onConflictDoUpdate({
        target: validationCandidates.candidateId,
        set: {
          ruleName: event.rule_name,
          ruleId: event.rule_id,
          tier: event.tier,
          status: event.status,
          sourceRepo: event.source_repo,
          enteredTierAt: new Date(event.entered_tier_at),
          lastValidatedAt: new Date(event.last_validated_at),
          passStreak: event.pass_streak,
          failStreak: event.fail_streak,
          totalRuns: event.total_runs,
          projectedAt: new Date(),
        },
      });
  } catch (error) {
    console.error(
      `[validation] Error persisting candidate upsert for ${event.candidate_id}:`,
      error
    );
  }
}

// ============================================================================
// Helper: reconstruct a ValidationRun from DB rows
// ============================================================================

function toValidationRun(row: ValidationRunRow, violations: Violation[] = []): ValidationRun {
  return {
    run_id: row.runId,
    repos: row.repos as string[],
    validators: row.validators as string[],
    triggered_by: row.triggeredBy ?? undefined,
    status: row.status as ValidationRun['status'],
    started_at: row.startedAt.toISOString(),
    completed_at: row.completedAt?.toISOString(),
    duration_ms: row.durationMs ?? undefined,
    total_violations: row.totalViolations,
    violations_by_severity: (row.violationsBySeverity ?? {}) as Record<string, number>,
    violations,
  };
}

function toViolation(row: ValidationViolationRow): Violation {
  return {
    rule_id: row.ruleId,
    severity: row.severity as Violation['severity'],
    message: row.message,
    repo: row.repo,
    file_path: row.filePath ?? undefined,
    line: row.line ?? undefined,
    validator: row.validator,
  };
}

/** Convert a ValidationCandidateRow to the LifecycleCandidate API type. */
function toLifecycleCandidate(row: ValidationCandidateRow): LifecycleCandidate {
  return {
    candidate_id: row.candidateId,
    rule_name: row.ruleName,
    rule_id: row.ruleId,
    tier: row.tier as LifecycleCandidate['tier'],
    status: row.status as CandidateStatus,
    source_repo: row.sourceRepo,
    entered_tier_at: row.enteredTierAt.toISOString(),
    last_validated_at: row.lastValidatedAt.toISOString(),
    pass_streak: row.passStreak,
    fail_streak: row.failStreak,
    total_runs: row.totalRuns,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/validation/runs
 * List validation runs with optional filters.
 *
 * Query params:
 *   status - Filter by status (running, passed, failed, error)
 *   repo   - Filter runs that include a specific repo
 *   limit  - Max results (default 50, max 200)
 *   offset - Pagination offset (default 0)
 */
router.get('/runs', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ runs: [], total: 0, limit: 50, offset: 0 });
    }

    const status = req.query.status as string | undefined;
    const repo = req.query.repo as string | undefined;
    const limitStr = req.query.limit as string | undefined;
    const offsetStr = req.query.offset as string | undefined;

    const VALID_STATUSES = ['running', 'passed', 'failed', 'error'];
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status filter',
        message: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    // Build WHERE conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(validationRuns.status, status));
    }
    if (repo) {
      // Filter runs whose repos jsonb array contains the given repo
      conditions.push(sql`${validationRuns.repos} @> ${sql.param(JSON.stringify([repo]))}::jsonb`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(validationRuns)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Get paginated runs (explicit columns to avoid missing projected_at column)
    const rows = await db
      .select(validationRunColumns)
      .from(validationRuns)
      .where(whereClause)
      .orderBy(desc(validationRuns.startedAt))
      .limit(limit)
      .offset(offset);

    // Strip full violations from list view for performance; return violation_count instead
    const summary = rows.map((row: ValidationRunRow) => {
      const run = toValidationRun(row);
      const { violations, ...rest } = run;
      return { ...rest, violation_count: run.total_violations };
    });

    res.json({ runs: summary, total, limit, offset });
  } catch (error) {
    console.error('Error listing validation runs:', error);
    res.status(500).json({
      error: 'Failed to list validation runs',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/validation/runs/:runId
 * Get a single validation run with violation details (server-side limited).
 *
 * Query params:
 *   vlimit - Max violations to return (default 200, max 1000)
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.status(404).json({ error: 'Validation run not found' });
    }

    const rows = await db
      .select(validationRunColumns)
      .from(validationRuns)
      .where(eq(validationRuns.runId, req.params.runId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Validation run not found' });
    }

    const vlimitStr = req.query.vlimit as string | undefined;
    const vlimit = Math.min(Math.max(parseInt(vlimitStr || '200', 10) || 200, 1), 1000);

    // Fetch violations with server-side limit to avoid unbounded memory usage
    const violationRows = await db
      .select(validationViolationColumns)
      .from(validationViolations)
      .where(eq(validationViolations.runId, req.params.runId))
      .orderBy(validationViolations.batchIndex, validationViolations.id)
      .limit(vlimit);

    const violations = violationRows.map((r: ValidationViolationRow) => toViolation(r));
    const run = toValidationRun(rows[0] as ValidationRunRow, violations);

    res.json(run);
  } catch (error) {
    console.error('Error getting validation run:', error);
    res.status(500).json({
      error: 'Failed to get validation run',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/validation/repos/:repoId/trends
 * Get violation trends for a specific repo.
 *
 * Query params:
 *   days - Number of days to look back (default 30, max 90)
 */
router.get('/repos/:repoId/trends', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ repo: req.params.repoId, trend: [] });
    }

    const repoId = req.params.repoId;
    const daysStr = req.query.days as string | undefined;
    const days = Math.min(Math.max(parseInt(daysStr || '30', 10) || 30, 1), 90);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find completed runs that include this repo within the time window
    const rows = await db
      .select(validationRunColumns)
      .from(validationRuns)
      .where(
        and(
          sql`${validationRuns.repos} @> ${sql.param(JSON.stringify([repoId]))}::jsonb`,
          ne(validationRuns.status, 'running'),
          gte(validationRuns.startedAt, cutoff)
        )
      )
      .orderBy(validationRuns.startedAt);

    // Build trend points with a single grouped query instead of N+1
    const runIds = rows.map((r) => r.runId);
    const trend: RepoTrendPoint[] = [];

    if (runIds.length > 0) {
      // Single query: get severity counts per run for this repo
      const violationCounts = await db
        .select({
          runId: validationViolations.runId,
          severity: validationViolations.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(validationViolations)
        .where(
          and(inArray(validationViolations.runId, runIds), eq(validationViolations.repo, repoId))
        )
        .groupBy(validationViolations.runId, validationViolations.severity);

      // Index counts by runId for O(1) lookup
      const countsByRun = new Map<string, { errors: number; warnings: number; infos: number }>();
      for (const vc of violationCounts) {
        let entry = countsByRun.get(vc.runId);
        if (!entry) {
          entry = { errors: 0, warnings: 0, infos: 0 };
          countsByRun.set(vc.runId, entry);
        }
        if (vc.severity === 'error') entry.errors = vc.count;
        else if (vc.severity === 'warning') entry.warnings = vc.count;
        else if (vc.severity === 'info') entry.infos = vc.count;
      }

      for (const row of rows) {
        const counts = countsByRun.get(row.runId) ?? { errors: 0, warnings: 0, infos: 0 };
        trend.push({
          date: row.startedAt.toISOString().slice(0, 10),
          errors: counts.errors,
          warnings: counts.warnings,
          infos: counts.infos,
          total: counts.errors + counts.warnings + counts.infos,
        });
      }
    }

    const result: RepoTrends = {
      repo: repoId,
      trend,
      latest_run_id: rows.at(-1)?.runId,
    };

    res.json(result);
  } catch (error) {
    console.error('Error getting repo trends:', error);
    res.status(500).json({
      error: 'Failed to get repo trends',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/validation/summary
 * Get summary stats across all validation runs.
 */
router.get('/summary', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({
        total_runs: 0,
        completed_runs: 0,
        running_runs: 0,
        unique_repos: 0,
        repos: [],
        pass_rate: 0,
        total_violations_by_severity: {},
      });
    }

    // Total and completed/running counts
    const statusCounts = await db
      .select({
        status: validationRuns.status,
        count: sql<number>`count(*)::int`,
      })
      .from(validationRuns)
      .groupBy(validationRuns.status);

    let totalRuns = 0;
    let completedRuns = 0;
    let runningRuns = 0;
    let passedRuns = 0;

    for (const row of statusCounts) {
      totalRuns += row.count;
      if (row.status === 'running') {
        runningRuns = row.count;
      } else {
        completedRuns += row.count;
        if (row.status === 'passed') {
          passedRuns = row.count;
        }
      }
    }

    // Unique repos across all runs (extracted in SQL to avoid loading all rows)
    const repoResult = await db
      .select({
        repo: sql<string>`DISTINCT jsonb_array_elements_text(${validationRuns.repos})`,
      })
      .from(validationRuns);

    const repoSet = new Set<string>();
    for (const row of repoResult) {
      repoSet.add(row.repo);
    }

    // Total violations by severity (from completed runs)
    const severityCounts = await db
      .select({
        severity: validationViolations.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(validationViolations)
      .innerJoin(validationRuns, eq(validationViolations.runId, validationRuns.runId))
      .where(ne(validationRuns.status, 'running'))
      .groupBy(validationViolations.severity);

    const totalBySeverity: Record<string, number> = {};
    for (const row of severityCounts) {
      totalBySeverity[row.severity] = row.count;
    }

    const passRate = completedRuns > 0 ? passedRuns / completedRuns : 0;

    res.json({
      total_runs: totalRuns,
      completed_runs: completedRuns,
      running_runs: runningRuns,
      unique_repos: repoSet.size,
      repos: Array.from(repoSet),
      pass_rate: passRate,
      total_violations_by_severity: totalBySeverity,
    });
  } catch (error) {
    console.error('Error getting validation summary:', error);
    res.status(500).json({
      error: 'Failed to get validation summary',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/validation/lifecycle/summary
 * Get lifecycle candidate summary: tier metrics and candidate list.
 *
 * Returns aggregate counts by status, per-tier breakdown with transition rates
 * and average time-at-tier, and the first `limit` candidates ordered by most
 * recently validated.
 *
 * When no candidates exist (e.g. OMN-2018 artifact store not yet deployed),
 * returns an empty summary so the client falls back to mock data gracefully.
 *
 * Query params:
 *   limit  - Max candidates to return (default 50, max 200)
 *   tier   - Filter candidates to a specific lifecycle tier
 *   status - Filter candidates to a specific candidate status
 */
router.get('/lifecycle/summary', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      const empty: LifecycleSummary = {
        total_candidates: 0,
        tiers: LIFECYCLE_TIERS.map((tier) => ({
          tier,
          count: 0,
          by_status: { pending: 0, pass: 0, fail: 0, quarantine: 0 },
          avg_days_at_tier: 0,
          transition_rate: 0,
        })),
        by_status: { pending: 0, pass: 0, fail: 0, quarantine: 0 },
        candidates: [],
      };
      return res.json(empty);
    }

    const limitStr = req.query.limit as string | undefined;
    const tierFilter = req.query.tier as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);

    const VALID_TIERS = ['observed', 'suggested', 'shadow_apply', 'promoted', 'default'];
    const VALID_STATUSES = ['pending', 'pass', 'fail', 'quarantine'];

    if (tierFilter && !VALID_TIERS.includes(tierFilter)) {
      return res.status(400).json({ error: 'Invalid tier filter' });
    }
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    // -----------------------------------------------------------------------
    // 1. Aggregate counts by tier and status in a single query
    // -----------------------------------------------------------------------
    const tierStatusCounts = await db
      .select({
        tier: validationCandidates.tier,
        status: validationCandidates.status,
        count: sql<number>`count(*)::int`,
      })
      .from(validationCandidates)
      .groupBy(validationCandidates.tier, validationCandidates.status);

    // Build tier and status maps
    const tierMap = new Map<string, Record<CandidateStatus, number>>();
    const globalByStatus: Record<CandidateStatus, number> = {
      pending: 0,
      pass: 0,
      fail: 0,
      quarantine: 0,
    };

    for (const row of tierStatusCounts) {
      const s = row.status as CandidateStatus;
      if (!tierMap.has(row.tier)) {
        tierMap.set(row.tier, { pending: 0, pass: 0, fail: 0, quarantine: 0 });
      }
      tierMap.get(row.tier)![s] = (tierMap.get(row.tier)![s] ?? 0) + row.count;
      globalByStatus[s] = (globalByStatus[s] ?? 0) + row.count;
    }

    const totalCandidates = Object.values(globalByStatus).reduce((a, b) => a + b, 0);

    // -----------------------------------------------------------------------
    // 2. Compute average days at tier per tier in a single aggregate query
    // -----------------------------------------------------------------------
    const avgDaysRows = await db
      .select({
        tier: validationCandidates.tier,
        avg_days: sql<number>`round(avg(extract(epoch from (now() - ${validationCandidates.enteredTierAt})) / 86400)::numeric, 1)::float`,
      })
      .from(validationCandidates)
      .groupBy(validationCandidates.tier);

    const avgDaysMap = new Map<string, number>();
    for (const row of avgDaysRows) {
      avgDaysMap.set(row.tier, row.avg_days ?? 0);
    }

    // -----------------------------------------------------------------------
    // 3. Build per-tier metrics (using static tier order from LIFECYCLE_TIERS)
    // -----------------------------------------------------------------------
    const tiers: LifecycleTierMetrics[] = LIFECYCLE_TIERS.map((tier) => {
      const byStatus = tierMap.get(tier) ?? { pending: 0, pass: 0, fail: 0, quarantine: 0 };
      const tierCount = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const avgDays = tier === 'default' ? 0 : (avgDaysMap.get(tier) ?? 0);

      // Transition rate: pass count / total at this tier.
      // Default tier has no next tier so transition_rate = 0.
      const transitionRate = tier === 'default' || tierCount === 0 ? 0 : byStatus.pass / tierCount;

      return {
        tier,
        count: tierCount,
        by_status: byStatus,
        avg_days_at_tier: avgDays,
        transition_rate: parseFloat(transitionRate.toFixed(2)),
      };
    });

    // -----------------------------------------------------------------------
    // 4. Fetch candidate list with optional filters
    // -----------------------------------------------------------------------
    const filterConditions = [];
    if (tierFilter) {
      filterConditions.push(eq(validationCandidates.tier, tierFilter));
    }
    if (statusFilter) {
      filterConditions.push(eq(validationCandidates.status, statusFilter));
    }

    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const candidateRows = await db
      .select(validationCandidateColumns)
      .from(validationCandidates)
      .where(whereClause)
      .orderBy(desc(validationCandidates.lastValidatedAt))
      .limit(limit);

    const candidates: LifecycleCandidate[] = candidateRows.map((row: ValidationCandidateRow) =>
      toLifecycleCandidate(row)
    );

    const result: LifecycleSummary = {
      total_candidates: totalCandidates,
      tiers,
      by_status: globalByStatus,
      candidates,
    };

    res.json(result);
  } catch (error) {
    console.error('Error getting lifecycle summary:', error);
    res.status(500).json({
      error: 'Failed to get lifecycle summary',
      message: 'Internal server error',
    });
  }
});

export default router;
