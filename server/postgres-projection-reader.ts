import { Pool } from 'pg';

export interface PostgresProjectionReaderOptions {
  connectionString: string;
}

type Row = Record<string, unknown>;
type PostgresError = Error & { code?: string };

export interface ModelLogEntry {
  entry_id: string;
  timestamp: string;
  node_name: string;
  function_name: string;
  level: string;
  message: string;
  correlation_id: string | null;
  duration_ms: number | null;
  metadata: Record<string, string>;
}

export interface TraceGroup {
  correlation_id: string;
  nodes_involved: string[];
  event_count: number;
  first_event_at: string;
  last_event_at: string;
  duration_ms: number;
  has_error: boolean;
  is_running: boolean;
  latest_message: string;
}

export interface LogEntryQueryParams {
  correlation_id?: string;
  node_name?: string;
  level?: string;
  since?: string;
  limit?: number;
}

export interface TraceQueryParams {
  since?: string;
  limit?: number;
  running_only?: boolean;
}

function rowToLogEntry(r: Row): ModelLogEntry {
  return {
    entry_id: String(r.entry_id ?? ''),
    timestamp: String(r.timestamp ?? ''),
    node_name: String(r.node_name ?? ''),
    function_name: String(r.function_name ?? ''),
    level: String(r.level ?? ''),
    message: String(r.message ?? ''),
    correlation_id: r.correlation_id != null ? String(r.correlation_id) : null,
    duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null,
    metadata: (r.metadata as Record<string, string> | null) ?? {},
  };
}

function rowToTraceGroup(r: Row, nowMs: number): TraceGroup {
  const lastEventAt = String(r.last_event_at ?? '');
  const lastMs = lastEventAt ? Date.parse(lastEventAt) : 0;
  const is_running = !Number.isNaN(lastMs) && nowMs - lastMs < 60_000;
  return {
    correlation_id: String(r.correlation_id ?? ''),
    nodes_involved: Array.isArray(r.nodes_involved)
      ? (r.nodes_involved as string[])
      : String(r.nodes_involved ?? '').split(',').filter(Boolean),
    event_count: Number(r.event_count ?? 0),
    first_event_at: String(r.first_event_at ?? ''),
    last_event_at: lastEventAt,
    duration_ms: Number(r.duration_ms ?? 0),
    has_error: Boolean(r.has_error),
    is_running,
    latest_message: String(r.latest_message ?? ''),
  };
}

export interface ProjectionEnvelope {
  topic: string;
  source: 'postgres';
  projection_version: '078';
  generated_at: string;
  freshness: null;
  rows: Row[];
}

// TODO(OMN-10976): consolidate topic-to-query mappings with sqlite-projection-reader.ts
export class PostgresProjectionReader {
  private readonly pool: Pool;

  constructor(options: PostgresProjectionReaderOptions) {
    this.pool = new Pool({ connectionString: options.connectionString });
  }

  async readCorrelationTrace(correlationId: string): Promise<Row[]> {
    if (!correlationId || correlationId.length > 256) return [];
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT
          id,
          correlation_id,
          session_id,
          timestamp,
          task_type,
          delegated_to,
          delegated_by,
          quality_gate_passed,
          quality_gate_detail,
          quality_gates_checked,
          quality_gates_failed,
          cost_usd,
          cost_savings_usd,
          delegation_latency_ms,
          model_name,
          tokens_input,
          tokens_output,
          routing_rule,
          routing_confidence,
          prompt_text,
          response_text,
          created_at
        FROM delegation_events
        WHERE correlation_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT 200`,
        [correlationId],
      );
      return res.rows as Row[];
    } catch (err) {
      console.error(`[PostgresProjectionReader] error reading correlation trace ${correlationId}:`, err);
      return [];
    } finally {
      client.release();
    }
  }

  async readProjection(topic: string): Promise<ProjectionEnvelope> {
    let rows: Row[] = [];
    try {
      rows = await this.query(topic);
    } catch (err) {
      console.error(`[PostgresProjectionReader] error reading topic ${topic}:`, err);
    }
    return {
      topic,
      source: 'postgres',
      projection_version: '078',
      generated_at: new Date().toISOString(),
      freshness: null,
      rows,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async queryLogEntries(params: LogEntryQueryParams): Promise<ModelLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (params.correlation_id) {
        conditions.push(`correlation_id = $${idx++}`);
        values.push(params.correlation_id);
      }
      if (params.node_name) {
        conditions.push(`node_name = $${idx++}`);
        values.push(params.node_name);
      }
      if (params.level) {
        conditions.push(`level = $${idx++}`);
        values.push(params.level);
      }
      if (params.since) {
        conditions.push(`timestamp >= $${idx++}`);
        values.push(params.since);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(params.limit ?? 100, 1000);
      values.push(limit);

      const res = await client.query(
        `SELECT
          entry_id,
          timestamp,
          node_name,
          function_name,
          level,
          message,
          correlation_id,
          duration_ms,
          metadata
        FROM log_entries
        ${where}
        ORDER BY timestamp DESC
        LIMIT $${idx}`,
        values,
      );
      return (res.rows as Row[]).map(rowToLogEntry);
    } finally {
      client.release();
    }
  }

  async queryTraces(params: TraceQueryParams): Promise<TraceGroup[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = ['correlation_id IS NOT NULL'];
      const values: unknown[] = [];
      let idx = 1;

      if (params.since) {
        conditions.push(`timestamp >= $${idx++}`);
        values.push(params.since);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const limit = Math.min(params.limit ?? 50, 500);
      values.push(limit);

      const res = await client.query(
        `SELECT
          correlation_id,
          array_agg(DISTINCT node_name ORDER BY node_name) AS nodes_involved,
          COUNT(*) AS event_count,
          MIN(timestamp) AS first_event_at,
          MAX(timestamp) AS last_event_at,
          EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) * 1000 AS duration_ms,
          bool_or(level IN ('ERROR', 'CRITICAL')) AS has_error,
          (SELECT message FROM log_entries le2
            WHERE le2.correlation_id = le.correlation_id
            ORDER BY le2.timestamp DESC LIMIT 1) AS latest_message
        FROM log_entries le
        ${where}
        GROUP BY correlation_id
        ORDER BY MAX(timestamp) DESC
        LIMIT $${idx}`,
        values,
      );

      const now = Date.now();
      const rows = res.rows as Row[];
      const traces = rows.map((r) => rowToTraceGroup(r, now));

      if (params.running_only) {
        return traces.filter((t) => t.is_running);
      }
      return traces;
    } finally {
      client.release();
    }
  }

  private async query(topic: string): Promise<Row[]> {
    const client = await this.pool.connect();
    try {
      switch (topic) {
        case 'onex.snapshot.projection.delegation.decisions.v1': {
          const res = await client.query(`
            SELECT
              id,
              correlation_id,
              session_id,
              task_type,
              delegated_to,
              model_name,
              quality_gate_passed,
              quality_gate_detail,
              latency_ms,
              tokens_input,
              tokens_output,
              tokens_to_compliance,
              created_at
            FROM delegation_events
            ORDER BY created_at DESC
            LIMIT 500
          `);
          return res.rows as Row[];
        }

        case 'onex.snapshot.projection.delegation.summary.v1': {
          const summaryRes = await client.query(`
            SELECT
              COUNT(*)                                                                    AS total_events,
              COALESCE(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END), 0)          AS quality_passed_count,
              COALESCE(SUM(CASE WHEN NOT quality_gate_passed THEN 1 ELSE 0 END), 0)      AS quality_failed_count,
              COALESCE(AVG(latency_ms), 0)                                               AS avg_latency_ms,
              COALESCE(MAX(EXTRACT(EPOCH FROM created_at)), 0)                           AS latest_event_at,
              0                                                                          AS total_savings_usd
            FROM delegation_events
          `);
          const byTaskTypeRes = await client.query(`
            SELECT task_type AS "taskType", COUNT(*) AS count
            FROM delegation_events
            GROUP BY task_type ORDER BY count DESC
          `);
          const byModelRes = await client.query(`
            SELECT delegated_to AS model, COUNT(*) AS count
            FROM delegation_events
            GROUP BY delegated_to ORDER BY count DESC
          `);
          const summary = summaryRes.rows[0] as Row;
          const total = Number(summary?.total_events ?? 0);
          const passed = Number(summary?.quality_passed_count ?? 0);
          return [{
            totalDelegations: total,
            qualityGatePassRate: total > 0 ? passed / total : 0,
            qualityGatePassed: passed,
            qualityGateTotal: total,
            totalSavingsUsd: Number(summary?.total_savings_usd ?? 0),
            avgLatencyMs: Number(summary?.avg_latency_ms ?? 0),
            latestEventAt: Number(summary?.latest_event_at ?? 0),
            total_events: total,
            quality_passed_count: passed,
            quality_failed_count: Number(summary?.quality_failed_count ?? 0),
            avg_latency_ms: Number(summary?.avg_latency_ms ?? 0),
            latest_event_at: Number(summary?.latest_event_at ?? 0),
            byTaskType: byTaskTypeRes.rows as Row[],
            byModel: byModelRes.rows as Row[],
          }];
        }

        case 'onex.snapshot.projection.savings.v1': {
          const res = await client.query(`
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
          `);
          return res.rows as Row[];
        }

        case 'onex.snapshot.projection.savings.summary.v1': {
          const res = await client.query(`
            SELECT
              COUNT(*)                          AS event_count,
              COALESCE(SUM(local_cost_usd), 0)  AS total_local_cost_usd,
              COALESCE(SUM(cloud_cost_usd), 0)  AS total_cloud_cost_usd,
              COALESCE(SUM(savings_usd), 0)     AS total_savings_usd
            FROM savings_estimates
          `);
          return res.rows as Row[];
        }

        case 'onex.snapshot.projection.cost.savings-overview.v1': {
          return this.readCostSavingsOverviewProjection(client);
        }

        case 'onex.snapshot.projection.delegation.savings.v1': {
          return this.readDelegationSavingsProjection(client);
        }

        case 'onex.snapshot.projection.live-events.v1': {
          return this.readLiveEventsProjection(client);
        }

        case 'onex.snapshot.projection.delegation.model-routing.v1': {
          const routingRes = await client.query(`
            SELECT
              delegated_to                                                            AS model_alias,
              model_name,
              task_type,
              COUNT(*)                                                                AS event_count,
              COALESCE(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END), 0)      AS quality_passed,
              COALESCE(AVG(latency_ms), 0)                                           AS avg_latency_ms
            FROM delegation_events
            GROUP BY delegated_to, model_name, task_type
            ORDER BY event_count DESC
          `);
          const totalRes = await client.query(`SELECT COUNT(*) AS total FROM delegation_events`);
          const tracesRes = await client.query(`
            SELECT id, correlation_id, task_type, model_name, delegated_to,
                   routing_rule, routing_confidence, routing_candidates,
                   latency_ms, quality_gate_passed, created_at
            FROM delegation_events
            ORDER BY created_at DESC
            LIMIT 20
          `);
          const routingRows = routingRes.rows as Row[];
          const totalDelegations = Number((totalRes.rows[0] as Row)?.total ?? 0);

          const modelMap = new Map<string, { total_count: number; quality_passed: number; latency_sum: number; latency_count: number; task_types: Set<string>; top_task: string; top_count: number; model_name: string }>();
          for (const r of routingRows) {
            const alias = r.model_alias as string;
            const count = Number(r.event_count);
            let entry = modelMap.get(alias);
            if (!entry) {
              entry = { total_count: 0, quality_passed: 0, latency_sum: 0, latency_count: 0, task_types: new Set(), top_task: '', top_count: 0, model_name: (r.model_name as string) ?? alias };
              modelMap.set(alias, entry);
            }
            entry.total_count += count;
            entry.quality_passed += Number(r.quality_passed) || 0;
            entry.latency_sum += (Number(r.avg_latency_ms) || 0) * count;
            entry.latency_count += count;
            entry.task_types.add(r.task_type as string);
            if (count > entry.top_count) { entry.top_task = r.task_type as string; entry.top_count = count; }
          }

          const byModel = [...modelMap.entries()].map(([alias, m]) => ({
            model_name: alias,
            total_count: m.total_count,
            pct_of_total: totalDelegations > 0 ? m.total_count / totalDelegations : 0,
            top_task_type: m.top_task,
            avg_latency_ms: m.latency_count > 0 ? m.latency_sum / m.latency_count : undefined,
            qg_pass_rate: m.total_count > 0 ? m.quality_passed / m.total_count : undefined,
            task_types: [...m.task_types],
          })).sort((a, b) => b.total_count - a.total_count);

          const rows = routingRows.map((r) => {
            const alias = r.model_alias as string;
            const modelEntry = modelMap.get(alias);
            const modelTotal = modelEntry?.total_count ?? 1;
            const eventCount = Number(r.event_count);
            return {
              model_name: alias,
              task_type: r.task_type,
              count: eventCount,
              pct_of_model: modelTotal > 0 ? eventCount / modelTotal : 0,
              pct_of_total: totalDelegations > 0 ? eventCount / totalDelegations : 0,
            };
          });

          return [{
            total_delegations: totalDelegations,
            rows,
            by_model: byModel,
            decision_traces: tracesRes.rows as Row[],
            captured_at: new Date().toISOString(),
            provisioned: true,
          }];
        }

        case 'onex.snapshot.projection.delegation.quality-gate.v1': {
          const totalsRes = await client.query(`
            SELECT
              COUNT(*)                                                                 AS total_checks,
              COALESCE(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END), 0)       AS total_passed,
              COALESCE(SUM(CASE WHEN NOT quality_gate_passed THEN 1 ELSE 0 END), 0)   AS total_failed
            FROM delegation_events
          `);
          const byDetailRes = await client.query(`
            SELECT
              quality_gate_detail                                                      AS check_detail,
              COUNT(*)                                                                 AS total_checks,
              COALESCE(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END), 0)       AS passed_count,
              COALESCE(SUM(CASE WHEN NOT quality_gate_passed THEN 1 ELSE 0 END), 0)   AS failed_count,
              COALESCE(AVG(quality_gates_checked), 0)                                 AS avg_gates_checked,
              COALESCE(AVG(quality_gates_failed), 0)                                  AS avg_gates_failed
            FROM delegation_events
            WHERE quality_gate_detail IS NOT NULL
            GROUP BY quality_gate_detail
            ORDER BY total_checks DESC
          `);
          const qgTotals = totalsRes.rows[0] as Row;
          const qgByDetail = byDetailRes.rows as Row[];
          const totalChecks = Number(qgTotals?.total_checks ?? 0);
          const totalPassed = Number(qgTotals?.total_passed ?? 0);
          const totalFailed = Number(qgTotals?.total_failed ?? 0);

          const byCheckType = [
            { check_type: 'deterministic' as const, passed: totalPassed, failed: totalFailed, total: totalChecks, pass_rate: totalChecks > 0 ? totalPassed / totalChecks : 0 },
          ];
          const failureCategories = qgByDetail
            .filter((r) => Number(r.failed_count) > 0)
            .map((r) => ({
              category: (r.check_detail as string) ?? 'unknown',
              count: Number(r.failed_count),
              pct_of_failures: totalFailed > 0 ? Number(r.failed_count) / totalFailed : 0,
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

        case 'onex.snapshot.projection.delegation.token-usage.v1': {
          return this.readDelegationTokenUsageProjection(client);
        }

        case 'onex.snapshot.projection.node-registry.v1': {
          const res = await client.query(`
            SELECT
              node_id,
              node_name,
              node_type,
              service_name,
              version,
              status,
              registered_at,
              last_seen_at
            FROM node_service_registry
            ORDER BY registered_at DESC
            LIMIT 500
          `);
          return res.rows as Row[];
        }

        case 'onex.snapshot.projection.mcp-tools.v1': {
          const res = await client.query(`
            SELECT
              service_name AS name,
              COALESCE(
                NULLIF(metadata->>'description', ''),
                NULLIF(metadata->>'tool_description', ''),
                ''
              ) AS description,
              COALESCE(created_at, updated_at, projected_at)::text AS "registeredAt",
              COALESCE(
                NULLIF(health_status, ''),
                CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
                'unknown'
              ) AS status,
              COALESCE(
                NULLIF(metadata->>'modelId', ''),
                NULLIF(metadata->>'model_id', ''),
                ''
              ) AS "modelId",
              COALESCE(
                NULLIF(metadata->>'correlationId', ''),
                NULLIF(metadata->>'correlation_id', ''),
                ''
              ) AS "correlationId"
            FROM node_service_registry
            WHERE is_active IS TRUE
              AND (
                service_type IN ('mcp', 'mcp_tool', 'mcp-tools')
                OR metadata ? 'mcp_tool_name'
                OR metadata ? 'tool_name'
                OR metadata->>'kind' = 'mcp_tool'
              )
            ORDER BY COALESCE(created_at, updated_at, projected_at) DESC
            LIMIT 500
          `);
          return res.rows as Row[];
        }

        case 'onex.snapshot.projection.hackathon_pipeline_events.v1': {
          const res = await client.query(`
            SELECT
              correlation_id || '-completed' AS id,
              CASE WHEN contract_passed THEN 'success' ELSE 'error' END AS type,
              COALESCE(timestamp, created_at)::text AS timestamp,
              'node_generation_consumer' AS source,
              CASE
                WHEN contract_passed
                  THEN 'Node generation completed: ' || task_description
                ELSE 'Node generation failed validation: ' || task_description
              END AS message,
              correlation_id AS "correlationId"
            FROM generation_events
            ORDER BY COALESCE(timestamp, created_at) ASC
            LIMIT 500
          `);
          return res.rows as Row[];
        }

        default:
          return [];
      }
    } finally {
      client.release();
    }
  }

  private async readDelegationSavingsProjection(
    client: { query: (sql: string) => Promise<{ rows: Row[] }> },
  ): Promise<Row[]> {
    let savingsRows: Row[] = [];
    let eventRows: Row[] = [];

    try {
      const savingsRes = await client.query(`
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
      `);
      savingsRows = savingsRes.rows;
    } catch (err) {
      this.handleProjectionCompatibilityError(err, 'savings_estimates');
    }

    try {
      const eventRes = await client.query(`
        -- JSONB access keeps this projection compatible with older deployments
        -- where optional runtime metric columns may not exist yet.
        WITH events AS (
          SELECT to_jsonb(delegation_events) AS e
          FROM delegation_events
        )
        SELECT
          COALESCE(NULLIF(e->>'session_id', ''), NULLIF(e->>'correlation_id', ''), e->>'id') AS session_id,
          COALESCE(e->>'task_type', '') AS task_type,
          COALESCE(NULLIF(e->>'model_name', ''), NULLIF(e->>'delegated_to', ''), 'local') AS model_name,
          COALESCE(NULLIF(e->>'cost_usd', '')::numeric, 0) AS local_cost_usd,
          COALESCE(NULLIF(e->>'cost_usd', '')::numeric, 0) + COALESCE(NULLIF(e->>'cost_savings_usd', '')::numeric, 0) AS cloud_cost_usd,
          COALESCE(NULLIF(e->>'cost_savings_usd', '')::numeric, 0) AS savings_usd,
          'claude-opus-4.1' AS baseline_model,
          'runtime-delegation-events' AS pricing_manifest_version,
          CASE WHEN COALESCE(NULLIF(e->>'cost_savings_usd', '')::numeric, 0) > 0 THEN 'measured' ELSE 'estimated' END AS savings_method,
          CASE WHEN COALESCE(NULLIF(e->>'tokens_input', '')::numeric, 0) + COALESCE(NULLIF(e->>'tokens_output', '')::numeric, 0) > 0 THEN 'measured' ELSE 'unknown' END AS usage_source,
          COALESCE(NULLIF(e->>'tokens_input', '')::numeric, 0) AS prompt_tokens,
          COALESCE(NULLIF(e->>'tokens_output', '')::numeric, 0) AS completion_tokens,
          NULLIF(e->>'tokens_to_compliance', '')::numeric AS tokens_to_compliance,
          COALESCE(NULLIF(e->>'delegation_latency_ms', '')::numeric, NULLIF(e->>'latency_ms', '')::numeric) AS latency_ms,
          COALESCE(e->>'created_at', e->>'timestamp') AS created_at,
          e->>'prompt_text' AS prompt_text,
          e->>'response_text' AS response_text
        FROM events
        ORDER BY COALESCE(e->>'created_at', e->>'timestamp') DESC
        LIMIT 500
      `);
      eventRows = eventRes.rows;
    } catch (err) {
      this.handleProjectionCompatibilityError(err, 'delegation_events');
    }

    const sessions = this.mergeDelegationSessions(savingsRows, eventRows);
    sessions.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    const numericFields = [
      'local_cost_usd', 'cloud_cost_usd', 'savings_usd',
      'prompt_tokens', 'completion_tokens', 'tokens_to_compliance', 'latency_ms',
    ];
    const coercedSessions = sessions.map((row) => {
      const coerced: Row = { ...row };
      for (const field of numericFields) {
        if (coerced[field] != null) coerced[field] = Number(coerced[field]);
      }
      return coerced;
    });

    const sum = (key: string): number =>
      coercedSessions.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const latest = coercedSessions[0] ?? {};

    return [{
      cumulative_savings_usd: sum('savings_usd'),
      cumulative_local_cost_usd: sum('local_cost_usd'),
      cumulative_cloud_cost_usd: sum('cloud_cost_usd'),
      baseline_model: (latest.baseline_model as string | undefined) ?? 'claude-opus-4.1',
      pricing_manifest_version: (latest.pricing_manifest_version as string | undefined) ?? 'runtime-delegation-events',
      session_count: coercedSessions.length,
      sessions: coercedSessions.slice(0, 500),
      captured_at: new Date().toISOString(),
      provisioned: true,
    }];
  }

  private handleProjectionCompatibilityError(err: unknown, source: string): void {
    const pgErr = err as PostgresError;
    const message = String(pgErr?.message ?? '');
    const isCompatibilityMiss =
      pgErr?.code === '42P01' ||
      pgErr?.code === '42703' ||
      message.includes('does not exist');
    if (isCompatibilityMiss) return;

    console.error(`[PostgresProjectionReader] failed to read ${source} for delegation savings projection:`, err);
    throw err;
  }

  private async readLiveEventsProjection(
    client: { query: (sql: string) => Promise<{ rows: Row[] }> },
  ): Promise<Row[]> {
    const events: Row[] = [];

    try {
      const eventLogRes = await client.query(`
        SELECT
          COALESCE(
            NULLIF(envelope->>'id', ''),
            NULLIF(envelope->>'correlation_id', ''),
            NULLIF(envelope->>'correlationId', ''),
            'bus-log-' || id::text
          ) AS id,
          COALESCE(
            NULLIF(envelope->>'type', ''),
            NULLIF(envelope->>'event_type', ''),
            NULLIF(envelope->>'kind', ''),
            'BUS_MESSAGE'
          ) AS type,
          COALESCE(
            NULLIF(envelope->>'timestamp', ''),
            NULLIF(envelope->>'created_at', ''),
            created_at::text
          ) AS timestamp,
          COALESCE(
            NULLIF(envelope->>'source', ''),
            NULLIF(envelope->>'producer', ''),
            NULLIF(envelope->>'service', ''),
            'event_bus'
          ) AS source,
          COALESCE(
            NULLIF(envelope->>'topic', ''),
            NULLIF(envelope->>'subject', ''),
            'delegation_event_log'
          ) AS topic,
          COALESCE(
            NULLIF(envelope->>'summary', ''),
            NULLIF(envelope->>'message', ''),
            NULLIF(envelope->>'detail', ''),
            COALESCE(NULLIF(envelope->>'type', ''), 'BUS_MESSAGE')
          ) AS summary,
          COALESCE(
            NULLIF(envelope->>'correlation_id', ''),
            NULLIF(envelope->>'correlationId', ''),
            NULLIF(envelope->'payload'->>'correlation_id', ''),
            NULLIF(envelope->'payload'->>'correlationId', ''),
            ''
          ) AS correlation_id,
          COALESCE(envelope->'payload', envelope->'data', envelope)::text AS payload
        FROM delegation_event_log
        ORDER BY created_at DESC
        LIMIT 500
      `);
      events.push(...eventLogRes.rows);
    } catch (err) {
      this.handleProjectionCompatibilityError(err, 'delegation_event_log');
    }

    try {
      const delegationRes = await client.query(`
        WITH rows AS (
          SELECT to_jsonb(delegation_events) AS e
          FROM delegation_events
          ORDER BY created_at DESC
          LIMIT 500
        )
        SELECT
          'delegation-' || COALESCE(NULLIF(e->>'correlation_id', ''), e->>'id') AS id,
          CASE WHEN COALESCE(NULLIF(e->>'quality_gate_passed', '')::boolean, false)
            THEN 'DELEGATION_COMPLETED'
            ELSE 'DELEGATION_FAILED'
          END AS type,
          COALESCE(e->>'timestamp', e->>'created_at') AS timestamp,
          'delegation_runtime' AS source,
          'onex.evt.delegation.completed.v1' AS topic,
          COALESCE(NULLIF(e->>'task_type', ''), 'task')
            || ' delegated to '
            || COALESCE(NULLIF(e->>'model_name', ''), NULLIF(e->>'delegated_to', ''), 'local model')
            || ' · '
            || (
              COALESCE(NULLIF(e->>'tokens_input', '')::numeric, 0)
              + COALESCE(NULLIF(e->>'tokens_output', '')::numeric, 0)
            )::text
            || ' tokens · '
            || COALESCE(NULLIF(e->>'delegation_latency_ms', ''), NULLIF(e->>'latency_ms', ''), '0')
            || 'ms' AS summary,
          COALESCE(NULLIF(e->>'correlation_id', ''), e->>'session_id', e->>'id') AS correlation_id,
          e::text AS payload
        FROM rows
      `);
      events.push(...delegationRes.rows);
    } catch (err) {
      this.handleProjectionCompatibilityError(err, 'delegation_events');
    }

    try {
      const generationRes = await client.query(`
        SELECT
          'generation-' || correlation_id AS id,
          CASE WHEN contract_passed THEN 'NODE_GENERATION_COMPLETED' ELSE 'NODE_GENERATION_FAILED' END AS type,
          COALESCE(timestamp, created_at)::text AS timestamp,
          'node_generation_consumer' AS source,
          'onex.evt.node-generation.completed.v1' AS topic,
          CASE WHEN contract_passed THEN 'Completed node generation · ' ELSE 'Failed node generation · ' END
            || task_description AS summary,
          correlation_id,
          to_jsonb(generation_events)::text AS payload
        FROM generation_events
        ORDER BY COALESCE(timestamp, created_at) DESC
        LIMIT 500
      `);
      events.push(...generationRes.rows);
    } catch (err) {
      this.handleProjectionCompatibilityError(err, 'generation_events');
    }

    return events
      .sort((a, b) => this.timestampValue(b.timestamp) - this.timestampValue(a.timestamp))
      .slice(0, 500);
  }

  private sessionKey(row: Row, index: number, source: 'postgres-savings' | 'postgres-events'): string {
    const key = String(row.session_id ?? '').trim();
    return key || `${source}-row-${index}-${String(row.created_at ?? '')}-${String(row.model_name ?? '')}`;
  }

  private mergeDelegationSessions(savingsRows: Row[], eventRows: Row[]): Row[] {
    const merged = new Map<string, Row>();
    savingsRows.forEach((row, index) => {
      merged.set(this.sessionKey(row, index, 'postgres-savings'), row);
    });

    eventRows.forEach((eventRow, index) => {
      const key = this.sessionKey(eventRow, index, 'postgres-events');
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
        created_at: this.timestampValue(eventRow.created_at) > this.timestampValue(existing.created_at)
          ? eventRow.created_at
          : existing.created_at,
      });
    });

    return [...merged.values()];
  }

  private timestampValue(value: unknown): number {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private async readDelegationTokenUsageProjection(
    client: { query: (sql: string) => Promise<{ rows: Row[] }> },
  ): Promise<Row[]> {
    const res = await client.query(`
      SELECT
        COALESCE(NULLIF(delegated_to, ''), NULLIF(model_name, ''), 'delegated-runtime') AS model_id,
        COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'delegated-runtime') AS model_name,
        COUNT(*) AS delegation_count,
        COALESCE(SUM(COALESCE(tokens_input, 0)), 0) AS prompt_tokens,
        COALESCE(SUM(COALESCE(tokens_output, 0)), 0) AS completion_tokens,
        COALESCE(SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)), 0) AS total_tokens,
        COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS estimated_cost_usd
      FROM delegation_events
      GROUP BY
        COALESCE(NULLIF(delegated_to, ''), NULLIF(model_name, ''), 'delegated-runtime'),
        COALESCE(NULLIF(model_name, ''), NULLIF(delegated_to, ''), 'delegated-runtime')
      ORDER BY total_tokens DESC
    `);

    const byModel = res.rows.filter((row) => Number(row.total_tokens ?? 0) > 0).map((row) => {
      const promptTokens = Number(row.prompt_tokens ?? 0);
      const completionTokens = Number(row.completion_tokens ?? 0);
      const totalTokens = Number(row.total_tokens ?? 0);
      return {
        model_id: String(row.model_id ?? 'delegated-runtime'),
        model_name: String(row.model_name ?? row.model_id ?? 'delegated-runtime'),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
        usage_source: 'measured',
        token_provenance: 'measured',
      };
    });

    const totalPromptTokens = byModel.reduce((sum, row) => sum + row.prompt_tokens, 0);
    const totalCompletionTokens = byModel.reduce((sum, row) => sum + row.completion_tokens, 0);
    const provenanceSummary = byModel.reduce(
      (summary, row) => {
        const provenance = row.token_provenance as keyof typeof summary;
        return {
          ...summary,
          [provenance]: summary[provenance] + 1,
        };
      },
      { measured: 0, estimated: 0, unknown: 0 },
    );

    return [{
      total_prompt_tokens: totalPromptTokens,
      total_completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
      total_estimated_cost_usd: byModel.reduce((sum, row) => sum + row.estimated_cost_usd, 0),
      provenance_summary: provenanceSummary,
      by_model: byModel,
      captured_at: new Date().toISOString(),
      provisioned: byModel.length > 0,
    }];
  }

  private async readCostSavingsOverviewProjection(
    client: { query: (sql: string) => Promise<{ rows: Row[] }> },
  ): Promise<Row[]> {
    const [delegationSavings] = await this.readDelegationSavingsProjection(client);
    const sessions = (delegationSavings?.sessions as Row[] | undefined) ?? [];
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
    const measuredSessions = sessions.filter((session) => sessionTokens(session) > 0);
    const omittedTelemetryRows = sessions.length - measuredSessions.length;

    for (const session of measuredSessions) {
      const displayName = String(session.model_name ?? session.task_type ?? 'delegated-runtime');
      const modelId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delegated-runtime';
      const tokens = sessionTokens(session);
      const cost = Number(session.local_cost_usd ?? 0);
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
      existing.cost_usd += cost;
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
    const complianceTokensTotal = measuredSessions.reduce(
      (sum, row) => row.tokens_to_compliance != null
        ? sum + Number(row.tokens_to_compliance)
        : sum,
      0,
    );
    const recentRuns = measuredSessions.slice(0, 20).map((session) => {
      const promptTokens = Number(session.prompt_tokens ?? 0);
      const completionTokens = Number(session.completion_tokens ?? 0);
      const totalTokens = promptTokens + completionTokens;
      return {
        session_id: String(session.session_id ?? ''),
        task_type: String(session.task_type ?? ''),
        model_name: String(session.model_name ?? session.task_type ?? 'delegated-runtime'),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        savings_usd: Number(session.savings_usd ?? 0),
        latency_ms: session.latency_ms == null ? null : Number(session.latency_ms),
        created_at: String(session.created_at ?? ''),
        token_provenance: 'measured',
      };
    });
    const warnings = omittedTelemetryRows > 0
      ? [`Omitted ${omittedTelemetryRows} delegation row${omittedTelemetryRows === 1 ? '' : 's'} without token telemetry.`]
      : [];

    return [{
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
      recent_runs: recentRuns,
      measured_run_count: measuredSessions.length,
      zero_token_run_count: omittedTelemetryRows,
      warnings,
      provisioned: measuredSessions.length > 0,
    }];
  }
}
