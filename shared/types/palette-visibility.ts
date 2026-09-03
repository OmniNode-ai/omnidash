/**
 * OMN-12833 (A2.5) — Dashboard one-backend palette classification.
 *
 * Single source of truth for which registry components are visible in the widget
 * palette and what authority label they carry. Every classification here is
 * derived from a LIVE probe of the ONE standard projection backend
 * (the stability-test Postgres-backed projection API), NOT from committed
 * fixtures, the `:8765` SEA server, the `:3010` proxy, or any bespoke SQL/REST
 * route. See `docs/evidence/dashboard-one-backend-20260608/` for the probe log.
 *
 * Backend probed: the stability-test projection API (configured via
 *   VITE_PROJECTION_API_URL; see docs/evidence/dashboard-one-backend-20260608/).
 * Probe date: 2026-06-08
 *
 * Classification rule:
 *   - any topic returns HTTP 200 with row_count > 0  -> visible / projection-backed
 *   - all topics HTTP 200 but row_count == 0          -> visible / degraded (truthful empty state)
 *   - any topic HTTP 503 (table missing)              -> hidden  / hidden
 *   - all topics HTTP 404 (no producer / no expose)   -> hidden  / hidden
 *
 * Components classified `hidden` are removed from the palette so the demo never
 * exposes a widget that cannot be backed by the single authoritative backend.
 * The keep-set (delegation chain, delegation control plane incl. SEA artifact
 * panel, and the context experiment widget) stays visible with an honest label.
 */
import type {
  ComponentAuthorityLabel,
  ComponentPaletteVisibility,
} from './component-manifest.js';

export interface PaletteClassification {
  paletteVisibility: ComponentPaletteVisibility;
  authorityLabel: ComponentAuthorityLabel;
  /** Probe evidence: HTTP status(es) observed against the single backend. */
  probe: string;
}

/**
 * Component-name -> classification. Local MVP components must be listed here;
 * otherwise registry generation fails before a demo-visible widget can ship
 * without an explicit authority label.
 */
export const PALETTE_CLASSIFICATION: Record<string, PaletteClassification> = {
  // --- VISIBLE / projection-backed (200 with rows on the single backend) ---
  'delegation-metrics': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.summary.v1=200/1r' },
  'routing-decision-table': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.decisions.v1=200/36r' },
  'delegation-cost-comparison': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.savings.v1=200/1r' },
  'delegation-model-routing': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.model-routing.v1=200/1r' },
  'delegation-quality-gate': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.quality-gate.v1=200/1r' },
  'delegation-token-usage': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.token-usage.v1=200/1r' },
  'delegation-control-plane': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.{summary,decisions,savings,model-routing,quality-gate,token-usage}=200; decisions=36r' },
  'delegate-task': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'typed delegate-skill command; lifecycle truth rendered by live-events.v1' },
  'control-plane': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'typed node-generation command; lifecycle truth rendered by live-events.v1' },
  'live-event-stream': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'live-events.v1 contract exposure over authoritative live_events projection' },
  // Swarm Control Plane (OMN-12072 widget tree, wired OMN-15704): component shipped
  // in omnidash#125 but was never registered — dead code, not missing backend. Live
  // probe against the stability-test projection-api 2026-08-04 confirms real rows;
  // dev lane legitimately reads 0 (no swarm-dispatch traffic there), rendered honestly
  // via the widget's existing isEmpty path — not a degraded classification.
  'swarm-control-plane': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'swarm.runs.v1=200/18r (stability-test, 2026-08-04)' },

  // --- VISIBLE / degraded (200 empty on the single backend — truthful empty state) ---
  'evidence-pipeline-flow': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'evidence_pipeline.{stages,correlations,readiness,live_events}=200/0r' },
  // Renderer Capabilities (OMN-13131 W6, G-H): live mount of the renderer-capability
  // gate. The W5 reducer projection
  // (onex.evt.omnimarket.renderer-capability-projection-snapshot.v1) is materialized
  // but absent/empty until a renderer thin-publishes a capability heartbeat; the gate
  // renders the typed upstream-blocked empty-state for the absent/degraded read, so the
  // honest classification is degraded (truthful typed empty state, not blank/blind).
  'renderer-capability-status': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'renderer-capability-projection-snapshot.v1=absent (typed upstream-blocked empty-state)' },
  // Context experiment widget: the 100-run experiment data lives in
  // generation_events (200/134r) but the snapshot projection
  // context.experiment-scores.v1 is not yet exposed (404). Kept visible per the
  // close-the-loop plan keep-set, labeled degraded; renders its empty/degraded
  // state (no synthetic rows) until OMN-12082 exposes the projection.
  'context-effectiveness-heatmap': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'context.experiment-scores.v1=404 (kept per keep-set; degraded)' },
  // Instruction Eval (OMN-12998): rendered as a dedicated PAGE (InstructionEvalPage),
  // not a palette widget — it has no MVP_COMPONENTS manifest, so the registry/chrome
  // authorityLabel path does not apply and this entry is the single source of truth
  // for its authority. OMN-12998 wired the panel to useProjectionQuery against
  // onex.snapshot.projection.omnimarket.instruction-eval-aggregate.v1 (the exact
  // projection_api.topic node_projection_instruction_eval exposes) and removed the
  // hardcoded fixture (instruction-eval.fixtures.ts was the stop-gap from OMN-12997).
  // Classified `degraded` (empty until the instruction-eval runner emits events to
  // node_projection_instruction_eval); once rows materialise the panel is projection-backed.
  'instruction-eval': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'onex.snapshot.projection.omnimarket.instruction-eval-aggregate.v1=empty (projection wired; no runner events yet — OMN-12998)' },
  // OMN-14896: replaces the retired delegation-savings widget. cost.summary.v1
  // is a direct passthrough of llm_cost_aggregates (node_projection_cost_summary,
  // OMN-12970/OMN-15376) and now resolves 200 on both dev and stability-test
  // (re-probed live 2026-08-04 — supersedes the stale 2026-06-08 503 recorded
  // below on the 'cost-summary'/'token-usage' entries, which this PR does not
  // touch). row_count=0 on both lanes: no aggregation pipeline has written a row
  // yet, so the widget renders its honest empty state until it does.
  'delegation-cost-breakdown': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'cost.summary.v1=200/0r dev+stability (2026-08-04)' },

  // --- HIDDEN / hidden (503 table missing on the single backend) ---
  'cost-summary': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'cost.summary.v1=503 (table llm_cost_aggregates missing)' },
  'token-usage': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'cost.token_usage.v1=503 (table llm_call_metrics missing)' },
  'projection-container': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'ab-compare.v1=503 (table llm_call_metrics missing)' },
  'ab-compare': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'ab-compare.v1=503 (table llm_call_metrics missing)' },

  // --- HIDDEN / hidden (200 with rows, but the projection row shape does not
  //     match the widget's required event-log shape — cannot be truthfully
  //     backed by the single backend today; renders a crash, so hidden) ---
  // event-stream binds registration.v1 (200/100r) but its StreamEvent shape
  // (event_type/source/correlation_id/timestamp) is NOT what registration.v1
  // serves (service_name/service_type/health_status/...). Feeding it the
  // mismatched shape throws in render, so it is hidden until a real event-log
  // projection backs it.
  'event-stream': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'registration.v1=200/100r BUT row shape != StreamEvent (event_type/source missing) -> render crash' },

  // --- HIDDEN / hidden (404 no producer / no projection_api expose) ---
  'cost-trend-panel': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'llm_cost.v1=404' },
  'cost-by-model': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'llm_cost.v1=404' },
  'cost-by-model-3d': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'llm_cost.v1=404' },
  'cost-by-repo': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'cost.by_repo.v1=404' },
  'baselines-roi-card': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'baselines.roi.v1=404' },
  'quality-score-panel': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'baselines.quality.v1=404' },
  'readiness-gate': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'overnight.v1=404' },
  'intent-distribution': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'intent-classification.v1=404' },
  'session-timeline': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'intent-classification.v1=404' },
  'routing-decision': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'routing-decision.v1=404' },
  'receipt-gate': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'receipt-gate.v1=404' },
  'cost-savings-overview': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'cost.savings-overview.v1=404' },
  'delegation-model-output': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'delegation.inference-response-text.v1=404' },
  'mcp-tools': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'mcp-tools.v1=404' },
  'trace-explorer': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'traces.v1=404' },
  // Skill-adoption (OMN-13832): the skill_executions table is populated on the
  // .201 stability bus (OMN-13830), but the snapshot projection
  // onex.snapshot.projection.skill-executions.v1 has not been verified exposed
  // via the single projection_api backend in this session (no live probe run).
  // Classified hidden until a probe confirms projection_api expose; the widget,
  // its data service, and tests are fully wired and flip to projection-backed
  // once the snapshot topic is verified.
  'skill-adoption': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'skill-executions.v1=expose-unverified (table populated per OMN-13830; not probed this session)' },
  // OMN-17197 / epic OMN-16776 Phase 1. Classified from a LIVE read of the
  // projection API through the exact route omnidash's bridge uses
  // (GET /projection/onex.snapshot.projection.consumer-flow.v1), not from a
  // fixture and not from the table underneath it: 2026-08-30T15:19:18Z returned
  // HTTP 200, row_count 500, data_freshness "fresh", latest_event_at equal to the
  // request second, carrying IDLE 494 / STALLED 4 / FLOWING 2 concurrently.
  // Visible + projection-backed by the classification rule at the top of this
  // file (200 with rows). The exposure is already bus_backed with its writer
  // deployed and producing, so nothing here flips a gate ahead of a writer.
  'consumer-flow': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'consumer-flow.v1=200/500r fresh (dev lane projection-api, 2026-08-30T15:19:18Z)' },
  // OMN-17775 / epic OMN-16776, group G3. Classified from a LIVE probe through
  // the exact route omnidash's bridge uses, run 2026-09-03T15:56:27Z against the
  // .201 dev-lane projection API:
  //   GET /projection/onex.snapshot.projection.session.replay.v1
  //   -> HTTP 503 {"status":"degraded","error":"not_yet_bus_backed",...}
  // The classification rule at the top of this file makes that hidden/hidden,
  // and it stays hidden here deliberately. This entry exists because the
  // OMN-17199 exposure-reader gate requires a DECLARED READER before OMN-17774
  // may flip the exposure to bus_backed -- and declaring the reader is not the
  // same claim as declaring the data present. Flipping this to
  // visible/projection-backed ahead of a 200-with-rows probe would be the same
  // error in the palette that flipping bus_backed ahead of its writer is on the
  // contract: a surface asserting data it has not observed. It flips under
  // OMN-17774's own rendered proof, with that probe quoted here, and not before.
  'session-replay': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'session.replay.v1=503 not_yet_bus_backed (dev lane projection-api, 2026-09-03T15:56:27Z)' },
};
