// eslint-rules/no-untyped-empty-state.cjs
//
// OMN-13131 (W6, G-I): cross-renderer no-projection enforcement gate.
//
// GENERALIZES `no-projection-fallback` (which was React/useProjectionQuery-keyed,
// i.e. chart/React-only) into a CROSS-RENDERER gate. Every renderer surface — of
// ANY platform (chart, table, plain non-React TS, future native/voice renderers)
// — that reports an empty/blocked state must use a TYPED reason VALUE from the
// canonical `EnumEmptyStateReason` vocabulary, never an invented synonym and
// never a blank. This makes "no blind/blank render" a mechanical gate, not a
// convention.
//
// §0b.5 — KEY ON THE VALUES, NOT THE SYMBOL NAME.
//   The hand-authored chart type in shared/types/chart-config.ts is named
//   `EmptyStateReason`; the generated mirror in
//   src/shared/types/generated/onex-models.ts is `EnumEmptyStateReason`. Both
//   carry the SAME four values. This rule keys on the four VALUES below so it is
//   agnostic to which symbol a given renderer imports (or whether it imports one
//   at all). A renderer that writes a raw reason string still gets gated.
//
// WHAT IT FLAGS:
//   A string-literal value assigned to an empty-state-reason property
//   (`reason`, `emptyStateReason`, `empty_state_reason`, `emptyReason`) whose
//   value is NOT one of the four canonical values. Catches a renderer inventing
//   its own reason ('error', 'not-found', 'blank', 'empty', ...) instead of the
//   typed vocabulary.
//
// WHAT IT DOES NOT FLAG:
//   - The four canonical values themselves.
//   - String literals on unrelated properties (title/label/name/...).
//   - Non-literal values (computed reasons, identifiers, member expressions) —
//     those are type-checked by the TS `EmptyStateReason` union at the boundary;
//     this lint covers the inline-literal escape hatch the type system can't see
//     when the property is loosely typed (`string`).
//   - Test/spec/story/fixture files.
//
// There is intentionally NO inline-disable escape hatch: adding a new reason is
// a platform-vocabulary change that must edit the canonical enum (and this
// VALUES list in lockstep), not a per-call-site suppression.

'use strict';

const ALLOWED_FILE = /\.(test|spec|stories)\.[cm]?[tj]sx?$/;

// The canonical EnumEmptyStateReason VALUES (byte-match core + generated mirror).
// Keyed on values, NOT the symbol name (§0b.5).
const CANONICAL_REASON_VALUES = new Set([
  'no-data',
  'missing-field',
  'upstream-blocked',
  'schema-invalid',
]);

// Property keys (any casing convention a renderer might use) that hold an
// empty-state reason. Cross-renderer: not tied to React props or chart configs.
const REASON_PROPERTY_KEYS = new Set([
  'reason',
  'emptyStateReason',
  'empty_state_reason',
  'emptyReason',
]);

function propertyKeyName(node) {
  // node is a Property (object literal member).
  if (node.computed) return null;
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
    return node.key.value;
  }
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cross-renderer gate: an empty-state reason literal must be one of the ' +
        'canonical EnumEmptyStateReason VALUES (no-data | missing-field | ' +
        'upstream-blocked | schema-invalid). Keyed on values, not the symbol ' +
        'name, so it applies to chart, table, and non-React renderers alike.',
    },
    messages: {
      untypedEmptyState:
        'Untyped empty-state reason "{{value}}". Use a canonical ' +
        'EnumEmptyStateReason VALUE (no-data | missing-field | upstream-blocked ' +
        '| schema-invalid). Inventing a reason synonym defeats the cross-renderer ' +
        'typed empty-state gate (OMN-13131, G-I). Add new reasons to the ' +
        'canonical enum, not at the call site.',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename();
    if (ALLOWED_FILE.test(filename)) return {};

    function checkReasonValue(valueNode, reportNode) {
      if (
        valueNode &&
        valueNode.type === 'Literal' &&
        typeof valueNode.value === 'string' &&
        !CANONICAL_REASON_VALUES.has(valueNode.value)
      ) {
        context.report({
          node: reportNode,
          messageId: 'untypedEmptyState',
          data: { value: valueNode.value },
        });
      }
    }

    return {
      // `{ reason: 'error' }`, `{ emptyStateReason: 'not-found' }`, etc.
      Property(node) {
        const key = propertyKeyName(node);
        if (key === null || !REASON_PROPERTY_KEYS.has(key)) return;
        checkReasonValue(node.value, node.value);
      },
    };
  },
};
