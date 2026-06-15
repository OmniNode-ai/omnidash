/**
 * OMN-12955 — pure aggregation for the /experiments context-ROI closure loop.
 *
 * Transforms the per-(run × task × arm × trial) rows from the live
 * `onex.snapshot.projection.context.experiment-scores.v1` projection
 * (context_roi_scores, materialized by omnimarket node_projection_context_roi)
 * into the two derived shapes the ExperimentsPage hero + heatmap render:
 *   - {@link aggregateByArm}: per-arm first-pass / final-success rollup, with the
 *     'off' baseline arm sorted first and the rest by first-pass rate descending.
 *   - {@link buildSegmentModelMatrix}: a segment(arm) × model final-success matrix.
 *
 * These are pure functions (no React, no fetch) so the aggregation contract is
 * unit-tested directly. The page components own only rendering + empty states.
 */

import type { ContextExperimentScoreRow } from '@/services/event-dash-api';

export interface ArmAggregate {
  subset: string;
  trials: number;
  firstPass: number;
  finalSuccess: number;
  tokens: number;
}

/**
 * Roll the projection rows up per context-factor arm. The 'off' baseline arm is
 * always sorted first; remaining arms are ordered by first-pass rate descending
 * so the most-effective context pack surfaces at the top of the hero.
 */
export function aggregateByArm(rows: ContextExperimentScoreRow[]): ArmAggregate[] {
  const byArm = new Map<string, ArmAggregate>();
  for (const r of rows) {
    const agg = byArm.get(r.context_factor_subset) ?? {
      subset: r.context_factor_subset,
      trials: 0,
      firstPass: 0,
      finalSuccess: 0,
      tokens: 0,
    };
    agg.trials += 1;
    if (r.first_pass_success) agg.firstPass += 1;
    if (r.final_success) agg.finalSuccess += 1;
    agg.tokens += r.tokens_used;
    byArm.set(r.context_factor_subset, agg);
  }
  return Array.from(byArm.values()).sort((a, b) => {
    if (a.subset === 'off') return -1;
    if (b.subset === 'off') return 1;
    return b.firstPass / Math.max(1, b.trials) - a.firstPass / Math.max(1, a.trials);
  });
}

export interface SegmentModelMatrix {
  segments: string[];
  models: string[];
  /** Final-success pass rate (0–1) per `${segment}::${model}` cell, or null when no trials. */
  cell(segment: string, model: string): number | null;
}

/**
 * Build a segment(context_factor_subset) × model final-success matrix from the
 * projection rows. Segment and model axes preserve first-seen insertion order.
 */
export function buildSegmentModelMatrix(rows: ContextExperimentScoreRow[]): SegmentModelMatrix {
  const cellMap = new Map<string, { pass: number; total: number }>();
  const segments: string[] = [];
  const models: string[] = [];
  const seenSegments = new Set<string>();
  const seenModels = new Set<string>();
  for (const r of rows) {
    if (!seenSegments.has(r.context_factor_subset)) {
      seenSegments.add(r.context_factor_subset);
      segments.push(r.context_factor_subset);
    }
    if (!seenModels.has(r.model_id)) {
      seenModels.add(r.model_id);
      models.push(r.model_id);
    }
    const key = `${r.context_factor_subset}::${r.model_id}`;
    const c = cellMap.get(key) ?? { pass: 0, total: 0 };
    c.total += 1;
    if (r.final_success) c.pass += 1;
    cellMap.set(key, c);
  }
  return {
    segments,
    models,
    cell(segment: string, model: string): number | null {
      const c = cellMap.get(`${segment}::${model}`);
      return c && c.total > 0 ? c.pass / c.total : null;
    },
  };
}
