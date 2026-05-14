import { Pool } from 'pg';

export interface PostgresProjectionReaderOptions {
  connectionString: string;
}

type Row = Record<string, unknown>;

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
            FROM delegation_events GROUP BY task_type ORDER BY count DESC
          `);
          const byModelRes = await client.query(`
            SELECT delegated_to AS model, COUNT(*) AS count
            FROM delegation_events GROUP BY delegated_to ORDER BY count DESC
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

        case 'onex.snapshot.projection.delegation.savings.v1': {
          const savingsRes = await client.query(`
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
          const aggRes = await client.query(`
            SELECT
              COALESCE(SUM(savings_usd), 0)    AS cumulative_savings_usd,
              COALESCE(SUM(local_cost_usd), 0) AS cumulative_local_cost_usd,
              COALESCE(SUM(cloud_cost_usd), 0) AS cumulative_cloud_cost_usd,
              COUNT(*)                          AS session_count
            FROM savings_estimates
          `);
          const savingsRows = savingsRes.rows as Row[];
          const savingsAgg = aggRes.rows[0] as Row;
          const latestSaving = savingsRows[0];
          return [{
            cumulative_savings_usd: savingsAgg?.cumulative_savings_usd,
            cumulative_local_cost_usd: savingsAgg?.cumulative_local_cost_usd,
            cumulative_cloud_cost_usd: savingsAgg?.cumulative_cloud_cost_usd,
            baseline_model: (latestSaving?.baseline_model as string) ?? '',
            pricing_manifest_version: (latestSaving?.pricing_manifest_version as string) ?? '',
            session_count: savingsAgg?.session_count,
            sessions: savingsRows.map((r) => ({
              session_id: r.session_id,
              task_type: r.model_local,
              local_cost_usd: r.local_cost_usd,
              cloud_cost_usd: r.cloud_cost_usd,
              savings_usd: r.savings_usd,
              baseline_model: r.baseline_model,
              pricing_manifest_version: r.pricing_manifest_version,
              savings_method: r.savings_method,
              usage_source: r.usage_source,
              model_name: r.model_local,
              created_at: r.created_at,
            })),
            captured_at: new Date().toISOString(),
            provisioned: true,
          }];
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
          const res = await client.query(`
            SELECT
              delegated_to                                  AS model_alias,
              model_name,
              COUNT(*)                                      AS delegation_count,
              COALESCE(SUM(tokens_input), 0)                AS total_tokens_input,
              COALESCE(SUM(tokens_output), 0)               AS total_tokens_output,
              COALESCE(SUM(tokens_input + tokens_output), 0) AS total_tokens,
              COALESCE(SUM(tokens_to_compliance), 0)        AS total_tokens_to_compliance
            FROM delegation_events
            GROUP BY delegated_to, model_name
            ORDER BY total_tokens DESC
          `);
          return res.rows as Row[];
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

        default:
          return [];
      }
    } finally {
      client.release();
    }
  }
}
