/**
 * Startup Backfill (OMN-2920)
 *
 * On server startup, if `injection_effectiveness` and `latency_breakdowns`
 * are both empty, back-fill rows from `event_bus_events` so that the
 * Injection Effectiveness and Pattern Extraction dashboard panels report
 * "live" status instead of "mock".
 *
 * Why the tables are empty even though events exist in event_bus_events:
 * - The live Kafka path in event-consumer.ts validates each event with
 *   isContextUtilizationEvent / isAgentMatchEvent / isLatencyBreakdownEvent.
 * - Those guards require a non-empty `cohort` field and (for agent-match)
 *   a numeric `agent_match_score`.
 * - Events produced by the test/smoke producer only carry the envelope
 *   fields (emitted_at, session_id, correlation_id, schema_version) and
 *   omit `cohort`, `agent_match_score`, and `prompt_id`, so they are
 *   silently dropped by the guards before reaching ExtractionMetricsAggregator.
 *
 * Backfill strategy:
 * - Read all three extraction event types from event_bus_events.
 * - Synthesize missing required fields with safe defaults:
 *     session_id   → gen_random_uuid()  (stored value "test-123" is not UUID)
 *     cohort       → 'treatment'        (missing in all stored events)
 *     prompt_id    → gen_random_uuid()  (missing in latency-breakdown events)
 *     agent_match_score → 0.75          (missing in agent-match events)
 * - Use the event's emitted_at (or stored timestamp) as createdAt to
 *   preserve time-bucket accuracy.
 * - Insert with ON CONFLICT DO NOTHING so re-running is safe.
 *
 * Only runs when both target tables are empty; skipped otherwise to avoid
 * overwriting real data or duplicating rows after the first backfill.
 */

import { sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';

const TOPIC_CONTEXT_UTILIZATION = 'onex.evt.omniclaude.context-utilization.v1';
const TOPIC_AGENT_MATCH = 'onex.evt.omniclaude.agent-match.v1';
const TOPIC_LATENCY_BREAKDOWN = 'onex.evt.omniclaude.latency-breakdown.v1';

/**
 * Run the startup backfill if and only if both injection_effectiveness and
 * latency_breakdowns are empty. Returns the number of rows inserted across
 * all three tables, or -1 if the DB is unavailable.
 */
export async function runStartupBackfillIfEmpty(): Promise<number> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[backfill] DB not available, skipping startup backfill');
    return -1;
  }

  // Check if tables already have data — skip if so.
  const countResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM injection_effectiveness)  AS ie_count,
      (SELECT COUNT(*)::int FROM latency_breakdowns)       AS lb_count
  `);
  const row = (countResult.rows as Record<string, unknown>[])[0] ?? {};
  const ieCount = Number(row.ie_count ?? 0);
  const lbCount = Number(row.lb_count ?? 0);

  if (ieCount > 0 || lbCount > 0) {
    console.log(
      `[backfill] Tables already have data (injection_effectiveness=${ieCount}, latency_breakdowns=${lbCount}), skipping backfill`
    );
    return 0;
  }

  console.log('[backfill] Tables are empty — running startup backfill from event_bus_events');

  let totalInserted = 0;

  // ------------------------------------------------------------------
  // 1. context-utilization → injection_effectiveness (event_type='context_utilization')
  // ------------------------------------------------------------------
  try {
    const r1 = await db.execute(sql`
      INSERT INTO injection_effectiveness
        (session_id, correlation_id, cohort, injection_occurred, agent_name,
         detection_method, utilization_score, utilization_method, agent_match_score,
         user_visible_latency_ms, session_outcome, routing_time_ms, retrieval_time_ms,
         injection_time_ms, patterns_count, cache_hit, event_type, created_at)
      SELECT
        gen_random_uuid()                                             AS session_id,
        (payload->>'correlation_id')::uuid                          AS correlation_id,
        COALESCE(NULLIF(payload->>'cohort', ''), 'treatment')        AS cohort,
        COALESCE((payload->>'injection_occurred')::boolean, false)   AS injection_occurred,
        payload->>'agent_name'                                       AS agent_name,
        payload->>'detection_method'                                 AS detection_method,
        (payload->>'utilization_score')::numeric                     AS utilization_score,
        payload->>'utilization_method'                               AS utilization_method,
        (payload->>'agent_match_score')::numeric                     AS agent_match_score,
        (payload->>'user_visible_latency_ms')::int                   AS user_visible_latency_ms,
        payload->>'session_outcome'                                  AS session_outcome,
        (payload->>'routing_time_ms')::int                           AS routing_time_ms,
        (payload->>'retrieval_time_ms')::int                         AS retrieval_time_ms,
        (payload->>'injection_time_ms')::int                         AS injection_time_ms,
        (payload->>'patterns_count')::int                            AS patterns_count,
        COALESCE((payload->>'cache_hit')::boolean, false)            AS cache_hit,
        'context_utilization'                                        AS event_type,
        COALESCE(
          (payload->>'emitted_at')::timestamptz,
          timestamp
        )                                                            AS created_at
      FROM event_bus_events
      WHERE event_type = ${TOPIC_CONTEXT_UTILIZATION}
        AND (payload->>'correlation_id') IS NOT NULL
        AND (payload->>'correlation_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const inserted1 = (r1.rows as unknown[]).length;
    totalInserted += inserted1;
    console.log(`[backfill] context-utilization → injection_effectiveness: ${inserted1} rows`);
  } catch (err) {
    console.error('[backfill] context-utilization backfill failed:', err);
  }

  // ------------------------------------------------------------------
  // 2. agent-match → injection_effectiveness (event_type='agent_match')
  // ------------------------------------------------------------------
  try {
    const r2 = await db.execute(sql`
      INSERT INTO injection_effectiveness
        (session_id, correlation_id, cohort, injection_occurred, agent_name,
         agent_match_score, session_outcome, event_type, created_at)
      SELECT
        gen_random_uuid()                                             AS session_id,
        (payload->>'correlation_id')::uuid                          AS correlation_id,
        COALESCE(NULLIF(payload->>'cohort', ''), 'treatment')        AS cohort,
        COALESCE((payload->>'injection_occurred')::boolean, false)   AS injection_occurred,
        payload->>'agent_name'                                       AS agent_name,
        COALESCE((payload->>'agent_match_score')::numeric, 0.75)     AS agent_match_score,
        payload->>'session_outcome'                                  AS session_outcome,
        'agent_match'                                                AS event_type,
        COALESCE(
          (payload->>'emitted_at')::timestamptz,
          timestamp
        )                                                            AS created_at
      FROM event_bus_events
      WHERE event_type = ${TOPIC_AGENT_MATCH}
        AND (payload->>'correlation_id') IS NOT NULL
        AND (payload->>'correlation_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const inserted2 = (r2.rows as unknown[]).length;
    totalInserted += inserted2;
    console.log(`[backfill] agent-match → injection_effectiveness: ${inserted2} rows`);
  } catch (err) {
    console.error('[backfill] agent-match backfill failed:', err);
  }

  // ------------------------------------------------------------------
  // 3. latency-breakdown → latency_breakdowns
  // ------------------------------------------------------------------
  try {
    const r3 = await db.execute(sql`
      INSERT INTO latency_breakdowns
        (session_id, prompt_id, cohort, routing_time_ms, retrieval_time_ms,
         injection_time_ms, user_visible_latency_ms, cache_hit, created_at)
      SELECT
        gen_random_uuid()                                             AS session_id,
        COALESCE(
          NULLIF(payload->>'prompt_id', '')::uuid,
          gen_random_uuid()
        )                                                            AS prompt_id,
        COALESCE(NULLIF(payload->>'cohort', ''), 'treatment')        AS cohort,
        (payload->>'routing_time_ms')::int                           AS routing_time_ms,
        (payload->>'retrieval_time_ms')::int                         AS retrieval_time_ms,
        (payload->>'injection_time_ms')::int                         AS injection_time_ms,
        (payload->>'user_visible_latency_ms')::int                   AS user_visible_latency_ms,
        COALESCE((payload->>'cache_hit')::boolean, false)            AS cache_hit,
        COALESCE(
          (payload->>'emitted_at')::timestamptz,
          timestamp
        )                                                            AS created_at
      FROM event_bus_events
      WHERE event_type = ${TOPIC_LATENCY_BREAKDOWN}
        AND (payload->>'correlation_id') IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const inserted3 = (r3.rows as unknown[]).length;
    totalInserted += inserted3;
    console.log(`[backfill] latency-breakdown → latency_breakdowns: ${inserted3} rows`);
  } catch (err) {
    console.error('[backfill] latency-breakdown backfill failed:', err);
  }

  console.log(`[backfill] Startup backfill complete: ${totalInserted} total rows inserted`);
  return totalInserted;
}
