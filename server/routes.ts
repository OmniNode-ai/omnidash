import { Router } from 'express';
import { query } from './db.js';

const router = Router();

// ── Cost Trends → llm_cost_aggregates ─────────────────────────────────────────

router.get('/api/intelligence/cost/trends', async (req, res) => {
  const granularity = req.query.granularity === 'hour' ? 'hour' : 'day';
  try {
    const rows = await query(
      `SELECT bucket_time, model_name,
              total_cost_usd, total_tokens,
              prompt_tokens, completion_tokens, request_count
       FROM llm_cost_aggregates
       WHERE granularity = $1
       ORDER BY bucket_time DESC
       LIMIT 200`,
      [granularity]
    );
    res.json(rows);
  } catch (err) {
    console.error('[routes] /api/intelligence/cost/trends error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Delegation → delegation_events ────────────────────────────────────────────

router.get('/api/delegation/summary', async (_req, res) => {
  try {
    const [totalsRow, byTaskRow] = await Promise.all([
      query<{
        total: string;
        pass_count: string;
        total_savings_usd: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE quality_gate_passed)::text AS pass_count,
                COALESCE(SUM(savings_usd), 0)::text AS total_savings_usd
         FROM delegation_events`
      ),
      query<{ task_type: string; count: string }>(
        `SELECT task_type, COUNT(*)::text AS count
         FROM delegation_events
         GROUP BY task_type
         ORDER BY count DESC
         LIMIT 20`
      ),
    ]);
    const totals = totalsRow[0] ?? { total: '0', pass_count: '0', total_savings_usd: '0' };
    const total = parseInt(totals.total, 10);
    res.json({
      totalDelegations: total,
      qualityGatePassRate: total > 0 ? parseInt(totals.pass_count, 10) / total : 0,
      totalSavingsUsd: parseFloat(totals.total_savings_usd),
      byTaskType: byTaskRow.map((r) => ({ taskType: r.task_type, count: parseInt(r.count, 10) })),
    });
  } catch (err) {
    console.error('[routes] /api/delegation/summary error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Routing Decisions → llm_routing_decisions ─────────────────────────────────

router.get('/api/llm-routing/decisions', async (_req, res) => {
  try {
    const rows = await query<{
      id: string;
      created_at: string;
      llm_agent: string;
      fuzzy_agent: string;
      agreement: boolean;
      llm_confidence: number;
      fuzzy_confidence: number;
      cost_usd: number;
    }>(
      `SELECT id, created_at,
              llm_agent, fuzzy_agent, agreement,
              llm_confidence, fuzzy_confidence, cost_usd
       FROM llm_routing_decisions
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error('[routes] /api/llm-routing/decisions error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Baselines ROI → baselines_snapshots + baselines_comparisons ───────────────

router.get('/api/baselines/summary', async (_req, res) => {
  try {
    const snapshotRows = await query<{
      snapshot_id: string;
      computed_at_utc: string;
      token_delta: number;
      time_delta_ms: number;
      retry_delta: number;
      confidence: number;
    }>(
      `SELECT snapshot_id, computed_at_utc,
              token_delta, time_delta_ms, retry_delta, confidence
       FROM baselines_snapshots
       ORDER BY computed_at_utc DESC
       LIMIT 1`
    );

    if (snapshotRows.length === 0) {
      // T21 / M7: 204 No Content instead of `res.json(null)` so typed
      // consumers don't have to special-case a literal null body. Callers
      // that expected a 200-with-null branch must check the status.
      return res.status(204).end();
    }

    const snap = snapshotRows[0];

    const recRows = await query<{ recommendation: string; count: string }>(
      `SELECT recommendation, COUNT(*)::text AS count
       FROM baselines_comparisons
       WHERE snapshot_id = $1
       GROUP BY recommendation`,
      [snap.snapshot_id]
    );

    const recs = { promote: 0, shadow: 0, suppress: 0, fork: 0 } as Record<string, number>;
    for (const r of recRows) {
      if (r.recommendation in recs) recs[r.recommendation] = parseInt(r.count, 10);
    }

    return res.json({
      snapshotId: snap.snapshot_id,
      capturedAt: snap.computed_at_utc,
      tokenDelta: snap.token_delta ?? 0,
      timeDeltaMs: snap.time_delta_ms ?? 0,
      retryDelta: snap.retry_delta ?? 0,
      recommendations: recs,
      confidence: snap.confidence ?? 0,
    });
  } catch (err) {
    console.error('[routes] /api/baselines/summary error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Quality Scores → pattern_quality_metrics ──────────────────────────────────

router.get('/api/intelligence/quality/summary', async (_req, res) => {
  try {
    const [statsRow, distRows] = await Promise.all([
      query<{ mean_score: number; total: string }>(
        `SELECT AVG(quality_score) AS mean_score, COUNT(*)::text AS total
         FROM pattern_quality_metrics`
      ),
      // The QualityScorePanel widget renders 5 bars (BAR_COUNT=5,
      // BUCKET_MIDPOINTS length 5). Server returns the matching 5 buckets
      // so the widget's per-index BUCKET_MIDPOINTS lookup never falls off
      // the end. Aligning the consumer's contract; do not change the
      // bucket count without updating the widget at the same time.
      query<{ bucket: string; count: string }>(
        `SELECT WIDTH_BUCKET(quality_score, 0, 1, 5)::text AS bucket,
                COUNT(*)::text AS count
         FROM pattern_quality_metrics
         GROUP BY bucket
         ORDER BY bucket`
      ),
    ]);

    const stats = statsRow[0] ?? { mean_score: 0, total: '0' };
    res.json({
      meanScore: parseFloat(String(stats.mean_score ?? '0')),
      totalMeasurements: parseInt(stats.total, 10),
      distribution: distRows.map((r) => ({ bucket: r.bucket, count: parseInt(r.count, 10) })),
    });
  } catch (err) {
    console.error('[routes] /api/intelligence/quality/summary error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Readiness Gate (synthetic from platform health checks) ───────────────────
// There is no dedicated readiness table yet; derive from available projection data.

router.get('/api/readiness/summary', async (_req, res) => {
  try {
    const [costRow, delegRow, routingRow, qualityRow] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM llm_cost_aggregates`),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM delegation_events`),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM llm_routing_decisions`),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM pattern_quality_metrics`),
    ]);

    const toStatus = (n: number) => (n > 0 ? 'PASS' : 'WARN') as 'PASS' | 'WARN' | 'FAIL';

    const dimensions = [
      { name: 'Cost Data', status: toStatus(parseInt(costRow[0]?.count ?? '0', 10)), detail: `${costRow[0]?.count ?? 0} cost records` },
      { name: 'Delegation', status: toStatus(parseInt(delegRow[0]?.count ?? '0', 10)), detail: `${delegRow[0]?.count ?? 0} delegation events` },
      { name: 'Routing', status: toStatus(parseInt(routingRow[0]?.count ?? '0', 10)), detail: `${routingRow[0]?.count ?? 0} routing decisions` },
      { name: 'Quality', status: toStatus(parseInt(qualityRow[0]?.count ?? '0', 10)), detail: `${qualityRow[0]?.count ?? 0} quality records` },
    ];

    const fails = dimensions.filter((d) => d.status === 'FAIL').length;
    const warns = dimensions.filter((d) => d.status === 'WARN').length;
    const overallStatus = fails > 0 ? 'FAIL' : warns > 0 ? 'WARN' : 'PASS';

    res.json({ dimensions, overallStatus, lastCheckedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[routes] /api/readiness/summary error:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

// ── Recent Events (for EventStream initial load) ──────────────────────────────

router.get('/api/events/recent', async (_req, res) => {
  try {
    const rows = await query<{
      event_id: string;
      event_type: string;
      source: string;
      correlation_id: string;
      timestamp: string;
    }>(
      `SELECT event_id AS id, event_type, source, correlation_id, timestamp
       FROM event_bus_events
       ORDER BY timestamp DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    // event_bus_events may not exist in this schema — return empty gracefully
    console.warn('[routes] /api/events/recent: table may not exist, returning []');
    res.json([]);
  }
});

export default router;
