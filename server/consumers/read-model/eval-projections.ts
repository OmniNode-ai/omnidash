/**
 * Eval report projection handler (OMN-6781).
 *
 * Projects eval-completed events into the eval_reports table for
 * the /eval-results dashboard page.
 */

import { sql } from 'drizzle-orm';
import { SUFFIX_CHANGE_CONTROL_EVAL_COMPLETED } from '@shared/topics';

import type {
  ProjectionHandler,
  ProjectionContext,
  MessageMeta,
  ProjectionHandlerStats,
} from './types';
import {
  isTableMissingError,
  createHandlerStats,
  registerHandlerStats,
  safeParseDate,
} from './types';

const EVAL_TOPICS = new Set([SUFFIX_CHANGE_CONTROL_EVAL_COMPLETED]);

export class EvalProjectionHandler implements ProjectionHandler {
  readonly stats: ProjectionHandlerStats = createHandlerStats();

  constructor() {
    registerHandlerStats('EvalProjectionHandler', this.stats);
  }

  canHandle(topic: string): boolean {
    return EVAL_TOPICS.has(topic);
  }

  async projectEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext,
    _meta: MessageMeta
  ): Promise<boolean> {
    this.stats.received++;

    if (topic === SUFFIX_CHANGE_CONTROL_EVAL_COMPLETED) {
      const result = await this.projectEvalCompleted(data, context);
      if (result) {
        this.stats.projected++;
      }
      // Drop reasons are tracked inside projectEvalCompleted
      return result;
    }

    return false;
  }

  private async projectEvalCompleted(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) {
      this.stats.dropped.db_unavailable++;
      return false;
    }

    const reportId = (data.report_id as string) || (data.reportId as string);
    if (!reportId) {
      this.stats.dropped.missing_field++;
      return false;
    }

    const summary = (data.summary as Record<string, unknown>) || {};

    try {
      await db.execute(sql`
        INSERT INTO eval_reports (
          report_id, suite_id, suite_version, generated_at,
          total_tasks, onex_better_count, onex_worse_count, neutral_count,
          avg_latency_delta_ms, avg_token_delta,
          avg_success_rate_on, avg_success_rate_off,
          pattern_hit_rate_on, raw_payload
        ) VALUES (
          ${reportId},
          ${(data.suite_id as string) || ''},
          ${(data.suite_version as string) || ''},
          ${safeParseDate(data.generated_at)},
          ${(summary.total_tasks as number) || 0},
          ${(summary.onex_better_count as number) || 0},
          ${(summary.onex_worse_count as number) || 0},
          ${(summary.neutral_count as number) || 0},
          ${(summary.avg_latency_delta_ms as number) || 0},
          ${(summary.avg_token_delta as number) || 0},
          ${(summary.avg_success_rate_on as number) || 0},
          ${(summary.avg_success_rate_off as number) || 0},
          ${(summary.pattern_hit_rate_on as number) || 0},
          ${JSON.stringify(data)}
        ) ON CONFLICT (report_id) DO NOTHING
      `);
      return true;
    } catch (err) {
      if (isTableMissingError(err, 'eval_reports')) {
        this.stats.dropped.table_missing++;
        console.warn('[EvalProjectionHandler] eval_reports table does not exist yet');
        return false;
      }
      throw err;
    }
  }
}
