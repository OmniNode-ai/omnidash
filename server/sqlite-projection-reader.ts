import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  timestampValue,
  mergeDelegationSessions as sharedMergeDelegationSessions,
  buildCostSavingsOverviewResult,
} from './projection-reader-shared.js';

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
      case 'delegation':
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
          WHERE ${this.delegationRuntimeWhereClause(db)}
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
          WHERE ${this.delegationRuntimeWhereClause(db)}
        `).get() as Row;
        // total_savings_usd comes from the savings_estimates projection table (the same
        // source onex.snapshot.projection.savings.summary.v1 reads), NOT a literal 0.
        // delegation_events has no savings column, so the old `0 AS total_savings_usd`
        // pinned the headline figure to 0 (OMN-13355 / W13). Guarded on table presence.
        const totalSavingsUsd = this.hasTable(db, 'savings_estimates')
          ? Number((db.prepare(`
              SELECT COALESCE(SUM(savings_usd), 0) AS total_savings_usd
              FROM savings_estimates
            `).get() as Row)?.total_savings_usd ?? 0)
          : 0;
        const byTaskType = db.prepare(`
          SELECT task_type AS taskType, COUNT(*) AS count
          FROM delegation_events
          WHERE ${this.delegationRuntimeWhereClause(db)}
          GROUP BY task_type ORDER BY count DESC
        `).all() as Row[];
        const byModel = db.prepare(`
          SELECT delegated_to AS model, COUNT(*) AS count
          FROM delegation_events
          WHERE ${this.delegationRuntimeWhereClause(db)}
          GROUP BY delegated_to ORDER BY count DESC
        `).all() as Row[];
        const total = (summary.total_events as number) || 0;
        const passed = (summary.quality_passed_count as number) || 0;
        return [{
          totalDelegations: total,
          qualityGatePassRate: total > 0 ? passed / total : 0,
          qualityGatePassed: passed,
          qualityGateTotal: total,
          totalSavingsUsd,
          avgLatencyMs: (summary.avg_latency_ms as number) || 0,
          latestEventAt: (summary.latest_event_at as number) || 0,
          total_events: total,
          quality_passed_count: passed,
          quality_failed_count: (summary.quality_failed_count as number) || 0,
          avg_latency_ms: (summary.avg_latency_ms as number) || 0,
          latest_event_at: (summary.latest_event_at as number) || 0,
          total_savings_usd: totalSavingsUsd,
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
        return [this.readDelegationTokenUsageProjection(db)];

      case 'onex.snapshot.projection.cost.savings-overview.v1':
        return [this.readCostSavingsOverviewProjection(db)];

      case 'onex.snapshot.projection.delegation.savings.v1':
        return [this.readDelegationSavingsProjection(db)];

      case 'onex.snapshot.projection.delegation.model-routing.v1':
        return [this.readDelegationModelRoutingProjection(db)];

      case 'onex.snapshot.projection.delegation.quality-gate.v1':
        return [this.readDelegationQualityGateProjection(db)];

      case 'onex.snapshot.projection.live-events.v1':
        return this.readLiveEventsProjection(db);

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

      case 'onex.evt.omnimarket.node-generation-completed.v1': {
        if (!this.hasTable(db, 'generation_events')) return [];
        return db.prepare(`
          SELECT
            id,
            correlation_id,
            task_description,
            provider,
            model_id,
            endpoint_class,
            attempt_count,
            total_latency_e2e_ms,
            contract_passed,
            cost_inference_usd,
            contract_yaml,
            handler_source,
            timestamp,
            created_at
          FROM generation_events
          ORDER BY created_at DESC
          LIMIT 500
        `).all() as Row[];
      }

      case 'onex.snapshot.projection.hackathon_pipeline_events.v1': {
        if (!this.hasTable(db, 'generation_events')) return [];
        const col = (name: string): string =>
          this.hasColumn(db, 'generation_events', name) ? name : 'NULL';
        const rows = db.prepare(`
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
            correlation_id AS correlationId,
            task_description AS taskDescription,
            provider AS selectedProvider,
            model_id AS selectedModel,
            ${col('endpoint_ref')} AS endpointRef,
            ${col('resolved_endpoint')} AS resolvedEndpoint,
            ${col('routing_source')} AS routingSource,
            COALESCE(${col('projection_owner')}, 'omnidash.server.sqlite-projection-reader') AS projectionOwner,
            COALESCE(${col('projection_reducer_version')}, 'sqlite-generation-events') AS projectionReducerVersion,
            ${col('contract_yaml')} AS contractYaml,
            ${col('handler_source')} AS handlerSource,
            ${col('output_payload_sha256')} AS outputPayloadSha256,
            ${col('contract_sha256')} AS contractSha256,
            ${col('handler_sha256')} AS handlerSha256,
            contract_passed AS contractPassed
          FROM generation_events
          ORDER BY COALESCE(timestamp, created_at) ASC
          LIMIT 500
        `).all() as Row[];
        return rows.map((row) => ({
          ...row,
          payload: JSON.stringify(row),
        }));
      }

      default:
        return [];
    }
  }

  private readLiveEventsProjection(db: Database.Database): Row[] {
    const events: Row[] = [];
    const toIso = (value: unknown): string => {
      if (typeof value === 'string' && Number.isNaN(Number(value))) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
      }
      const numeric = Number(value ?? 0);
      if (numeric > 0) return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
      return new Date(0).toISOString();
    };
    const textFrom = (...values: unknown[]): string =>
      values.map((value) => String(value ?? '').trim()).find(Boolean) ?? '';

    if (this.hasTable(db, 'delegation_event_log')) {
      const logRows = db.prepare(`
        SELECT id, envelope, created_at
        FROM delegation_event_log
        ORDER BY created_at DESC
        LIMIT 500
      `).all() as Row[];

      for (const row of logRows) {
        let envelope: Row = {};
        try {
          const parsed: unknown = JSON.parse(String(row.envelope ?? '{}'));
          envelope = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Row
            : { message: String(row.envelope ?? '') };
        } catch {
          envelope = { message: String(row.envelope ?? '') };
        }
        const payloadValue = envelope.payload ?? envelope.data ?? envelope;
        const type = textFrom(envelope.type, envelope.event_type, envelope.kind, 'BUS_MESSAGE');
        const correlationId = textFrom(
          envelope.correlation_id,
          envelope.correlationId,
          (payloadValue as Row).correlation_id,
          (payloadValue as Row).correlationId,
        );
        events.push({
          id: textFrom(envelope.id, correlationId, `bus-log-${row.id}`),
          type,
          timestamp: toIso(envelope.timestamp ?? envelope.created_at ?? row.created_at),
          source: textFrom(envelope.source, envelope.producer, envelope.service, 'event_bus'),
          topic: textFrom(envelope.topic, envelope.subject, 'delegation_event_log'),
          summary: textFrom(
            envelope.summary,
            envelope.message,
            envelope.detail,
            `${type}${correlationId ? ` · ${correlationId}` : ''}`,
          ),
          payload: typeof payloadValue === 'string' ? payloadValue : JSON.stringify(payloadValue),
          correlation_id: correlationId,
        });
      }
    }

    if (this.hasTable(db, 'delegation_events')) {
      const col = (name: string, fallback: string): string =>
        this.hasColumn(db, 'delegation_events', name) ? name : fallback;
      const createdAtExpr = this.hasColumn(db, 'delegation_events', 'timestamp')
        ? 'COALESCE(timestamp, created_at)'
        : 'created_at';
      const latencyExpr = this.hasColumn(db, 'delegation_events', 'delegation_latency_ms')
        ? 'COALESCE(delegation_latency_ms, latency_ms)'
        : col('latency_ms', 'NULL');
      const inputTokensExpr = col('tokens_input', '0');
      const outputTokensExpr = col('tokens_output', '0');

      const runtimeRows = db.prepare(`
        SELECT
          id,
          correlation_id,
          session_id,
          task_type,
          delegated_to,
          model_name,
          quality_gate_passed,
          quality_gate_detail,
          ${latencyExpr} AS latency_ms,
          COALESCE(${inputTokensExpr}, 0) AS tokens_input,
          COALESCE(${outputTokensExpr}, 0) AS tokens_output,
          COALESCE(${inputTokensExpr}, 0) + COALESCE(${outputTokensExpr}, 0) AS total_tokens,
          COALESCE(${col('cost_savings_usd', '0')}, 0) AS cost_savings_usd,
          ${col('prompt_text', 'NULL')} AS prompt_text,
          ${col('response_text', 'NULL')} AS response_text,
          ${col('input_redaction_policy', 'NULL')} AS input_redaction_policy,
          ${createdAtExpr} AS created_at
        FROM delegation_events
        WHERE ${this.delegationRuntimeWhereClause(db)}
        ORDER BY created_at DESC
        LIMIT 500
      `).all() as Row[];

      for (const row of runtimeRows) {
        const correlationId = textFrom(row.correlation_id, row.session_id, String(row.id));
        const passed = Number(row.quality_gate_passed ?? 0) === 1;
        const model = textFrom(row.model_name, row.delegated_to, 'local model');
        const tokens = Number(row.total_tokens ?? 0);
        const latency = Number(row.latency_ms ?? 0);
        events.push({
          id: `delegation-${correlationId}`,
          type: passed ? 'DELEGATION_COMPLETED' : 'DELEGATION_FAILED',
          timestamp: toIso(row.created_at),
          source: 'delegation_runtime',
          topic: 'onex.evt.delegation.completed.v1',
          summary: `${textFrom(row.task_type, 'task')} delegated to ${model} · ${tokens.toLocaleString()} tokens · ${latency}ms`,
          payload: JSON.stringify({
            correlation_id: correlationId,
            session_id: row.session_id,
            task_type: row.task_type,
            delegated_to: row.delegated_to,
            model_name: row.model_name,
            quality_gate_passed: passed,
            quality_gate_detail: row.quality_gate_detail,
            latency_ms: latency,
            tokens_input: row.tokens_input,
            tokens_output: row.tokens_output,
            total_tokens: tokens,
            cost_savings_usd: row.cost_savings_usd,
            prompt_text: row.prompt_text,
            response_text: row.response_text,
          }),
          correlation_id: correlationId,
        });
      }
    }

    if (this.hasTable(db, 'generation_events')) {
      const generationRows = db.prepare(`
        SELECT
          id,
          correlation_id,
          task_description,
          provider,
          model_id,
          endpoint_class,
          attempt_count,
          total_latency_e2e_ms,
          contract_passed,
          cost_inference_usd,
          COALESCE(timestamp, created_at) AS created_at
        FROM generation_events
        ORDER BY COALESCE(timestamp, created_at) DESC
        LIMIT 500
      `).all() as Row[];

      for (const row of generationRows) {
        const passed = Number(row.contract_passed ?? 0) === 1;
        const correlationId = textFrom(row.correlation_id, row.id);
        events.push({
          id: `generation-${correlationId}`,
          type: passed ? 'NODE_GENERATION_COMPLETED' : 'NODE_GENERATION_FAILED',
          timestamp: toIso(row.created_at),
          source: 'node_generation_consumer',
          topic: 'onex.evt.node-generation.completed.v1',
          summary: `${passed ? 'Completed' : 'Failed'} node generation · ${textFrom(row.task_description, 'untitled task')}`,
          payload: JSON.stringify(row),
          correlation_id: correlationId,
        });
      }
    }

    return events
      .sort((a, b) => this.timestampValue(b.timestamp) - this.timestampValue(a.timestamp))
      .slice(0, 500);
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

  private delegationRuntimeWhereClause(db: Database.Database): string {
    const col = (name: string, fallback: string): string =>
      this.hasColumn(db, 'delegation_events', name) ? name : fallback;

    return `
      NOT (
        COALESCE(${col('input_redaction_policy', 'NULL')}, '') = 'synthetic_demo'
        OR COALESCE(${col('response_text', 'NULL')}, '') LIKE '%dashboard demo%'
        OR COALESCE(${col('prompt_text', 'NULL')}, '') LIKE '%delegation dashboard semantics%'
        OR COALESCE(${col('prompt_text', 'NULL')}, '') LIKE '%cost savings projection semantics%'
      )
    `;
  }

  private sessionKey(row: Row, index: number, kind: 'savings' | 'events'): string {
    const key = String(row.session_id ?? '').trim();
    return key || `sqlite-${kind}-row-${index}-${String(row.created_at ?? '')}-${String(row.model_name ?? '')}`;
  }

  private mergeDelegationSessions(savingsRows: Row[], eventRows: Row[]): Row[] {
    return sharedMergeDelegationSessions(savingsRows, eventRows, (row, index, kind) =>
      this.sessionKey(row, index, kind),
    );
  }

  private timestampValue(value: unknown): number {
    return timestampValue(value);
  }

  private readDelegationQualityGateProjection(db: Database.Database): Row {
    if (!this.hasTable(db, 'delegation_events')) {
      return {
        overall_pass_rate: 0, total_passed: 0, total_failed: 0, total_checks: 0,
        escalation_count: 0, escalation_rate: 0,
        by_check_type: [], failure_categories: [],
        captured_at: new Date().toISOString(), provisioned: false,
      };
    }

    const hasTokensToCompliance = this.hasColumn(db, 'delegation_events', 'tokens_to_compliance');
    const hasQualityGatesChecked = this.hasColumn(db, 'delegation_events', 'quality_gates_checked');
    const hasQualityGatesFailed = this.hasColumn(db, 'delegation_events', 'quality_gates_failed');

    const totals = db.prepare(`
      SELECT
        COUNT(*)                                                                     AS total_checks,
        COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0)       AS total_passed,
        COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0)       AS total_failed,
        ${hasTokensToCompliance
          ? `COALESCE(AVG(CASE WHEN tokens_to_compliance > 0 THEN tokens_to_compliance END), NULL) AS avg_tokens_to_compliance,
             COALESCE(AVG(CASE WHEN tokens_to_compliance > 0 AND ${hasQualityGatesChecked ? 'quality_gates_checked' : '1'} > 1
               THEN ${hasQualityGatesChecked ? 'quality_gates_checked' : '1'} END), NULL) AS avg_compliance_attempts`
          : `NULL AS avg_tokens_to_compliance, NULL AS avg_compliance_attempts`}
      FROM delegation_events
      WHERE ${this.delegationRuntimeWhereClause(db)}
    `).get() as Row;

    const totalChecks = Number(totals.total_checks ?? 0);
    const totalPassed = Number(totals.total_passed ?? 0);
    const totalFailed = Number(totals.total_failed ?? 0);
    const overallPassRate = totalChecks > 0 ? totalPassed / totalChecks : 0;

    // Map quality_gate_detail values to check_type buckets
    const detailRows = db.prepare(`
      SELECT
        quality_gate_detail                                                          AS check_detail,
        COUNT(*)                                                                     AS total,
        COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0)       AS passed_count,
        COALESCE(SUM(CASE WHEN quality_gate_passed = 0 THEN 1 ELSE 0 END), 0)       AS failed_count
      FROM delegation_events
      WHERE quality_gate_detail IS NOT NULL
        AND ${this.delegationRuntimeWhereClause(db)}
      GROUP BY quality_gate_detail
      ORDER BY total DESC
    `).all() as Row[];

    // Classify each detail into a check_type bucket
    const checkTypeBuckets = new Map<string, { passed: number; failed: number; total: number }>();
    const failureCategoryMap = new Map<string, number>();

    for (const row of detailRows) {
      const detail = String(row.check_detail ?? '').toLowerCase();
      const checkType = detail.includes('heuristic')
        ? 'heuristic'
        : detail.includes('deterministic') || detail.includes('exact') || detail.includes('schema')
        ? 'deterministic'
        : 'unknown';

      const existing = checkTypeBuckets.get(checkType) ?? { passed: 0, failed: 0, total: 0 };
      existing.passed += Number(row.passed_count ?? 0);
      existing.failed += Number(row.failed_count ?? 0);
      existing.total += Number(row.total ?? 0);
      checkTypeBuckets.set(checkType, existing);

      if (Number(row.failed_count ?? 0) > 0) {
        const failKey = String(row.check_detail ?? 'unknown');
        failureCategoryMap.set(failKey, (failureCategoryMap.get(failKey) ?? 0) + Number(row.failed_count));
      }
    }

    // If no detail rows exist, synthesize a single bucket from totals
    if (checkTypeBuckets.size === 0 && totalChecks > 0) {
      checkTypeBuckets.set('unknown', { passed: totalPassed, failed: totalFailed, total: totalChecks });
    }

    const byCheckType = [...checkTypeBuckets.entries()].map(([check_type, counts]) => ({
      check_type,
      passed: counts.passed,
      failed: counts.failed,
      total: counts.total,
      pass_rate: counts.total > 0 ? counts.passed / counts.total : 0,
    }));

    const totalFailedForPct = [...failureCategoryMap.values()].reduce((s, v) => s + v, 0);
    const failureCategories = [...failureCategoryMap.entries()]
      .map(([category, count]) => ({
        category,
        count,
        pct_of_failures: totalFailedForPct > 0 ? count / totalFailedForPct : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const tokensToComplianceByModel: Row[] = hasTokensToCompliance
      ? (db.prepare(`
          SELECT
            COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local') AS model_name,
            COALESCE(AVG(CASE WHEN tokens_to_compliance > 0 THEN tokens_to_compliance END), 0) AS avg_tokens,
            COALESCE(AVG(CASE WHEN ${hasQualityGatesChecked ? 'quality_gates_checked' : '1'} > 0
              THEN ${hasQualityGatesChecked ? 'quality_gates_checked' : '1'} END), 1) AS avg_attempts,
            COUNT(CASE WHEN tokens_to_compliance > 0 THEN 1 END) AS sample_count
          FROM delegation_events
          WHERE ${this.delegationRuntimeWhereClause(db)}
          GROUP BY COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local')
          HAVING sample_count > 0
          ORDER BY avg_tokens ASC
        `).all() as Row[])
      : [];

    const escalationCount = hasQualityGatesFailed
      ? Number(
          (db.prepare(`
            SELECT COUNT(*) AS cnt FROM delegation_events
            WHERE quality_gates_failed > 1
              AND ${this.delegationRuntimeWhereClause(db)}
          `).get() as Row).cnt ?? 0,
        )
      : 0;

    return {
      overall_pass_rate: overallPassRate,
      total_passed: totalPassed,
      total_failed: totalFailed,
      total_checks: totalChecks,
      escalation_count: escalationCount,
      escalation_rate: totalChecks > 0 ? escalationCount / totalChecks : 0,
      by_check_type: byCheckType,
      failure_categories: failureCategories,
      avg_tokens_to_compliance: totals.avg_tokens_to_compliance ?? undefined,
      avg_compliance_attempts: totals.avg_compliance_attempts ?? undefined,
      tokens_to_compliance_by_model: tokensToComplianceByModel.length > 0 ? tokensToComplianceByModel : undefined,
      captured_at: new Date().toISOString(),
      provisioned: totalChecks > 0,
    };
  }

  private readDelegationModelRoutingProjection(db: Database.Database): Row {
    if (!this.hasTable(db, 'delegation_events')) {
      return {
        total_delegations: 0, rows: [], by_model: [],
        captured_at: new Date().toISOString(), provisioned: false,
      };
    }

    const hasRoutingRule = this.hasColumn(db, 'delegation_events', 'routing_rule');
    const hasRoutingConfidence = this.hasColumn(db, 'delegation_events', 'routing_confidence');
    const hasRoutingCandidates = this.hasColumn(db, 'delegation_events', 'routing_candidates');

    // Per (model, task_type) breakdown rows
    const rawRows = db.prepare(`
      SELECT
        COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local') AS model_name,
        COALESCE(NULLIF(task_type, ''), 'unknown')                          AS task_type,
        COUNT(*)                                                             AS count,
        COALESCE(AVG(latency_ms), 0)                                        AS avg_latency_ms,
        COALESCE(SUM(CASE WHEN quality_gate_passed = 1 THEN 1 ELSE 0 END), 0) AS quality_passed,
        COUNT(*)                                                             AS total_for_rate
      FROM delegation_events
      WHERE ${this.delegationRuntimeWhereClause(db)}
      GROUP BY model_name, task_type
      ORDER BY count DESC
    `).all() as Row[];

    const totalDelegations = rawRows.reduce((s, r) => s + Number(r.count ?? 0), 0);

    // Per-model totals
    const modelMap = new Map<string, {
      model_name: string;
      total_count: number;
      quality_passed: number;
      latency_sum: number;
      task_types: Set<string>;
    }>();

    for (const row of rawRows) {
      const modelName = String(row.model_name ?? 'local');
      const existing = modelMap.get(modelName) ?? {
        model_name: modelName,
        total_count: 0,
        quality_passed: 0,
        latency_sum: 0,
        task_types: new Set<string>(),
      };
      existing.total_count += Number(row.count ?? 0);
      existing.quality_passed += Number(row.quality_passed ?? 0);
      existing.latency_sum += Number(row.avg_latency_ms ?? 0) * Number(row.count ?? 0);
      existing.task_types.add(String(row.task_type ?? 'unknown'));
      modelMap.set(modelName, existing);
    }

    const modelSummaries = [...modelMap.values()].map((m) => {
      const topTaskType = rawRows
        .filter((r) => String(r.model_name ?? 'local') === m.model_name)
        .sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))[0];
      return {
        model_name: m.model_name,
        total_count: m.total_count,
        pct_of_total: totalDelegations > 0 ? m.total_count / totalDelegations : 0,
        top_task_type: topTaskType ? String(topTaskType.task_type ?? 'unknown') : 'unknown',
        avg_latency_ms: m.total_count > 0 ? m.latency_sum / m.total_count : undefined,
        qg_pass_rate: m.total_count > 0 ? m.quality_passed / m.total_count : undefined,
        task_types: [...m.task_types],
      };
    }).sort((a, b) => b.total_count - a.total_count);

    // Compute per-model pct for each row
    const rows = rawRows.map((r) => {
      const modelName = String(r.model_name ?? 'local');
      const modelTotal = modelMap.get(modelName)?.total_count ?? 1;
      const count = Number(r.count ?? 0);
      return {
        model_name: modelName,
        task_type: String(r.task_type ?? 'unknown'),
        count,
        pct_of_model: modelTotal > 0 ? count / modelTotal : 0,
        pct_of_total: totalDelegations > 0 ? count / totalDelegations : 0,
      };
    });

    // Optional decision traces
    let decisionTraces: Row[] | undefined;
    if (hasRoutingRule || hasRoutingConfidence) {
      decisionTraces = db.prepare(`
        SELECT
          id,
          COALESCE(NULLIF(correlation_id, ''), CAST(id AS TEXT)) AS correlation_id,
          COALESCE(NULLIF(task_type, ''), 'unknown')             AS task_type,
          COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local') AS model_name,
          COALESCE(NULLIF(delegated_to, ''), 'local')            AS delegated_to,
          ${hasRoutingRule       ? 'routing_rule'       : 'NULL'} AS routing_rule,
          ${hasRoutingConfidence ? 'routing_confidence' : 'NULL'} AS routing_confidence,
          ${hasRoutingCandidates ? 'routing_candidates' : 'NULL'} AS routing_candidates,
          latency_ms,
          quality_gate_passed,
          COALESCE(created_at, 0)                                AS created_at
        FROM delegation_events
        WHERE ${this.delegationRuntimeWhereClause(db)}
        ORDER BY created_at DESC
        LIMIT 100
      `).all() as Row[];
    }

    return {
      total_delegations: totalDelegations,
      rows,
      by_model: modelSummaries,
      ...(decisionTraces && decisionTraces.length > 0 ? { decision_traces: decisionTraces } : {}),
      captured_at: new Date().toISOString(),
      provisioned: totalDelegations > 0,
    };
  }

  private readDelegationTokenUsageProjection(db: Database.Database): Row {
    if (!this.hasTable(db, 'delegation_events')) {
      return {
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_tokens: 0,
        total_estimated_cost_usd: 0,
        provenance_summary: { measured: 0, estimated: 0, unknown: 0 },
        by_model: [],
        captured_at: new Date().toISOString(),
        provisioned: false,
      };
    }

    const hasTokensInput = this.hasColumn(db, 'delegation_events', 'tokens_input');
    const hasTokensOutput = this.hasColumn(db, 'delegation_events', 'tokens_output');
    const hasCostUsd = this.hasColumn(db, 'delegation_events', 'cost_usd');
    const hasUsageSource = this.hasColumn(db, 'delegation_events', 'usage_source');

    const promptExpr = hasTokensInput ? 'COALESCE(tokens_input, 0)' : '0';
    const completionExpr = hasTokensOutput ? 'COALESCE(tokens_output, 0)' : '0';
    const costExpr = hasCostUsd ? 'COALESCE(cost_usd, 0)' : '0';
    const usageSourceExpr = hasUsageSource
      ? `CASE WHEN COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) > 0 THEN
           COALESCE(NULLIF(usage_source, ''), 'measured')
         ELSE 'unknown' END`
      : `CASE WHEN COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) > 0 THEN 'measured' ELSE 'unknown' END`;

    const modelRows = db.prepare(`
      SELECT
        COALESCE(NULLIF(delegated_to, ''), 'local')                              AS model_id,
        COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'local')      AS model_name,
        COALESCE(SUM(${promptExpr}), 0)                                          AS prompt_tokens,
        COALESCE(SUM(${completionExpr}), 0)                                      AS completion_tokens,
        COALESCE(SUM(${promptExpr} + ${completionExpr}), 0)                      AS total_tokens,
        COALESCE(SUM(${costExpr}), 0)                                            AS estimated_cost_usd,
        ${usageSourceExpr}                                                        AS usage_source,
        ${usageSourceExpr}                                                        AS token_provenance
      FROM delegation_events
      WHERE ${this.delegationRuntimeWhereClause(db)}
      GROUP BY delegated_to, model_name
      ORDER BY total_tokens DESC
    `).all() as Row[];

    const totalPrompt = modelRows.reduce((s, r) => s + Number(r.prompt_tokens ?? 0), 0);
    const totalCompletion = modelRows.reduce((s, r) => s + Number(r.completion_tokens ?? 0), 0);
    const totalTokens = modelRows.reduce((s, r) => s + Number(r.total_tokens ?? 0), 0);
    const totalCost = modelRows.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);

    const provenanceSummary: Record<string, number> = { measured: 0, estimated: 0, unknown: 0 };
    for (const row of modelRows) {
      const p = String(row.token_provenance ?? 'unknown');
      provenanceSummary[p] = (provenanceSummary[p] ?? 0) + 1;
    }

    return {
      total_prompt_tokens: totalPrompt,
      total_completion_tokens: totalCompletion,
      total_tokens: totalTokens,
      total_estimated_cost_usd: totalCost,
      provenance_summary: provenanceSummary,
      by_model: modelRows,
      captured_at: new Date().toISOString(),
      provisioned: totalTokens > 0,
    };
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
        WHERE ${this.delegationRuntimeWhereClause(db)}
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
    const sessionTokens = (session: Row): number =>
      Number(session.prompt_tokens ?? 0) + Number(session.completion_tokens ?? 0);
    const measuredSessions = sessions.filter((session) => sessionTokens(session) > 0);
    const omittedTelemetryRows = sessions.length - measuredSessions.length;
    return buildCostSavingsOverviewResult(measuredSessions, omittedTelemetryRows);
  }
}
