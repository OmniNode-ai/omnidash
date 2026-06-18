// OMN-13131 (W6): the canonical, renderer-agnostic empty-state reason vocabulary.
//
// The four reason VALUES are the platform contract — they byte-match the Python
// `EnumEmptyStateReason` (omnibase_core enums/enum_empty_state_reason.py) and its
// generated TS mirror (`src/shared/types/generated/onex-models.ts`:
// `EnumEmptyStateReason`). The hand-authored chart type in `chart-config.ts` is
// named `EmptyStateReason`; the generated mirror name is `EnumEmptyStateReason`.
// Both are the SAME four values. Per plan §0b.5, every cross-renderer surface
// (and the cross-renderer ESLint gate) keys on the VALUES, never the symbol name.
//
// This module is the single runtime source of those values so a renderer of any
// platform (web/chart/non-React) emits a typed reason rather than a blind blank.

import type { EnumEmptyStateReason } from '../../src/shared/types/generated/onex-models';

/**
 * Renderer-agnostic empty-state reason. Re-export of the generated mirror's
 * `EnumEmptyStateReason` so every renderer imports the one canonical type
 * (the chart-local `EmptyStateReason` alias in `chart-config.ts` is structurally
 * identical — same four values).
 */
export type EmptyStateReason = EnumEmptyStateReason;

/**
 * The four canonical reason values as a runtime frozen tuple. Cross-renderer
 * surfaces and the `no-untyped-empty-state` ESLint gate key on these VALUES.
 * Order is the platform-declared order (no-data → missing-field →
 * upstream-blocked → schema-invalid).
 */
export const EMPTY_STATE_REASONS = [
  'no-data',
  'missing-field',
  'upstream-blocked',
  'schema-invalid',
] as const satisfies readonly EmptyStateReason[];

/** Named accessors so callers reference a symbol, not a bare string literal. */
export const EmptyStateReasonValue = {
  NO_DATA: 'no-data',
  MISSING_FIELD: 'missing-field',
  UPSTREAM_BLOCKED: 'upstream-blocked',
  SCHEMA_INVALID: 'schema-invalid',
} as const satisfies Record<string, EmptyStateReason>;

/** Operator-facing default diagnostic per reason. Distinct per value — never collapsed. */
export const EMPTY_STATE_REASON_MESSAGES: Record<EmptyStateReason, string> = {
  'no-data': 'No records have been emitted for this projection yet.',
  'missing-field': 'Expected fields are absent from the projection rows.',
  'upstream-blocked':
    'Upstream pipeline is blocked — the renderer capability is stale, absent, or unsupported.',
  'schema-invalid': 'Projection rows do not match the declared schema.',
};

/** Runtime type guard so untyped inputs cannot leak past the boundary. */
export function isEmptyStateReason(value: unknown): value is EmptyStateReason {
  return (
    typeof value === 'string' &&
    (EMPTY_STATE_REASONS as readonly string[]).includes(value)
  );
}
