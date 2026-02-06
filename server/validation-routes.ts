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
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import { validationRuns, validationViolations } from '@shared/intelligence-schema';
import type {
  ValidationRun,
  Violation,
  RepoTrends,
  RepoTrendPoint,
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
} from '@shared/validation-types';

const router = Router();

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

// ============================================================================
// Helper: reconstruct a ValidationRun from DB rows
// ============================================================================

function toValidationRun(
  row: typeof validationRuns.$inferSelect,
  violations: Violation[] = []
): ValidationRun {
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

function toViolation(row: typeof validationViolations.$inferSelect): Violation {
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

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    // Build WHERE conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(validationRuns.status, status));
    }
    if (repo) {
      // Filter runs whose repos jsonb array contains the given repo
      conditions.push(sql`${validationRuns.repos} @> ${JSON.stringify([repo])}::jsonb`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(validationRuns)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Get paginated runs
    const rows = await db
      .select()
      .from(validationRuns)
      .where(whereClause)
      .orderBy(desc(validationRuns.startedAt))
      .limit(limit)
      .offset(offset);

    // Strip full violations from list view for performance; return violation_count instead
    const summary = rows.map((row) => {
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
 * Get a single validation run with full violation details.
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.status(404).json({ error: 'Validation run not found' });
    }

    const rows = await db
      .select()
      .from(validationRuns)
      .where(eq(validationRuns.runId, req.params.runId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Validation run not found' });
    }

    // Fetch all violations for this run
    const violationRows = await db
      .select()
      .from(validationViolations)
      .where(eq(validationViolations.runId, req.params.runId))
      .orderBy(validationViolations.batchIndex, validationViolations.id);

    const violations = violationRows.map(toViolation);
    const run = toValidationRun(rows[0], violations);

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
      .select()
      .from(validationRuns)
      .where(
        and(
          sql`${validationRuns.repos} @> ${JSON.stringify([repoId])}::jsonb`,
          sql`${validationRuns.status} != 'running'`,
          gte(validationRuns.startedAt, cutoff)
        )
      )
      .orderBy(validationRuns.startedAt);

    // Build trend points from runs by querying repo-specific violations
    const trend: RepoTrendPoint[] = [];

    for (const row of rows) {
      const repoViolations = await db
        .select({
          severity: validationViolations.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(validationViolations)
        .where(
          and(eq(validationViolations.runId, row.runId), eq(validationViolations.repo, repoId))
        )
        .groupBy(validationViolations.severity);

      let errors = 0;
      let warnings = 0;
      let infos = 0;
      for (const sv of repoViolations) {
        if (sv.severity === 'error') errors = sv.count;
        else if (sv.severity === 'warning') warnings = sv.count;
        else if (sv.severity === 'info') infos = sv.count;
      }

      trend.push({
        date: row.startedAt.toISOString().slice(0, 10),
        errors,
        warnings,
        infos,
        total: errors + warnings + infos,
      });
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

    // Unique repos across all runs
    const repoResult = await db.select({ repos: validationRuns.repos }).from(validationRuns);

    const repoSet = new Set<string>();
    for (const row of repoResult) {
      const repos = row.repos as string[];
      for (const r of repos) repoSet.add(r);
    }

    // Total violations by severity (from completed runs)
    const severityCounts = await db
      .select({
        severity: validationViolations.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(validationViolations)
      .innerJoin(validationRuns, eq(validationViolations.runId, validationRuns.runId))
      .where(sql`${validationRuns.status} != 'running'`)
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

export default router;
