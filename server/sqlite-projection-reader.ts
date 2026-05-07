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

      case 'onex.snapshot.projection.delegation.summary.v1':
        return db.prepare(`
          SELECT
            COUNT(*)                                                                    AS total_events,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0)     AS quality_passed_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0)     AS quality_failed_count,
            COALESCE(AVG(latency_ms), 0)                                               AS avg_latency_ms,
            COALESCE(MAX(created_at), 0)                                               AS latest_event_at
          FROM delegation_events
        `).all() as Row[];

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

      default:
        return [];
    }
  }
}
