// eslint-rules/index.cjs
'use strict';

// OMN-23330 AC20: number and date formatting calls (toFixed, toLocaleString, toLocaleDateString, toLocaleTimeString)
// live only in src/theme/format, the one module that formats money, counts, percentages, dates and durations (AC19).
// Defined here rather than in its own file: the canonical-file-shape ratchet (OMN-21332) admits no new rule file.
// Tests and stories are exempt: they may build an expected string the way a reader would.
const METHODS = new Set(['toFixed', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const ALLOWED_FILE = /(^|[\\/])src[\\/]theme[\\/]format[\\/]|\.(test|spec|stories)\.[cm]?[tj]sx?$|[\\/]__tests__[\\/]/;

function methodName(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') return member.property.value;
  return null;
}
const noAdhocFormat = {
  meta: {
    type: 'problem',
    docs: { description: 'Format numbers and dates through @/theme/format (OMN-23330 AC20).' },
    schema: [],
    messages: {
      adhoc: '{{method}}() outside src/theme/format: use the formatter from @/theme/format (OMN-23330 AC20).',
    },
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    // AC20 covers the client source, src/; server/, shared/ and the build config format for their own consumers.
    if (!/(^|[\\/])src[\\/]/.test(file) || ALLOWED_FILE.test(file)) return {};
    return {
      CallExpression(node) {
        const callee = node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
        const method = methodName(callee);
        if (method && METHODS.has(method)) context.report({ node, messageId: 'adhoc', data: { method } });
      },
    };
  },
};

module.exports = {
  rules: {
    'no-typography-inline': require('./no-typography-inline.cjs'),
    'no-cast-on-parsed-json': require('./no-cast-on-parsed-json.cjs'),
    'no-projection-fallback': require('./no-projection-fallback.cjs'),
    'no-env-fallback': require('./no-env-fallback.cjs'),
    'no-projection-websocket': require('./no-projection-websocket.cjs'),
    'no-untyped-empty-state': require('./no-untyped-empty-state.cjs'),
    'no-non-authoritative-read-source': require('./no-non-authoritative-read-source.cjs'),
    'no-fetch-header-overwrite': require('./no-fetch-header-overwrite.cjs'),
    'no-adhoc-format': noAdhocFormat,
  },
};
