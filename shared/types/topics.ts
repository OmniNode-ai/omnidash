/**
 * T16 / OMN-157: single source of truth for projection topic strings.
 *
 * Every widget that calls `useProjectionQuery({ topic: ... })` reads its
 * topic from this file rather than embedding a literal. This mirrors the
 * backend contract-first-topic-definition rule (see ~/.claude/CLAUDE.md
 * "Contract-first topic definitions") and means a topic rename in the
 * backend contract surfaces here as a TypeScript error in every consumer
 * rather than as a silent runtime miss.
 *
 * Naming convention: `onex.snapshot.projection.{producer}.{event}.v{N}`.
 * If you add a new topic, add a key here AND surface it in
 * `scripts/generate-registry.ts` so the manifest's `dataSources` field
 * can reference the symbol.
 */
export const TOPICS = {
  /** Cost trend / by-model widgets — LLM cost aggregates per bucket. */
  llmCost: 'onex.snapshot.projection.llm_cost.v1',
  /** Delegation metrics widget — pass rates, savings, by-task counts. */
  delegationSummary: 'onex.snapshot.projection.delegation.summary.v1',
  /** Routing decisions table — per-decision rows. */
  delegationDecisions: 'onex.snapshot.projection.delegation.decisions.v1',
  /** Baselines ROI card — token/time delta + recommendations. */
  baselinesRoi: 'onex.snapshot.projection.baselines.roi.v1',
  /** Quality score panel — pattern quality buckets. */
  baselinesQuality: 'onex.snapshot.projection.baselines.quality.v1',
  /** Readiness gate widget — overnight platform-health rollup. */
  overnightReadiness: 'onex.snapshot.projection.overnight.v1',
  /** Event stream widget — registration / event-bus tail. */
  registration: 'onex.snapshot.projection.registration.v1',
  /** Cost summary KPI tiles — aggregate spend rollup per period. */
  costSummary: 'onex.snapshot.projection.cost.summary.v1',
  /**
   * Token-usage trend widget — total tokens per bucket.
   * Upstream blocked: omnimarket emitter + omnibase_infra snapshot path missing.
   * `llm_cost_aggregates.total_tokens BIGINT` (migration 031 line 147) exists
   * but the aggregation/snapshot emitter path is not yet wired.
   */
  costTokenUsage: 'onex.snapshot.projection.cost.token_usage.v1',
  /**
   * Cost aggregated by repository. Topic registration leads consumer.
   *
   * Consumer: ships in OMN-10302 (T19 in epic OMN-10282 plan), which adds the
   * IBarChartAdapter manifest entry once OMN-10286 (T4, BarChart primitive)
   * lands. Sequenced this way because the manifest entry depends on the
   * primitive type, which depends on the chart-config schema (OMN-10284, merged).
   *
   * Upstream blocker: `repo_name` column is absent from `llm_cost_aggregates`
   * (omnibase_infra migration 031:142 has only generic `aggregation_key`).
   * Resolution: either new migration adding `repo_name` OR standardize on
   * `aggregation_key` encoding `repo:<name>`. Decision pending — tracked in
   * the OMN-10302 ticket body and the omnimarket emitter ticket (TBD).
   *
   * @see {@link https://linear.app/omninode/issue/OMN-10302}
   */
  costByRepo: 'onex.snapshot.projection.cost.by_repo.v1',
  /**
   * AB model cost comparison — per-model results from the ab-compare CLI.
   * Topic: onex.snapshot.projection.ab-compare.v1
   * Consumer: AbCompareWidget (OMN-10490).
   * Producer: ab-compare orchestrator in omnimarket.
   */
  abCompare: 'onex.snapshot.projection.ab-compare.v1',
  /** Intent classification widget — category distribution per session. */
  intentClassification: 'onex.snapshot.projection.intent-classification.v1',
  /** Live event stream widget — real-time system event feed. */
  liveEvents: 'onex.snapshot.projection.live-events.v1',
  /** Routing decision widget — model routing traces and rules. */
  routingDecision: 'onex.snapshot.projection.routing-decision.v1',
  /** Receipt gate widget — verification gate status per PR. */
  receiptGate: 'onex.snapshot.projection.receipt-gate.v1',
} as const;

export type TopicSymbol = (typeof TOPICS)[keyof typeof TOPICS];
