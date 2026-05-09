// eslint-rules/no-env-fallback.cjs
//
// OMN-10739: flags silent string fallback defaults on import.meta.env.VITE_*
// reads. Only string literals (and template literals) are flagged — named
// constants like `?? NO_AUTH_SENTINEL` are explicit and not caught.
//
// Patterns caught:
//   import.meta.env.VITE_FOO ?? 'some-default'
//   import.meta.env.VITE_FOO || 'some-default'
//   import.meta.env.VITE_FOO ?? `template-literal`
//
// Patterns NOT caught (intentional):
//   import.meta.env.VITE_FOO ?? NO_AUTH_SENTINEL   (named constant — explicit)
//   import.meta.env.VITE_FOO ?? null               (honest null-coercion)
//   import.meta.env.VITE_FOO ?? undefined           (honest null-coercion)
//   import.meta.env.DEV ?? ...                      (Vite built-in — always defined)
//
// Callers should fail fast instead of silently defaulting:
//   const url = import.meta.env.VITE_FOO;
//   if (!url) throw new Error('VITE_FOO is required — see .env.example');
//
// To suppress a specific line, use standard ESLint disable directive:
//   // eslint-disable-next-line local/no-env-fallback -- reason

'use strict';

const ALLOWED_FILE = /\.(test|spec|stories)\.[cm]?[tj]sx?$/;

// Vite always defines these; they never need a fallback.
const VITE_BUILTINS = new Set(['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR']);

function isViteEnvRead(node) {
  // import.meta.env.VITE_FOO
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'MemberExpression' &&
    !node.object.computed &&
    node.object.object.type === 'MetaProperty' &&
    node.object.object.meta.name === 'import' &&
    node.object.object.property.name === 'meta' &&
    node.object.property.type === 'Identifier' &&
    node.object.property.name === 'env' &&
    node.property.type === 'Identifier'
  );
}

function isViteBuiltin(node) {
  return isViteEnvRead(node) && VITE_BUILTINS.has(node.property.name);
}

function isStringLiteral(node) {
  return (
    (node.type === 'Literal' && typeof node.value === 'string') ||
    node.type === 'TemplateLiteral'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow silent string fallback defaults on import.meta.env reads. ' +
        'Fail fast with a thrown Error instead.',
    },
    messages: {
      envFallback:
        'Silent string fallback on import.meta.env.{{name}} masks misconfigured environments. ' +
        'Read the var, check for undefined, and throw an Error if it is missing. ' +
        'Use a named constant if the fallback is intentional.',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename();
    if (ALLOWED_FILE.test(filename)) return {};

    return {
      LogicalExpression(node) {
        if (node.operator !== '??' && node.operator !== '||') return;
        const left = node.left;
        if (!isViteEnvRead(left)) return;
        if (isViteBuiltin(left)) return;
        // Only flag when the right-hand side is a string literal.
        // Named constants (?? SENTINEL) are explicit and permitted.
        if (!isStringLiteral(node.right)) return;
        context.report({
          node,
          messageId: 'envFallback',
          data: { name: left.property.name },
        });
      },
    };
  },
};
