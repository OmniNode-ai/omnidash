/**
 * DelegationProjection -- DB-backed projection for the Delegation dashboard (OMN-2650)
 *
 * Standalone DB-backed projection utility that queries delegation_events and
 * delegation_shadow_comparisons tables. NOT registered with ProjectionService
 * (no fanout, no WS invalidation, no ingest pipeline). Keeping it standalone
 * makes the contract honest -- see OMN-2650 Architecture Decision.
 *
 * Routes call ensureFresh() / ensureFreshForWindow() and access sub-fields
 * instead of importing storage or executing SQL directly.
 *
 * Source tables: delegation_events, delegation_shadow_comparisons
 *   (defined in shared/intelligence-schema.ts)
 *
 * Per OMN-2325 architectural rule: route files must not import DB accessors
 * directly. All data access goes through this projection.
 */

import { sql } from 'drizzle-orm';
import type {
  DelegationSummary,
  DelegationByTaskType,
  DelegationCostSavingsTrendPoint,
  DelegationQualityGatePoint,
  DelegationShadowDivergence,
  DelegationTrendPoint,
} from '@shared/delegation-types';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface DelegationPayload {
  summary: DelegationSummary;
  byTaskType: DelegationByTaskType[];
  costSavings: DelegationCostSavingsTrendPoint[];
  qualityGates: DelegationQualityGatePoint[];
  shadowDivergence: DelegationShadowDivergence[];
  trend: DelegationTrendPoint[];
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Helpers
// ============================================================================

const ACCEPTED_WINDOWS = new Set(['24h', '7d', '30d']);

function windowToInterval(window: string): string {
  switch (window) {
    case '24h':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    default:
      throw new Error(
        `windowToInterval: unrecognised window "${window}". Accepted values: '24h', '7d', '30d'.`
      );
  }
}

// ============================================================================
// Projection
// ============================================================================

export class DelegationProjection extends DbBackedProjectionView<DelegationPayload> {
  readonly viewId = 'delegation';

  /** Per-window in-flight coalescing guard. */
  private windowInFlight = new Map<string, Promise<DelegationPayload>>();
  /** Per-window cooldown timestamps. */
  private windowLastDispatched = new Map<string, number>();
  /** Per-window cached snapshots. */
  private windowLastSnapshot = new Map<string, DelegationPayload>();
  private static readonly COOLDOWN_MS = 500;

  protected emptyPayload(): DelegationPayload {
    return {
      summary: {
        total_delegations: 0,
        delegation_rate: 0,
        quality_gate_pass_rate: 0,
        total_cost_savings_usd: 0,
        avg_cost_savings_usd: 0,
        shadow_divergence_rate: 0,
        total_shadow_comparisons: 0,
        avg_delegation_latency_ms: 0,
        counts: {
          total: 0,
          quality_gate_passed: 0,
          quality_gate_failed: 0,
          shadow_diverged: 0,
          shadow_agreed: 0,
        },
        quality_gate_trend: [],
      },
      byTaskType: [],
      costSavings: [],
      qualityGates: [],
      shadowDivergence: [],
      trend: [],
    };
  }

  protected async querySnapshot(db: Db): Promise<DelegationPayload> {
    return this._queryForWindow(db, '7d');
  }

  override reset(): void {
    super.reset();
    this.windowInFlight.clear();
    this.windowLastDispatched.clear();
    this.windowLastSnapshot.clear();
  }

  // --------------------------------------------------------------------------
  // Public API used by route handlers
  // --------------------------------------------------------------------------

  async ensureFreshForWindow(window: string): Promise<DelegationPayload> {
    if (!ACCEPTED_WINDOWS.has(window)) {
      throw new Error(
        `ensureFreshForWindow: invalid window "${window}". ` +
          `Accepted values are: ${[...ACCEPTED_WINDOWS].join(', ')}.`
      );
    }

    const inflight = this.windowInFlight.get(window);
    if (inflight !== undefined) return inflight;

    const lastDispatched = this.windowLastDispatched.get(window) ?? 0;
    if (Date.now() - lastDispatched < DelegationProjection.COOLDOWN_MS) {
      const cached = this.windowLastSnapshot.get(window);
      if (cached !== undefined) return cached;
    }

    const db = tryGetIntelligenceDb();
    if (!db) return this.emptyPayload();

    const promise = this._queryForWindow(db, window)
      .then((payload) => {
        this.windowLastSnapshot.set(window, payload);
        return payload;
      })
      .finally(() => {
        this.windowInFlight.delete(window);
      });

    this.windowLastDispatched.set(window, Date.now());
    this.windowInFlight.set(window, promise);
    return promise;
  }

  // --------------------------------------------------------------------------
  // Private query methods
  // --------------------------------------------------------------------------

  private async _queryForWindow(db: Db, window: string): Promise<DelegationPayload> {
    const interval = windowToInterval(window);

    const [summary, byTaskType, costSavings, qualityGates, shadowDivergence, trend] =
      await Promise.all([
        this._querySummary(db, interval),
        this._queryByTaskType(db, interval),
        this._queryCostSavings(db, interval, window),
        this._queryQualityGates(db, interval, window),
        this._queryShadowDivergence(db, interval),
        this._queryTrend(db, interval, window),
      ]);

    return { summary, byTaskType, costSavings, qualityGates, shadowDivergence, trend };
  }

  private async _querySummary(db: Db, interval: string): Promise<DelegationSummary> {
    // Query delegation_events aggregate
    const delegationRows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE quality_gate_passed = true)::int              AS qg_passed,
        COUNT(*) FILTER (WHERE quality_gate_passed = false)::int             AS qg_failed,
        COALESCE(SUM(cost_savings_usd::numeric), 0)                          AS total_cost_savings,
        COALESCE(AVG(cost_savings_usd::numeric), 0)                          AS avg_cost_savings,
        COALESCE(AVG(delegation_latency_ms), 0)::int                         AS avg_latency
      FROM delegation_events
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
    `);

    // Query delegation_shadow_comparisons aggregate
    const shadowRows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                         AS total_shadow,
        COUNT(*) FILTER (WHERE divergence_detected = true)::int              AS diverged,
        COUNT(*) FILTER (WHERE divergence_detected = false)::int             AS agreed
      FROM delegation_shadow_comparisons
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
    `);

    // Delegation rate: delegated / total agent_actions in window
    // This is a provisional proxy metric (see ticket note).
    const rateRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS action_count
      FROM agent_actions
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
    `);

    const d = ((delegationRows.rows ?? delegationRows)[0] as Record<string, unknown>) ?? {};
    const s = ((shadowRows.rows ?? shadowRows)[0] as Record<string, unknown>) ?? {};
    const r = ((rateRows.rows ?? rateRows)[0] as Record<string, unknown>) ?? {};

    const total = Number(d.total ?? 0);
    const qgPassed = Number(d.qg_passed ?? 0);
    const qgFailed = Number(d.qg_failed ?? 0);
    const totalShadow = Number(s.total_shadow ?? 0);
    const diverged = Number(s.diverged ?? 0);
    const agreed = Number(s.agreed ?? 0);
    const actionCount = Number(r.action_count ?? 0);

    const delegationRate = actionCount > 0 ? total / actionCount : 0;
    const qgPassRate = total > 0 ? qgPassed / total : 0;
    const shadowDivRate = totalShadow > 0 ? diverged / totalShadow : 0;

    // Quality gate trend: daily pass rate
    const qgTrendRows = await db.execute(sql`
      SELECT
        timestamp::date::text AS date,
        ROUND(AVG(CASE WHEN quality_gate_passed THEN 1.0 ELSE 0.0 END)::numeric, 4) AS value
      FROM delegation_events
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY timestamp::date
      ORDER BY timestamp::date ASC
    `);
    const qgTrend = ((qgTrendRows.rows ?? qgTrendRows) as Record<string, unknown>[]).map((row) => ({
      date: String(row.date ?? ''),
      value: Number(row.value ?? 0),
    }));

    return {
      total_delegations: total,
      delegation_rate: Math.round(delegationRate * 10000) / 10000,
      quality_gate_pass_rate: Math.round(qgPassRate * 10000) / 10000,
      total_cost_savings_usd: Number(Number(d.total_cost_savings ?? 0).toFixed(2)),
      avg_cost_savings_usd: Number(Number(d.avg_cost_savings ?? 0).toFixed(2)),
      shadow_divergence_rate: Math.round(shadowDivRate * 10000) / 10000,
      total_shadow_comparisons: totalShadow,
      avg_delegation_latency_ms: Number(d.avg_latency ?? 0),
      counts: {
        total,
        quality_gate_passed: qgPassed,
        quality_gate_failed: qgFailed,
        shadow_diverged: diverged,
        shadow_agreed: agreed,
      },
      quality_gate_trend: qgTrend,
    };
  }

  private async _queryByTaskType(db: Db, interval: string): Promise<DelegationByTaskType[]> {
    const rows = await db.execute(sql`
      SELECT
        de.task_type,
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE de.quality_gate_passed = true)::int           AS qg_passed,
        COALESCE(SUM(de.cost_savings_usd::numeric), 0)                       AS total_cost_savings,
        COALESCE(AVG(de.cost_savings_usd::numeric), 0)                       AS avg_cost_savings,
        COALESCE(AVG(de.delegation_latency_ms), 0)::int                      AS avg_latency,
        COALESCE((
          SELECT COUNT(*) FROM delegation_shadow_comparisons dsc
          WHERE dsc.task_type = de.task_type
            AND dsc.divergence_detected = true
            AND dsc.timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        ), 0)::int AS shadow_divergences
      FROM delegation_events de
      WHERE de.timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY de.task_type
      ORDER BY total DESC
    `);

    return ((rows.rows ?? rows) as Record<string, unknown>[]).map((r) => {
      const total = Number(r.total ?? 0);
      const qgPassed = Number(r.qg_passed ?? 0);
      return {
        task_type: String(r.task_type ?? ''),
        total,
        quality_gate_passed: qgPassed,
        quality_gate_pass_rate: total > 0 ? Math.round((qgPassed / total) * 10000) / 10000 : 0,
        total_cost_savings_usd: Number(Number(r.total_cost_savings ?? 0).toFixed(2)),
        avg_cost_savings_usd: Number(Number(r.avg_cost_savings ?? 0).toFixed(2)),
        avg_latency_ms: Number(r.avg_latency ?? 0),
        shadow_divergences: Number(r.shadow_divergences ?? 0),
      };
    });
  }

  private async _queryCostSavings(
    db: Db,
    interval: string,
    window: string
  ): Promise<DelegationCostSavingsTrendPoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, timestamp) AT TIME ZONE 'UTC' AS bucket,
        COALESCE(SUM(cost_savings_usd::numeric), 0)  AS cost_savings_usd,
        COALESCE(SUM(cost_usd::numeric), 0)          AS total_cost_usd,
        COUNT(*)::int                                 AS total_delegations,
        COALESCE(AVG(cost_savings_usd::numeric), 0)  AS avg_savings_usd
      FROM delegation_events
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return ((rows.rows ?? rows) as Record<string, unknown>[]).map((r) => {
      const bucket = r.bucket;
      return {
        date: bucket instanceof Date ? bucket.toISOString().slice(0, 10) : String(bucket ?? ''),
        cost_savings_usd: Number(Number(r.cost_savings_usd ?? 0).toFixed(2)),
        total_cost_usd: Number(Number(r.total_cost_usd ?? 0).toFixed(2)),
        total_delegations: Number(r.total_delegations ?? 0),
        avg_savings_usd: Number(Number(r.avg_savings_usd ?? 0).toFixed(2)),
      };
    });
  }

  private async _queryQualityGates(
    db: Db,
    interval: string,
    window: string
  ): Promise<DelegationQualityGatePoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, timestamp) AT TIME ZONE 'UTC' AS bucket,
        COUNT(*)::int                                                         AS total_checked,
        COUNT(*) FILTER (WHERE quality_gate_passed = true)::int              AS passed,
        COUNT(*) FILTER (WHERE quality_gate_passed = false)::int             AS failed
      FROM delegation_events
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return ((rows.rows ?? rows) as Record<string, unknown>[]).map((r) => {
      const bucket = r.bucket;
      const totalChecked = Number(r.total_checked ?? 0);
      const passed = Number(r.passed ?? 0);
      return {
        date: bucket instanceof Date ? bucket.toISOString().slice(0, 10) : String(bucket ?? ''),
        pass_rate: totalChecked > 0 ? Math.round((passed / totalChecked) * 10000) / 10000 : 0,
        total_checked: totalChecked,
        passed,
        failed: Number(r.failed ?? 0),
      };
    });
  }

  private async _queryShadowDivergence(
    db: Db,
    interval: string
  ): Promise<DelegationShadowDivergence[]> {
    const rows = await db.execute(sql`
      SELECT
        MAX(timestamp)::text                                      AS occurred_at,
        primary_agent,
        shadow_agent,
        task_type,
        COUNT(*)::int                                             AS count,
        COALESCE(AVG(divergence_score::numeric), 0)              AS avg_divergence_score,
        COALESCE(AVG(primary_latency_ms), 0)::int                AS avg_primary_latency_ms,
        COALESCE(AVG(shadow_latency_ms), 0)::int                 AS avg_shadow_latency_ms
      FROM delegation_shadow_comparisons
      WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        AND divergence_detected = true
      GROUP BY primary_agent, shadow_agent, task_type
      ORDER BY count DESC
      LIMIT 100
    `);

    return ((rows.rows ?? rows) as Record<string, unknown>[]).map((r) => ({
      occurred_at: String(r.occurred_at ?? ''),
      primary_agent: String(r.primary_agent ?? ''),
      shadow_agent: String(r.shadow_agent ?? ''),
      task_type: String(r.task_type ?? ''),
      count: Number(r.count ?? 0),
      avg_divergence_score: Number(Number(r.avg_divergence_score ?? 0).toFixed(4)),
      avg_primary_latency_ms: Number(r.avg_primary_latency_ms ?? 0),
      avg_shadow_latency_ms: Number(r.avg_shadow_latency_ms ?? 0),
    }));
  }

  private async _queryTrend(
    db: Db,
    interval: string,
    window: string
  ): Promise<DelegationTrendPoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    // Join delegation_events and shadow comparisons per bucket
    const rows = await db.execute(sql`
      WITH buckets AS (
        SELECT
          DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, timestamp) AT TIME ZONE 'UTC' AS bucket,
          COUNT(*)::int AS total_delegations,
          ROUND(AVG(CASE WHEN quality_gate_passed THEN 1.0 ELSE 0.0 END)::numeric, 4) AS qg_pass_rate,
          COALESCE(SUM(cost_savings_usd::numeric), 0) AS cost_savings_usd
        FROM delegation_events
        WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        GROUP BY bucket
      ),
      shadow_buckets AS (
        SELECT
          DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, timestamp) AT TIME ZONE 'UTC' AS bucket,
          COUNT(*)::int AS total_shadow,
          COUNT(*) FILTER (WHERE divergence_detected = true)::int AS diverged
        FROM delegation_shadow_comparisons
        WHERE timestamp >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        GROUP BY bucket
      )
      SELECT
        b.bucket,
        b.qg_pass_rate,
        CASE WHEN COALESCE(sb.total_shadow, 0) > 0
          THEN ROUND((sb.diverged::numeric / sb.total_shadow), 4)
          ELSE 0
        END AS shadow_divergence_rate,
        b.cost_savings_usd,
        b.total_delegations
      FROM buckets b
      LEFT JOIN shadow_buckets sb ON b.bucket = sb.bucket
      ORDER BY b.bucket ASC
    `);

    return ((rows.rows ?? rows) as Record<string, unknown>[]).map((r) => {
      const bucket = r.bucket;
      return {
        date: bucket instanceof Date ? bucket.toISOString().slice(0, 10) : String(bucket ?? ''),
        quality_gate_pass_rate: Number(r.qg_pass_rate ?? 0),
        shadow_divergence_rate: Number(r.shadow_divergence_rate ?? 0),
        cost_savings_usd: Number(Number(r.cost_savings_usd ?? 0).toFixed(2)),
        total_delegations: Number(r.total_delegations ?? 0),
      };
    });
  }
}
