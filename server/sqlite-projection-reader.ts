import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Default DB path mirrors the Python adapter in omniclaude/delegation/sqlite_adapter.py
const DEFAULT_DB_PATH = join(homedir(), '.omninode', 'delegation', 'delegation.sqlite');

function expandHomedir(p: string): string {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export interface SqliteProjectionReaderOptions {
  dbPath?: string;
}

type Row = Record<string, unknown>;

/**
 * Reads delegation projection rows from the SQLite database written by the
 * omniclaude delegation daemon. Maps omnidash topic names to their backing
 * table queries.
 *
 * Only reads from pre-materialized projection tables — no client-side
 * aggregation or cost computation. All totals come from savings_estimates rows
 * as written by the Python adapter.
 */
export class SqliteProjectionReader {
  private readonly dbPath: string;

  constructor(options: SqliteProjectionReaderOptions = {}) {
    this.dbPath = options.dbPath ? expandHomedir(options.dbPath) : DEFAULT_DB_PATH;
  }

  readProjection(topic: string): Row[] {
    if (!existsSync(this.dbPath)) return [];

    const db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
    try {
      return this.query(db, topic);
    } finally {
      db.close();
    }
  }

  private query(db: Database.Database, topic: string): Row[] {
    switch (topic) {
      case 'onex.snapshot.projection.delegation.decisions.v1':
        return db.prepare(`
          SELECT
            id,
            correlation_id,
            session_id,
            tool_use_id,
            hook_name,
            task_type,
            delegated_to,
            model_name,
            quality_gate_passed,
            quality_gate_detail,
            latency_ms,
            input_redaction_policy,
            contract_version,
            created_at
          FROM delegation_events
          ORDER BY created_at DESC
          LIMIT 500
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.summary.v1': {
        const summary = db.prepare(`
          SELECT
            COUNT(*)                                                                    AS total_events,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0)     AS quality_passed_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0)     AS quality_failed_count,
            COALESCE(AVG(latency_ms), 0)                                               AS avg_latency_ms,
            COALESCE(MAX(created_at), 0)                                               AS latest_event_at
          FROM delegation_events
        `).get() as Row;
        const byTaskType = db.prepare(`
          SELECT task_type AS taskType, COUNT(*) AS count
          FROM delegation_events GROUP BY task_type ORDER BY count DESC
        `).all() as Row[];
        const byModel = db.prepare(`
          SELECT delegated_to AS model, COUNT(*) AS count
          FROM delegation_events GROUP BY delegated_to ORDER BY count DESC
        `).all() as Row[];
        const total = (summary.total_events as number) || 0;
        const passed = (summary.quality_passed_count as number) || 0;
        return [{
          total_events: total,
          quality_passed_count: passed,
          quality_failed_count: (summary.quality_failed_count as number) || 0,
          avg_latency_ms: (summary.avg_latency_ms as number) || 0,
          latest_event_at: (summary.latest_event_at as number) || 0,
          totalDelegations: total,
          qualityGatePassRate: total > 0 ? passed / total : 0,
          qualityGatePassed: passed,
          qualityGateTotal: total,
          totalSavingsUsd: 0,
          avgLatencyMs: (summary.avg_latency_ms as number) || 0,
          latestEventAt: (summary.latest_event_at as number) || 0,
          byTaskType,
          byModel,
        }];
      }

      case 'onex.snapshot.projection.llm_cost.v1':
        return db.prepare(`
          SELECT
            id,
            input_hash,
            model_id,
            prompt_tokens,
            completion_tokens,
            estimated_cost_usd,
            usage_source,
            token_provenance,
            created_at
          FROM llm_call_metrics
          ORDER BY created_at DESC
          LIMIT 500
        `).all() as Row[];

      case 'onex.snapshot.projection.savings.v1':
        return db.prepare(`
          SELECT
            id,
            session_id,
            event_timestamp,
            model_local,
            model_cloud_baseline,
            local_cost_usd,
            cloud_cost_usd,
            savings_usd,
            baseline_model,
            pricing_manifest_version,
            savings_method,
            usage_source,
            created_at
          FROM savings_estimates
          ORDER BY created_at DESC
          LIMIT 500
        `).all() as Row[];

      case 'onex.snapshot.projection.savings.summary.v1':
        return db.prepare(`
          SELECT
            COUNT(*)                          AS event_count,
            COALESCE(SUM(local_cost_usd), 0)  AS total_local_cost_usd,
            COALESCE(SUM(cloud_cost_usd), 0)  AS total_cloud_cost_usd,
            COALESCE(SUM(savings_usd), 0)     AS total_savings_usd
          FROM savings_estimates
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.savings.v1':
        return db.prepare(`
          SELECT
            id,
            session_id,
            event_timestamp,
            model_local,
            model_cloud_baseline,
            local_cost_usd,
            cloud_cost_usd,
            savings_usd,
            baseline_model,
            pricing_manifest_version,
            savings_method,
            usage_source,
            created_at
          FROM savings_estimates
          ORDER BY created_at DESC
          LIMIT 500
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.model-routing.v1':
        return db.prepare(`
          SELECT
            delegated_to                              AS model_alias,
            model_name,
            task_type,
            COUNT(*)                                  AS event_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0) AS quality_passed,
            COALESCE(AVG(latency_ms), 0)              AS avg_latency_ms,
            COALESCE(MAX(created_at), 0)              AS latest_event_at
          FROM delegation_events
          GROUP BY delegated_to, model_name, task_type
          ORDER BY event_count DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.quality-gate.v1':
        return db.prepare(`
          SELECT
            quality_gate_detail                       AS check_detail,
            COUNT(*)                                  AS total_checks,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0) AS passed_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0) AS failed_count,
            COALESCE(AVG(quality_gates_checked), 0)   AS avg_gates_checked,
            COALESCE(AVG(quality_gates_failed), 0)    AS avg_gates_failed
          FROM delegation_events
          GROUP BY quality_gate_detail
          ORDER BY total_checks DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.ab-compare.v1':
        return db.prepare(`
          SELECT
            COALESCE(correlation_id, input_hash) AS correlation_id,
            model_id,
            COALESCE(prompt_tokens, 0)                              AS prompt_tokens,
            COALESCE(completion_tokens, 0)                          AS completion_tokens,
            COALESCE(total_tokens, prompt_tokens + completion_tokens, 0) AS total_tokens,
            estimated_cost_usd,
            latency_ms,
            usage_source,
            created_at,
            task_description
          FROM llm_call_metrics
          WHERE correlation_id IS NOT NULL
            AND correlation_id LIKE 'ab-%'
          ORDER BY created_at DESC
          LIMIT 200
        `).all() as Row[];

      case 'onex.snapshot.projection.cost.summary.v1':
        return db.prepare(`
          SELECT
            COUNT(*)                                  AS call_count,
            COALESCE(SUM(prompt_tokens), 0)           AS total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)       AS total_completion_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)      AS total_cost_usd,
            COALESCE(AVG(estimated_cost_usd), 0)      AS avg_cost_usd,
            COALESCE(MAX(created_at), 0)              AS latest_event_at
          FROM llm_call_metrics
        `).all() as Row[];

      case 'onex.snapshot.projection.cost.token_usage.v1':
        return db.prepare(`
          SELECT
            model_id,
            COUNT(*)                                  AS call_count,
            COALESCE(SUM(prompt_tokens), 0)           AS total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)       AS total_completion_tokens,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS total_tokens,
            usage_source,
            COALESCE(MAX(created_at), 0)              AS latest_event_at
          FROM llm_call_metrics
          GROUP BY model_id, usage_source
          ORDER BY total_tokens DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.token-usage.v1':
        return db.prepare(`
          SELECT
            delegated_to                              AS model_alias,
            model_name,
            COUNT(*)                                  AS delegation_count,
            COALESCE(SUM(tokens_input), 0)            AS total_tokens_input,
            COALESCE(SUM(tokens_output), 0)           AS total_tokens_output,
            COALESCE(SUM(tokens_input + tokens_output), 0) AS total_tokens,
            COALESCE(SUM(tokens_to_compliance), 0)    AS total_tokens_to_compliance,
            COALESCE(MAX(created_at), 0)              AS latest_event_at
          FROM delegation_events
          GROUP BY delegated_to, model_name
          ORDER BY total_tokens DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.live-events.v1':
        return db.prepare(`
          SELECT
            id,
            envelope,
            created_at
          FROM delegation_event_log
          ORDER BY created_at DESC
          LIMIT 200
        `).all() as Row[];

      // No backing tables in the delegation SQLite DB for these topics yet.
      case 'onex.snapshot.projection.baselines.roi.v1':
      case 'onex.snapshot.projection.baselines.quality.v1':
      case 'onex.snapshot.projection.overnight.v1':
      case 'onex.snapshot.projection.registration.v1':
        return [];

      default:
        return [];
    }
  }
}
