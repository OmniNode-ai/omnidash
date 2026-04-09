/**
 * Bloom eval suite result projection handler (OMN-8146).
 *
 * Projects bloom-eval-completed events into the intelligence_bloom_eval_results
 * table for the eval dashboard.
 *
 * Subscribes to: TOPIC_INTELLIGENCE_BLOOM_EVAL_COMPLETED
 *   onex.evt.omniintelligence.bloom-eval-completed.v1
 *
 * Payload fields (from node_bloom_eval_orchestrator):
 *   suite_id, spec_id, failure_mode, total_scenarios, passed_count,
 *   failure_rate, passed_threshold, correlation_id, emitted_at
 */

import { sql } from 'drizzle-orm';
import { TOPIC_INTELLIGENCE_BLOOM_EVAL_COMPLETED } from '@shared/topics';

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

const BLOOM_EVAL_TOPICS = new Set([TOPIC_INTELLIGENCE_BLOOM_EVAL_COMPLETED]);

export class BloomEvalProjectionHandler implements ProjectionHandler {
  readonly stats: ProjectionHandlerStats = createHandlerStats();

  constructor() {
    registerHandlerStats('BloomEvalProjectionHandler', this.stats);
  }

  canHandle(topic: string): boolean {
    return BLOOM_EVAL_TOPICS.has(topic);
  }

  async projectEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext,
    _meta: MessageMeta
  ): Promise<boolean> {
    this.stats.received++;

    if (topic === TOPIC_INTELLIGENCE_BLOOM_EVAL_COMPLETED) {
      const result = await this.projectBloomEvalCompleted(data, context);
      if (result) {
        this.stats.projected++;
      }
      return result;
    }

    return false;
  }

  private async projectBloomEvalCompleted(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) {
      this.stats.dropped.db_unavailable++;
      return false;
    }

    const suiteId = (data.suite_id as string) || (data.suiteId as string);
    if (!suiteId) {
      this.stats.dropped.missing_field++;
      return false;
    }

    const specId = (data.spec_id as string) || (data.specId as string);
    if (!specId) {
      this.stats.dropped.missing_field++;
      return false;
    }

    try {
      await db.execute(sql`
        INSERT INTO intelligence_bloom_eval_results (
          suite_id, spec_id, failure_mode,
          total_scenarios, passed_count, failure_rate, passed_threshold,
          correlation_id, emitted_at
        ) VALUES (
          ${suiteId}::uuid,
          ${specId}::uuid,
          ${(data.failure_mode as string) || ''},
          ${(data.total_scenarios as number) || 0},
          ${(data.passed_count as number) || 0},
          ${(data.failure_rate as number) || 0},
          ${Boolean(data.passed_threshold)},
          ${(data.correlation_id as string) || null},
          ${safeParseDate(data.emitted_at)}
        ) ON CONFLICT (suite_id, emitted_at) DO NOTHING
      `);
      return true;
    } catch (err) {
      if (isTableMissingError(err, 'intelligence_bloom_eval_results')) {
        this.stats.dropped.table_missing++;
        console.warn(
          '[BloomEvalProjectionHandler] intelligence_bloom_eval_results table does not exist yet'
        );
        return false;
      }
      throw err;
    }
  }
}
