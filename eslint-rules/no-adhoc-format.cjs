// eslint-rules/no-adhoc-format.cjs
//
// OMN-23330 AC20: number and date formatting calls (toFixed, toLocaleString, toLocaleDateString, toLocaleTimeString)
// live only in src/lib/format, the one module that formats money, counts, percentages, dates and durations (AC19), so
// a figure reads the same wherever it is drawn. Elsewhere, import the formatter from '@/lib/format'.
// Tests and stories are exempt: they may build an expected string the way a reader would.

'use strict';

const METHODS = new Set(['toFixed', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const ALLOWED_FILE = /(^|[\\/])src[\\/]lib[\\/]format[\\/]|\.(test|spec|stories)\.[cm]?[tj]sx?$|[\\/]__tests__[\\/]/;

function methodName(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') return member.property.value;
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Format numbers and dates through @/lib/format (OMN-23330 AC20).' },
    schema: [],
    messages: {
      adhoc: '{{method}}() outside src/lib/format: use the formatter from @/lib/format (OMN-23330 AC20).',
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
