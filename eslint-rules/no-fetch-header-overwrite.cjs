// eslint-rules/no-fetch-header-overwrite.cjs
//
// OMN-14764 (F-19-D): flag a fetch() RequestInit that spreads caller options
// AND then sets a fresh `headers` object literal that does NOT re-spread the
// caller's headers — silently DROPPING any caller-supplied headers.
//
// This is the exact "HeadersInit preservation" review-class defect CodeRabbit
// caught late on omnidash#258: local proof passes (the request still has SOME
// headers), but authorization / content-negotiation headers the caller passed
// via the spread are thrown away.
//
// Patterns CAUGHT:
//   fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
//                ^^^^^^^          drops init.headers
//
// Patterns NOT caught (v1 scope / intentionally OK):
//   fetch(url, { method: 'POST', headers: { 'Content-Type': 'x' } })
//       - no spread of options, so there are no caller headers to drop.
//   fetch(url, { ...init, headers: { ...init.headers, 'Content-Type': 'x' } })
//       - the headers literal re-spreads, so caller headers survive (merge).
//   fetch(url, { ...init, headers: buildHeaders(init) })
//       - headers value is not an object literal; we can't prove a drop, so
//         we do not report (conservative, low false-positive).
//   fetch(url, { ...init })                          (no fresh headers)
//   fetch(url)                                        (no RequestInit)
//
// To suppress a specific line (rare — an intentional header replacement):
//   // eslint-disable-next-line local/no-fetch-header-overwrite -- reason

'use strict';

function isSpread(node) {
  return node && node.type === 'SpreadElement';
}

/** The RequestInit object literal spreads at least one value (`...x`). */
function hasSpread(objectExpression) {
  return objectExpression.properties.some(isSpread);
}

/** Find a non-computed `headers:` property whose value is an object literal. */
function findHeadersObjectLiteralProp(objectExpression) {
  return objectExpression.properties.find(
    (p) =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === 'headers') ||
        (p.key.type === 'Literal' && p.key.value === 'headers')) &&
      p.value &&
      p.value.type === 'ObjectExpression',
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a fetch() RequestInit that spreads caller options and then ' +
        'overwrites headers with a fresh object literal, dropping caller headers.',
    },
    messages: {
      headerOverwrite:
        'This fetch() spreads request options but replaces `headers` with a fresh ' +
        'object literal, DROPPING any caller-supplied headers (e.g. Authorization). ' +
        'Merge them instead by re-spreading the incoming headers first (F-19-D).',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        // Match `fetch(...)` (global) and `window.fetch(...)`.
        const callee = node.callee;
        const isFetch =
          (callee.type === 'Identifier' && callee.name === 'fetch') ||
          (callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'fetch');
        if (!isFetch) return;

        const init = node.arguments[1];
        if (!init || init.type !== 'ObjectExpression') return;

        // Only a concern when caller options are spread in — otherwise there
        // are no inherited headers that a fresh literal could drop.
        if (!hasSpread(init)) return;

        const headersProp = findHeadersObjectLiteralProp(init);
        if (!headersProp) return;

        // If the headers literal itself re-spreads (merges) caller headers,
        // nothing is dropped — that is the correct pattern.
        if (hasSpread(headersProp.value)) return;

        context.report({ node: headersProp, messageId: 'headerOverwrite' });
      },
    };
  },
};
