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

      case 'onex.snapshot.projection.delegation.savings.v1': {
        const sessions = db.prepare(`
          SELECT
            session_id, task_type, model_name,
            COALESCE(cost_savings_usd, 0) AS savings_usd,
            0 AS local_cost_usd,
            COALESCE(cost_savings_usd, 0) AS cloud_cost_usd,
            delegated_to AS baseline_model,
            'v1' AS pricing_manifest_version,
            'estimated' AS savings_method,
            'measured' AS usage_source,
            tokens_input AS prompt_tokens,
            tokens_output AS completion_tokens,
            latency_ms,
            created_at,
            prompt_text,
            response_text
          FROM delegation_events
          ORDER BY created_at DESC
        `).all() as Row[];
        const cumSavings = sessions.reduce((acc, s) => acc + ((s.savings_usd as number) || 0), 0);
        const cumCloud = sessions.reduce((acc, s) => acc + ((s.cloud_cost_usd as number) || 0), 0);
        return [{
          cumulative_savings_usd: cumSavings,
          cumulative_local_cost_usd: 0,
          cumulative_cloud_cost_usd: cumCloud,
          baseline_model: 'claude-opus',
          pricing_manifest_version: 'v1',
          session_count: sessions.length,
          sessions,
          captured_at: new Date().toISOString(),
          provisioned: true,
        }];
      }

      case 'onex.snapshot.projection.delegation.model-routing.v1': {
        const rows = db.prepare(`
          SELECT delegated_to AS model_name, task_type, COUNT(*) AS count
          FROM delegation_events
          GROUP BY delegated_to, task_type
          ORDER BY count DESC
        `).all() as Row[];
        const totalDel = rows.reduce((acc, r) => acc + ((r.count as number) || 0), 0);

        // Per-delegation routing traces for the decision trace section
        const decisionTraces = db.prepare(`
          SELECT
            id,
            correlation_id,
            task_type,
            model_name,
            delegated_to,
            routing_rule,
            routing_confidence,
            routing_candidates,
            latency_ms,
            quality_gate_passed,
            created_at
          FROM delegation_events
          ORDER BY created_at DESC
          LIMIT 100
        `).all() as Row[];

        const modelMap = new Map<string, { total: number; topTask: string; topCount: number; tasks: string[]; latSum: number; latCount: number; qgPass: number; qgTotal: number }>();
        const allEventsForModel = db.prepare(`
          SELECT delegated_to AS model_name, latency_ms, quality_gate_passed FROM delegation_events
        `).all() as Row[];
        for (const e of allEventsForModel) {
          const m = e.model_name as string;
          const existing = modelMap.get(m) || { total: 0, topTask: '', topCount: 0, tasks: [], latSum: 0, latCount: 0, qgPass: 0, qgTotal: 0 };
          existing.qgTotal++;
          if (e.quality_gate_passed === 1) existing.qgPass++;
          if (e.latency_ms != null) { existing.latSum += (e.latency_ms as number); existing.latCount++; }
          modelMap.set(m, existing);
        }
        for (const r of rows) {
          const m = r.model_name as string;
          const existing = modelMap.get(m) || { total: 0, topTask: '', topCount: 0, tasks: [], latSum: 0, latCount: 0, qgPass: 0, qgTotal: 0 };
          existing.total += (r.count as number) || 0;
          if (((r.count as number) || 0) > existing.topCount) { existing.topTask = r.task_type as string; existing.topCount = (r.count as number) || 0; }
          if (!existing.tasks.includes(r.task_type as string)) existing.tasks.push(r.task_type as string);
          modelMap.set(m, existing);
        }
        const enrichedRows = rows.map(r => ({
          ...r,
          pct_of_model: 0,
          pct_of_total: totalDel > 0 ? ((r.count as number) / totalDel) * 100 : 0,
        }));
        const byModel = Array.from(modelMap.entries()).map(([name, m]) => ({
          model_name: name,
          total_count: m.total,
          pct_of_total: totalDel > 0 ? (m.total / totalDel) * 100 : 0,
          top_task_type: m.topTask,
          task_types: m.tasks,
          avg_latency_ms: m.latCount > 0 ? Math.round(m.latSum / m.latCount) : null,
          qg_pass_rate: m.qgTotal > 0 ? m.qgPass / m.qgTotal : null,
        })).sort((a, b) => b.total_count - a.total_count);
        return [{
          total_delegations: totalDel,
          rows: enrichedRows,
          by_model: byModel,
          decision_traces: decisionTraces,
          captured_at: new Date().toISOString(),
          provisioned: true,
        }];
      }

      case 'onex.snapshot.projection.delegation.quality-gate.v1': {
        const allEvents = db.prepare(`
          SELECT quality_gate_passed, quality_gate_detail FROM delegation_events
        `).all() as Row[];
        const totalChecks = allEvents.length;
        const totalPassed = allEvents.filter(e => e.quality_gate_passed === 1).length;
        const totalFailed = totalChecks - totalPassed;
        const checkTypeMap = new Map<string, { passed: number; failed: number }>();
        for (const e of allEvents) {
          const detail = (e.quality_gate_detail as string) || 'unknown:unknown';
          const checks = detail.split(',');
          for (const c of checks) {
            const [name, result] = c.split(':');
            if (!name) continue;
            const type = name.includes('deterministic') || name.includes('sql') || name.includes('md5') ? 'deterministic' : 'heuristic';
            const existing = checkTypeMap.get(type) || { passed: 0, failed: 0 };
            if (result === 'pass') existing.passed++;
            else existing.failed++;
            checkTypeMap.set(type, existing);
          }
        }
        const byCheckType = Array.from(checkTypeMap.entries()).map(([type, counts]) => ({
          check_type: type,
          passed: counts.passed,
          failed: counts.failed,
          total: counts.passed + counts.failed,
          pass_rate: (counts.passed + counts.failed) > 0 ? counts.passed / (counts.passed + counts.failed) : 0,
        }));
        const failureCats = allEvents
          .filter(e => e.quality_gate_passed !== 1)
          .map(e => (e.quality_gate_detail as string) || 'unknown');
        const catMap = new Map<string, number>();
        for (const cat of failureCats) catMap.set(cat, (catMap.get(cat) || 0) + 1);
        const failureCategories = Array.from(catMap.entries()).map(([category, count]) => ({
          category,
          count,
          pct_of_failures: totalFailed > 0 ? (count / totalFailed) * 100 : 0,
        }));
        return [{
          overall_pass_rate: totalChecks > 0 ? totalPassed / totalChecks : 0,
          total_passed: totalPassed,
          total_failed: totalFailed,
          total_checks: totalChecks,
          escalation_count: 0,
          escalation_rate: 0,
          by_check_type: byCheckType,
          failure_categories: failureCategories,
          captured_at: new Date().toISOString(),
          provisioned: true,
        }];
      }

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
