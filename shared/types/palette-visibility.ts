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
  'delegation-savings': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.savings.v1=200/1r' },
  'delegation-cost-comparison': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.savings.v1=200/1r' },
  'delegation-model-routing': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.model-routing.v1=200/1r' },
  'delegation-quality-gate': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.quality-gate.v1=200/1r' },
  'delegation-token-usage': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.token-usage.v1=200/1r' },
  'delegation-control-plane': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'delegation.{summary,decisions,savings,model-routing,quality-gate,token-usage}=200; decisions=36r' },
  'control-plane': { paletteVisibility: 'visible', authorityLabel: 'projection-backed', probe: 'node-generation-completed.v1=200/134r' },

  // --- VISIBLE / degraded (200 empty on the single backend — truthful empty state) ---
  'evidence-pipeline-flow': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'evidence_pipeline.{stages,correlations,readiness,live_events}=200/0r' },
  // Context experiment widget: the 100-run experiment data lives in
  // generation_events (200/134r) but the snapshot projection
  // context.experiment-scores.v1 is not yet exposed (404). Kept visible per the
  // close-the-loop plan keep-set, labeled degraded; renders its empty/degraded
  // state (no synthetic rows) until OMN-12082 exposes the projection.
  'context-effectiveness-heatmap': { paletteVisibility: 'visible', authorityLabel: 'degraded', probe: 'context.experiment-scores.v1=404 (kept per keep-set; degraded)' },

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
  'live-event-stream': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'live-events.v1=404' },
  'routing-decision': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'routing-decision.v1=404' },
  'receipt-gate': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'receipt-gate.v1=404' },
  'cost-savings-overview': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'cost.savings-overview.v1=404' },
  'delegation-model-output': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'delegation.inference-response-text.v1=404' },
  'mcp-tools': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'mcp-tools.v1=404' },
  'trace-explorer': { paletteVisibility: 'hidden', authorityLabel: 'hidden', probe: 'traces.v1=404' },
};
