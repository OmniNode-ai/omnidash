/**
 * Compliance Evaluations API Routes (OMN-5285)
 *
 * REST endpoints for the Compliance Dashboard:
 *   GET /api/compliance         — recent evaluations + pass/fail summary
 *   GET /api/compliance/summary — aggregated pass/fail stats by repo and rule_set
 *   GET /api/compliance/trend   — score trend over time
 *
 * Data source: compliance_evaluations table (migration 0024).
 * Source topic: onex.evt.omniintelligence.compliance-evaluated.v1
 */

import { Router } from 'express';
import { desc, sql } from 'drizzle-orm';
import { getIntelligenceDb } from './storage';
import { complianceEvaluations } from '@shared/intelligence-schema';

const router = Router();

const VALID_WINDOWS = ['24h', '7d', '30d'] as const;
type TimeWindow = (typeof VALID_WINDOWS)[number];

function windowToInterval(w: TimeWindow): string {
  switch (w) {
    case '24h':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
  }
}

function safeWindow(raw: unknown): TimeWindow {
  if (typeof raw === 'string' && VALID_WINDOWS.includes(raw as TimeWindow)) {
    return raw as TimeWindow;
  }
  return '7d';
}

async function tableExists(): Promise<boolean> {
  try {
    await getIntelligenceDb().execute(sql`SELECT 1 FROM compliance_evaluations LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// GET /api/compliance?window=7d&limit=50
// Returns recent evaluations + top-level pass/fail summary
// ============================================================================

router.get('/', async (req, res) => {
  const window = safeWindow(req.query.window);
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
  const interval = windowToInterval(window);

  const empty = {
    summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
    evaluations: [],
  };

  if (!(await tableExists())) {
    return res.json(empty);
  }

  try {
    const [summary] = await getIntelligenceDb()
      .select({
        total: sql<number>`COUNT(*)::int`,
        passed: sql<number>`COUNT(*) FILTER (WHERE ${complianceEvaluations.pass} = true)::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${complianceEvaluations.pass} = false)::int`,
        avgScore: sql<number>`ROUND(AVG(${complianceEvaluations.score})::numeric, 4)`,
      })
      .from(complianceEvaluations)
      .where(
        sql`${complianceEvaluations.eventTimestamp} > NOW() - INTERVAL ${sql.raw(`'${interval}'`)}`
      );

    const total = summary?.total ?? 0;
    const passed = summary?.passed ?? 0;
    const passRate = total > 0 ? parseFloat(((passed / total) * 100).toFixed(1)) : 0;

    const rows = await getIntelligenceDb()
      .select()
      .from(complianceEvaluations)
      .where(
        sql`${complianceEvaluations.eventTimestamp} > NOW() - INTERVAL ${sql.raw(`'${interval}'`)}`
      )
      .orderBy(desc(complianceEvaluations.eventTimestamp))
      .limit(limit);

    return res.json({
      summary: {
        total,
        passed,
        failed: summary?.failed ?? 0,
        passRate,
        avgScore: parseFloat(String(summary?.avgScore ?? 0)),
      },
      evaluations: rows.map((r) => ({
        id: r.id,
        evaluationId: r.evaluationId,
        repo: r.repo,
        ruleSet: r.ruleSet,
        score: r.score,
        violations: r.violations,
        pass: r.pass,
        eventTimestamp: r.eventTimestamp?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    console.error('[compliance-routes] GET /api/compliance error:', err);
    return res.status(500).json({ error: 'Failed to fetch compliance evaluations' });
  }
});

// ============================================================================
// GET /api/compliance/summary?window=7d
// Aggregated pass/fail breakdown by repo and rule_set
// ============================================================================

router.get('/summary', async (req, res) => {
  const window = safeWindow(req.query.window);
  const interval = windowToInterval(window);

  const empty = { byRepo: [], byRuleSet: [] };

  if (!(await tableExists())) {
    return res.json(empty);
  }

  try {
    const byRepo = await getIntelligenceDb()
      .select({
        repo: complianceEvaluations.repo,
        total: sql<number>`COUNT(*)::int`,
        passed: sql<number>`COUNT(*) FILTER (WHERE ${complianceEvaluations.pass} = true)::int`,
        avgScore: sql<number>`ROUND(AVG(${complianceEvaluations.score})::numeric, 4)`,
      })
      .from(complianceEvaluations)
      .where(
        sql`${complianceEvaluations.eventTimestamp} > NOW() - INTERVAL ${sql.raw(`'${interval}'`)}`
      )
      .groupBy(complianceEvaluations.repo);

    const byRuleSet = await getIntelligenceDb()
      .select({
        ruleSet: complianceEvaluations.ruleSet,
        total: sql<number>`COUNT(*)::int`,
        passed: sql<number>`COUNT(*) FILTER (WHERE ${complianceEvaluations.pass} = true)::int`,
        avgScore: sql<number>`ROUND(AVG(${complianceEvaluations.score})::numeric, 4)`,
      })
      .from(complianceEvaluations)
      .where(
        sql`${complianceEvaluations.eventTimestamp} > NOW() - INTERVAL ${sql.raw(`'${interval}'`)}`
      )
      .groupBy(complianceEvaluations.ruleSet);

    return res.json({
      byRepo: byRepo.map((r) => ({
        repo: r.repo,
        total: r.total,
        passed: r.passed,
        failed: r.total - r.passed,
        passRate: r.total > 0 ? parseFloat(((r.passed / r.total) * 100).toFixed(1)) : 0,
        avgScore: parseFloat(String(r.avgScore ?? 0)),
      })),
      byRuleSet: byRuleSet.map((r) => ({
        ruleSet: r.ruleSet,
        total: r.total,
        passed: r.passed,
        failed: r.total - r.passed,
        passRate: r.total > 0 ? parseFloat(((r.passed / r.total) * 100).toFixed(1)) : 0,
        avgScore: parseFloat(String(r.avgScore ?? 0)),
      })),
    });
  } catch (err) {
    console.error('[compliance-routes] GET /api/compliance/summary error:', err);
    return res.status(500).json({ error: 'Failed to fetch compliance summary' });
  }
});

// ============================================================================
// GET /api/compliance/trend?window=7d
// Score trend bucketed by hour (24h) or day (7d/30d)
// ============================================================================

router.get('/trend', async (req, res) => {
  const window = safeWindow(req.query.window);
  const interval = windowToInterval(window);
  const truncUnit = window === '24h' ? 'hour' : 'day';

  if (!(await tableExists())) {
    return res.json({ trend: [] });
  }

  try {
    const trend = await getIntelligenceDb()
      .select({
        period: sql<string>`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${complianceEvaluations.eventTimestamp})::text`,
        total: sql<number>`COUNT(*)::int`,
        passed: sql<number>`COUNT(*) FILTER (WHERE ${complianceEvaluations.pass} = true)::int`,
        avgScore: sql<number>`ROUND(AVG(${complianceEvaluations.score})::numeric, 4)`,
      })
      .from(complianceEvaluations)
      .where(
        sql`${complianceEvaluations.eventTimestamp} > NOW() - INTERVAL ${sql.raw(`'${interval}'`)}`
      )
      .groupBy(
        sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${complianceEvaluations.eventTimestamp})`
      )
      .orderBy(
        sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${complianceEvaluations.eventTimestamp}) ASC`
      );

    return res.json({
      trend: trend.map((t) => ({
        period: t.period,
        total: t.total,
        passed: t.passed,
        failed: t.total - t.passed,
        passRate: t.total > 0 ? parseFloat(((t.passed / t.total) * 100).toFixed(1)) : 0,
        avgScore: parseFloat(String(t.avgScore ?? 0)),
      })),
    });
  } catch (err) {
    console.error('[compliance-routes] GET /api/compliance/trend error:', err);
    return res.status(500).json({ error: 'Failed to fetch compliance trend' });
  }
});

export default router;
