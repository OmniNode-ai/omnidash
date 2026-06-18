// OMN-13131 (W6, W7 consumption): UI action affordances are DERIVED from the
// canonical core `ModelActionGatePolicy` (confidence_threshold,
// requires_user_confirmation, risk_level, reversible, commit_level) — never from
// a TS-side default or convention. This test pins the derivation to the core
// field semantics documented on the model.

import { describe, it, expect } from 'vitest';
import { deriveActionAffordances } from './action-gate-affordances';
import type { ModelActionGatePolicy } from '@/shared/types/generated/onex-models';

function policy(overrides: Partial<ModelActionGatePolicy> = {}): ModelActionGatePolicy {
  return {
    confidence_threshold: 0.7,
    requires_user_confirmation: false,
    risk_level: 'low',
    reversible: true,
    commit_level: 'reversible',
    ...overrides,
  };
}

describe('deriveActionAffordances — W7 gate-policy consumption', () => {
  it('null policy → no policy-driven gating (enabled, no confirmation, no evidence)', () => {
    const a = deriveActionAffordances(null);
    expect(a.requiresConfirmation).toBe(false);
    expect(a.disabled).toBe(false);
    expect(a.requiresEvidence).toBe(false);
  });

  it('requires_user_confirmation drives confirmation affordance directly from the field', () => {
    expect(deriveActionAffordances(policy({ requires_user_confirmation: true })).requiresConfirmation).toBe(true);
    expect(deriveActionAffordances(policy({ requires_user_confirmation: false })).requiresConfirmation).toBe(false);
  });

  it('irreversible commit_level forces confirmation even when the field is false (escalation)', () => {
    const a = deriveActionAffordances(
      policy({ requires_user_confirmation: false, reversible: false, commit_level: 'irreversible' }),
    );
    expect(a.requiresConfirmation).toBe(true);
  });

  it('surfaces risk_level verbatim from the core field', () => {
    expect(deriveActionAffordances(policy({ risk_level: 'critical' })).riskLevel).toBe('critical');
    expect(deriveActionAffordances(policy({ risk_level: 'medium' })).riskLevel).toBe('medium');
  });

  it('reversible=false marks the action irreversible and exposes the commit level', () => {
    const a = deriveActionAffordances(policy({ reversible: false, commit_level: 'irreversible' }));
    expect(a.reversible).toBe(false);
    expect(a.commitLevel).toBe('irreversible');
  });

  it('high/critical risk requires evidence before commit', () => {
    expect(deriveActionAffordances(policy({ risk_level: 'high' })).requiresEvidence).toBe(true);
    expect(deriveActionAffordances(policy({ risk_level: 'critical' })).requiresEvidence).toBe(true);
    expect(deriveActionAffordances(policy({ risk_level: 'low' })).requiresEvidence).toBe(false);
  });

  it('confidence below threshold disables the action with a typed, declared reason', () => {
    const a = deriveActionAffordances(policy({ confidence_threshold: 0.9 }), { upstreamConfidence: 0.5 });
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toBeTruthy();
    // Confidence is below the policy threshold — confirmation is escalated too.
    expect(a.requiresConfirmation).toBe(true);
  });

  it('confidence at/above threshold leaves the action enabled', () => {
    const a = deriveActionAffordances(policy({ confidence_threshold: 0.7 }), { upstreamConfidence: 0.8 });
    expect(a.disabled).toBe(false);
  });

  it('threshold known but upstream confidence unknown → not disabled (no fabricated confidence)', () => {
    const a = deriveActionAffordances(policy({ confidence_threshold: 0.9 }));
    expect(a.disabled).toBe(false);
  });
});
