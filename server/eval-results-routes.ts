/**
 * Eval Results API routes (OMN-6780).
 *
 * GET /api/eval-results/latest — returns the most recent eval report
 * GET /api/eval-results — returns all eval reports (paginated)
 */

import type { Express } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export function registerEvalResultsRoutes(app: Express, db: NodePgDatabase | null): void {
  app.get('/api/eval-results/latest', async (_req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const result = await db.execute({
        sql: `
          SELECT report_id, suite_id, suite_version, generated_at,
                 total_tasks, onex_better_count, onex_worse_count, neutral_count,
                 avg_latency_delta_ms, avg_token_delta,
                 avg_success_rate_on, avg_success_rate_off,
                 pattern_hit_rate_on, raw_payload
          FROM eval_reports
          ORDER BY generated_at DESC
          LIMIT 1
        `,
        params: [],
      });

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ error: 'No eval reports found' });
      }

      const row = result.rows[0] as Record<string, unknown>;
      const rawPayload = row.raw_payload;

      // If we have the raw payload, return it directly (it contains the full report)
      if (rawPayload && typeof rawPayload === 'object') {
        return res.json(rawPayload);
      }

      // Otherwise construct from DB columns
      return res.json({
        report_id: row.report_id,
        suite_id: row.suite_id,
        suite_version: row.suite_version,
        generated_at: row.generated_at,
        pairs: [],
        summary: {
          total_tasks: row.total_tasks,
          onex_better_count: row.onex_better_count,
          onex_worse_count: row.onex_worse_count,
          neutral_count: row.neutral_count,
          avg_latency_delta_ms: row.avg_latency_delta_ms,
          avg_token_delta: row.avg_token_delta,
          avg_success_rate_on: row.avg_success_rate_on,
          avg_success_rate_off: row.avg_success_rate_off,
          pattern_hit_rate_on: row.pattern_hit_rate_on,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('eval_reports') && msg.includes('does not exist')) {
        return res.status(404).json({ error: 'eval_reports table not created yet' });
      }
      console.error('[eval-results] Error fetching latest report:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/eval-results', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);

    try {
      const result = await db.execute({
        sql: `
          SELECT report_id, suite_id, suite_version, generated_at,
                 total_tasks, onex_better_count, onex_worse_count, neutral_count,
                 avg_latency_delta_ms, avg_token_delta,
                 avg_success_rate_on, avg_success_rate_off, pattern_hit_rate_on
          FROM eval_reports
          ORDER BY generated_at DESC
          LIMIT $1
        `,
        params: [limit],
      });

      return res.json({ reports: result.rows || [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('eval_reports') && msg.includes('does not exist')) {
        return res.json({ reports: [] });
      }
      console.error('[eval-results] Error fetching reports:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
