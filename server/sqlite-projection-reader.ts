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
 * Reads pre-materialized projection tables and folds live delegation runtime
 * metrics into dashboard-ready projection rows where the runtime emits tokens
 * before a downstream savings_estimates row exists.
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
            COALESCE(MAX(created_at), 0)                                               AS latest_event_at,
            0                                                                          AS total_savings_usd
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
          totalDelegations: total,
          qualityGatePassRate: total > 0 ? passed / total : 0,
          qualityGatePassed: passed,
          qualityGateTotal: total,
          totalSavingsUsd: (summary.total_savings_usd as number) || 0,
          avgLatencyMs: (summary.avg_latency_ms as number) || 0,
          latestEventAt: (summary.latest_event_at as number) || 0,
          total_events: total,
          quality_passed_count: passed,
          quality_failed_count: (summary.quality_failed_count as number) || 0,
          avg_latency_ms: (summary.avg_latency_ms as number) || 0,
          latest_event_at: (summary.latest_event_at as number) || 0,
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

      case 'onex.snapshot.projection.cost.summary.v1':
        return db.prepare(`
          SELECT
            COUNT(*)                              AS call_count,
            COALESCE(SUM(prompt_tokens), 0)       AS total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)   AS total_completion_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)  AS total_cost_usd
          FROM llm_call_metrics
        `).all() as Row[];

      case 'onex.snapshot.projection.cost.token_usage.v1':
        return db.prepare(`
          SELECT
            model_id,
            COALESCE(SUM(prompt_tokens), 0)       AS total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)   AS total_completion_tokens,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)  AS total_cost_usd
          FROM llm_call_metrics
          GROUP BY model_id
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
            COALESCE(SUM(tokens_to_compliance), 0)    AS total_tokens_to_compliance
          FROM delegation_events
          GROUP BY delegated_to, model_name
          ORDER BY total_tokens DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.cost.savings-overview.v1':
        return [this.readCostSavingsOverviewProjection(db)];

      case 'onex.snapshot.projection.delegation.savings.v1':
        return [this.readDelegationSavingsProjection(db)];

      case 'onex.snapshot.projection.delegation.model-routing.v1':
        return db.prepare(`
          SELECT
            delegated_to                                                        AS model_alias,
            task_type,
            COUNT(*)                                                            AS event_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0) AS quality_passed,
            COALESCE(AVG(latency_ms), 0)                                       AS avg_latency_ms
          FROM delegation_events
          GROUP BY delegated_to, task_type
          ORDER BY event_count DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.delegation.quality-gate.v1':
        return db.prepare(`
          SELECT
            quality_gate_detail                                                  AS check_detail,
            COUNT(*)                                                             AS total_checks,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0) AS passed_count,
            COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0) AS failed_count,
            COALESCE(AVG(quality_gates_checked), 0)                              AS avg_gates_checked,
            COALESCE(AVG(quality_gates_failed), 0)                               AS avg_gates_failed
          FROM delegation_events
          WHERE quality_gate_detail IS NOT NULL
          GROUP BY quality_gate_detail
          ORDER BY total_checks DESC
        `).all() as Row[];

      case 'onex.snapshot.projection.live-events.v1':
        return db.prepare(`
          SELECT envelope, created_at
          FROM delegation_event_log
          ORDER BY created_at DESC
          LIMIT 500
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

      case 'onex.snapshot.projection.mcp-tools.v1':
        if (!this.hasTable(db, 'node_service_registry')) return [];
        return db.prepare(`
          SELECT
            service_name AS name,
            COALESCE(
              NULLIF(json_extract(metadata, '$.description'), ''),
              NULLIF(json_extract(metadata, '$.tool_description'), ''),
              ''
            ) AS description,
            COALESCE(created_at, updated_at, projected_at) AS registeredAt,
            COALESCE(
              NULLIF(health_status, ''),
              CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END,
              'unknown'
            ) AS status,
            COALESCE(
              NULLIF(json_extract(metadata, '$.modelId'), ''),
              NULLIF(json_extract(metadata, '$.model_id'), ''),
              ''
            ) AS modelId,
            COALESCE(
              NULLIF(json_extract(metadata, '$.correlationId'), ''),
              NULLIF(json_extract(metadata, '$.correlation_id'), ''),
              ''
            ) AS correlationId
          FROM node_service_registry
          WHERE is_active = 1
            AND (
              service_type IN ('mcp', 'mcp_tool', 'mcp-tools')
              OR json_extract(metadata, '$.mcp_tool_name') IS NOT NULL
              OR json_extract(metadata, '$.tool_name') IS NOT NULL
              OR json_extract(metadata, '$.kind') = 'mcp_tool'
            )
          ORDER BY COALESCE(created_at, updated_at, projected_at) DESC
          LIMIT 500
        `).all() as Row[];

      case 'onex.snapshot.projection.hackathon_pipeline_events.v1':
        if (!this.hasTable(db, 'generation_events')) return [];
        return db.prepare(`
          SELECT
            correlation_id || '-completed' AS id,
            CASE WHEN contract_passed = 1 THEN 'success' ELSE 'error' END AS type,
            COALESCE(timestamp, created_at) AS timestamp,
            'node_generation_consumer' AS source,
            CASE
              WHEN contract_passed = 1
                THEN 'Node generation completed: ' || task_description
              ELSE 'Node generation failed validation: ' || task_description
            END AS message,
            correlation_id AS correlationId
          FROM generation_events
          ORDER BY COALESCE(timestamp, created_at) ASC
          LIMIT 500
        `).all() as Row[];

      default:
        return [];
    }
  }

  private hasTable(db: Database.Database, tableName: string): boolean {
    const row = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName) as Row | undefined;
    return row !== undefined;
  }

  private hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
    if (!this.hasTable(db, tableName)) return false;
    // PRAGMA table_info cannot be parameterized; callers pass hardcoded table names.
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
    return rows.some((row) => row.name === columnName);
  }

  private sessionKey(row: Row, index: number, source: 'sqlite-savings' | 'sqlite-events'): string {
    const key = String(row.session_id ?? '').trim();
    return key || `${source}-row-${index}-${String(row.created_at ?? '')}-${String(row.model_name ?? '')}`;
  }

  private mergeDelegationSessions(savingsRows: Row[], eventRows: Row[]): Row[] {
    const merged = new Map<string, Row>();
    savingsRows.forEach((row, index) => {
      merged.set(this.sessionKey(row, index, 'sqlite-savings'), row);
    });

    eventRows.forEach((eventRow, index) => {
      const key = this.sessionKey(eventRow, index, 'sqlite-events');
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, eventRow);
        return;
      }

      merged.set(key, {
        ...existing,
        prompt_tokens: eventRow.prompt_tokens ?? existing.prompt_tokens,
        completion_tokens: eventRow.completion_tokens ?? existing.completion_tokens,
        tokens_to_compliance: eventRow.tokens_to_compliance ?? existing.tokens_to_compliance,
        latency_ms: eventRow.latency_ms ?? existing.latency_ms,
        prompt_text: eventRow.prompt_text ?? existing.prompt_text,
        response_text: eventRow.response_text ?? existing.response_text,
        created_at: this.newerCreatedAt(existing.created_at, eventRow.created_at),
      });
    });

    return [...merged.values()];
  }

  private newerCreatedAt(left: unknown, right: unknown): unknown {
    return this.timestampValue(right) > this.timestampValue(left) ? right : left;
  }

  private timestampValue(value: unknown): number {
    const numeric = Number(value ?? 0);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private readDelegationSavingsProjection(db: Database.Database): Row {
    let savingsRows: Row[] = [];
    let eventRows: Row[] = [];

    if (this.hasTable(db, 'savings_estimates')) {
      savingsRows = db.prepare(`
        SELECT
          session_id,
          model_local AS task_type,
          model_local AS model_name,
          local_cost_usd,
          cloud_cost_usd,
          savings_usd,
          baseline_model,
          pricing_manifest_version,
          savings_method,
          usage_source,
          0 AS prompt_tokens,
          0 AS completion_tokens,
          NULL AS tokens_to_compliance,
          NULL AS latency_ms,
          created_at,
          NULL AS prompt_text,
          NULL AS response_text
        FROM savings_estimates
        ORDER BY created_at DESC
        LIMIT 500
      `).all() as Row[];
    }

    if (this.hasTable(db, 'delegation_events')) {
      const col = (name: string, fallback: string): string =>
        this.hasColumn(db, 'delegation_events', name) ? name : fallback;
      const latencyExpr = this.hasColumn(db, 'delegation_events', 'delegation_latency_ms')
        ? 'delegation_latency_ms'
        : col('latency_ms', 'NULL');
      const createdAtExpr = this.hasColumn(db, 'delegation_events', 'created_at')
        ? 'created_at'
        : col('timestamp', 'NULL');
      const costExpr = col('cost_usd', '0');
      const savingsExpr = col('cost_savings_usd', '0');
      const inputTokensExpr = col('tokens_input', '0');
      const outputTokensExpr = col('tokens_output', '0');
      const complianceTokensExpr = col('tokens_to_compliance', 'NULL');

      eventRows = db.prepare(`
        SELECT
          COALESCE(NULLIF(session_id, ''), NULLIF(correlation_id, ''), CAST(id AS TEXT)) AS session_id,
          task_type,
          COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local') AS model_name,
          COALESCE(${costExpr}, 0) AS local_cost_usd,
          COALESCE(${costExpr}, 0) + COALESCE(${savingsExpr}, 0) AS cloud_cost_usd,
          COALESCE(${savingsExpr}, 0) AS savings_usd,
          'claude-opus-4.1' AS baseline_model,
          'runtime-delegation-events' AS pricing_manifest_version,
          CASE WHEN COALESCE(${savingsExpr}, 0) > 0 THEN 'measured' ELSE 'estimated' END AS savings_method,
          CASE WHEN COALESCE(${inputTokensExpr}, 0) + COALESCE(${outputTokensExpr}, 0) > 0 THEN 'measured' ELSE 'unknown' END AS usage_source,
          COALESCE(${inputTokensExpr}, 0) AS prompt_tokens,
          COALESCE(${outputTokensExpr}, 0) AS completion_tokens,
          ${complianceTokensExpr} AS tokens_to_compliance,
          ${latencyExpr} AS latency_ms,
          ${createdAtExpr} AS created_at,
          ${col('prompt_text', 'NULL')} AS prompt_text,
          ${col('response_text', 'NULL')} AS response_text
        FROM delegation_events
        ORDER BY ${createdAtExpr} DESC
        LIMIT 500
      `).all() as Row[];
    }

    const sessions = this.mergeDelegationSessions(savingsRows, eventRows);
    sessions.sort((a, b) => this.timestampValue(b.created_at) - this.timestampValue(a.created_at));

    const sum = (key: string): number =>
      sessions.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const latest = sessions[0] ?? {};

    return {
      cumulative_savings_usd: sum('savings_usd'),
      cumulative_local_cost_usd: sum('local_cost_usd'),
      cumulative_cloud_cost_usd: sum('cloud_cost_usd'),
      baseline_model: (latest.baseline_model as string | undefined) ?? 'claude-opus-4.1',
      pricing_manifest_version: (latest.pricing_manifest_version as string | undefined) ?? 'runtime-delegation-events',
      session_count: sessions.length,
      sessions: sessions.slice(0, 500),
      captured_at: new Date().toISOString(),
      provisioned: true,
    };
  }

  private readCostSavingsOverviewProjection(db: Database.Database): Row {
    const delegationSavings = this.readDelegationSavingsProjection(db);
    const sessions = (delegationSavings.sessions as Row[] | undefined) ?? [];
    const grouped = new Map<string, {
      model_id: string;
      display_name: string;
      execution_mode: string;
      task_count: number;
      tokens_total: number;
      cost_usd: number;
      baseline_cost_usd: number;
      savings_usd: number;
      evidence_ref: string | null;
    }>();

    const sessionTokens = (session: Row): number =>
      Number(session.prompt_tokens ?? 0) + Number(session.completion_tokens ?? 0);
    const tokenBackedSessions = sessions.filter((session) => sessionTokens(session) > 0);
    const omittedTelemetryRows = sessions.length - tokenBackedSessions.length;

    for (const session of tokenBackedSessions) {
      const displayName = String(session.model_name ?? session.task_type ?? 'delegated-runtime');
      const modelId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delegated-runtime';
      const tokens = sessionTokens(session);
      const baselineCandidate = Number(session.cloud_cost_usd ?? 0);
      const measuredSavings = Number(session.savings_usd ?? 0);
      const savings = Math.max(measuredSavings, baselineCandidate);
      const baseline = Math.max(baselineCandidate, savings);
      const existing = grouped.get(modelId) ?? {
        model_id: modelId,
        display_name: displayName,
        execution_mode: 'delegated',
        task_count: 0,
        tokens_total: 0,
        cost_usd: 0,
        baseline_cost_usd: 0,
        savings_usd: 0,
        evidence_ref: null,
      };
      existing.task_count += 1;
      existing.tokens_total += tokens;
      existing.cost_usd += 0;
      existing.baseline_cost_usd += baseline;
      existing.savings_usd += savings;
      existing.evidence_ref = existing.evidence_ref ?? String(session.session_id ?? '');
      grouped.set(modelId, existing);
    }

    const rows = [...grouped.values()].map((row) => ({
      ...row,
      cost_usd: Number(row.cost_usd.toFixed(6)),
      baseline_cost_usd: Number(row.baseline_cost_usd.toFixed(6)),
      savings_usd: Number(row.savings_usd.toFixed(6)),
      savings_pct: row.baseline_cost_usd > 0
        ? Number((row.savings_usd / row.baseline_cost_usd).toFixed(6))
        : 0,
      runtime_address: null,
      evidence_ref: row.evidence_ref || null,
    })).sort((a, b) => b.savings_usd - a.savings_usd);

    const totalCost = rows.reduce((sum, row) => sum + row.cost_usd, 0);
    const totalBaseline = rows.reduce((sum, row) => sum + row.baseline_cost_usd, 0);
    const totalSavings = rows.reduce((sum, row) => sum + row.savings_usd, 0);
    const tokensTotal = rows.reduce((sum, row) => sum + row.tokens_total, 0);
    const complianceTokensTotal = tokenBackedSessions.reduce(
      (sum, row) => row.tokens_to_compliance != null
        ? sum + Number(row.tokens_to_compliance)
        : sum,
      0,
    );
    const warnings = omittedTelemetryRows > 0
      ? [`Omitted ${omittedTelemetryRows} delegation row${omittedTelemetryRows === 1 ? '' : 's'} without token telemetry.`]
      : [];

    return {
      window: '24h',
      total_cost_usd: Number(totalCost.toFixed(6)),
      total_baseline_cost_usd: Number(totalBaseline.toFixed(6)),
      total_savings_usd: Number(totalSavings.toFixed(6)),
      savings_rate: totalBaseline > 0 ? Number((totalSavings / totalBaseline).toFixed(6)) : 0,
      tokens_total: tokensTotal,
      tokens_to_compliance: complianceTokensTotal > 0 ? complianceTokensTotal : undefined,
      local_token_pct: tokensTotal > 0 ? 1 : 0,
      captured_at: new Date().toISOString(),
      rows,
      warnings,
      provisioned: tokenBackedSessions.length > 0,
    };
  }
}
