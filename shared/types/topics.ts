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
} as const;

export type TopicSymbol = (typeof TOPICS)[keyof typeof TOPICS];
