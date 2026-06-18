// OMN-13131 (W6, consuming W7): derive UI action affordances from the canonical
// core `ModelActionGatePolicy`.
//
// W7 (ADR D2) landed `ModelActionGatePolicy` as the canonical home for an
// action's risk/confidence policy. Per the model docstring, "renderers derive
// behavior from it rather than encoding risk semantics in frontend code." This
// module is that derivation: disabled-state, confirmation requirement, evidence
// requirement, and risk/commit affordances all come FROM the core fields
// (confidence_threshold, requires_user_confirmation, risk_level, reversible,
// commit_level) — never from a TS-side default or convention.
//
// Pure and deterministic (no I/O, no React). The `ModelActionGatePolicy` type is
// imported from the generated TS mirror so TS↔Python stays in sync.

import type {
  ModelActionGatePolicy,
  EnumRiskLevel,
  EnumCommitLevel,
} from '@/shared/types/generated/onex-models';

/** Optional live context the gate consults alongside the static policy. */
export interface ActionGateContext {
  /**
   * Upstream confidence (0.0-1.0) for THIS action's inputs, when known. Compared
   * against `confidence_threshold`. Absent means confidence is unknown — the gate
   * does NOT fabricate a value or disable on missing data.
   */
  upstreamConfidence?: number;
}

/** Typed UI affordances a renderer of any platform applies to an action. */
export interface ActionAffordances {
  /** Whether the action control is disabled (cannot be invoked). */
  disabled: boolean;
  /** Declared, operator-facing reason when `disabled` is true; null otherwise. */
  disabledReason: string | null;
  /** Whether explicit user confirmation is required before the command emits. */
  requiresConfirmation: boolean;
  /** Whether the action must carry evidence before it commits. */
  requiresEvidence: boolean;
  /** Typed user-facing risk (verbatim from the policy), or null when unpoliced. */
  riskLevel: EnumRiskLevel | null;
  /** Whether the committed effect can be undone (boolean fast-path). */
  reversible: boolean;
  /** Typed durability of the effect (read_only | reversible | irreversible). */
  commitLevel: EnumCommitLevel | null;
}

// Risk levels that require evidence before commit (high-consequence actions).
const EVIDENCE_REQUIRED_RISK: ReadonlySet<EnumRiskLevel> = new Set<EnumRiskLevel>([
  'high',
  'critical',
]);

/**
 * Derive UI affordances from the action's gate policy.
 *
 * - `requires_user_confirmation` drives confirmation directly.
 * - An `irreversible` `commit_level` (or `reversible === false`) escalates to
 *   forced confirmation regardless of the boolean field.
 * - `risk_level` is surfaced verbatim; `high`/`critical` require evidence.
 * - When `upstreamConfidence` is supplied AND below `confidence_threshold`, the
 *   action is disabled with a declared reason and confirmation is escalated.
 *   Missing confidence is treated as unknown — never fabricated, never disabled.
 *
 * A `null` policy means no policy-driven gating: the action is enabled with no
 * confirmation/evidence obligations beyond any separate approval gate.
 */
export function deriveActionAffordances(
  gatePolicy: ModelActionGatePolicy | null | undefined,
  context: ActionGateContext = {},
): ActionAffordances {
  if (gatePolicy === null || gatePolicy === undefined) {
    return {
      disabled: false,
      disabledReason: null,
      requiresConfirmation: false,
      requiresEvidence: false,
      riskLevel: null,
      reversible: true,
      commitLevel: null,
    };
  }

  const isIrreversible =
    gatePolicy.reversible === false || gatePolicy.commit_level === 'irreversible';

  const confidenceKnown = typeof context.upstreamConfidence === 'number';
  const belowThreshold =
    confidenceKnown && context.upstreamConfidence! < gatePolicy.confidence_threshold;

  const disabled = belowThreshold;
  const disabledReason = belowThreshold
    ? `Upstream confidence ${context.upstreamConfidence} is below the required ` +
      `threshold ${gatePolicy.confidence_threshold}.`
    : null;

  // Confirmation is required when the policy says so, OR escalated when the
  // effect is irreversible, OR escalated when confidence is below threshold.
  const requiresConfirmation =
    gatePolicy.requires_user_confirmation || isIrreversible || belowThreshold;

  return {
    disabled,
    disabledReason,
    requiresConfirmation,
    requiresEvidence: EVIDENCE_REQUIRED_RISK.has(gatePolicy.risk_level),
    riskLevel: gatePolicy.risk_level,
    reversible: gatePolicy.reversible,
    commitLevel: gatePolicy.commit_level,
  };
}
