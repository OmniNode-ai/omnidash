// eslint-rules/no-cast-on-parsed-json.cjs
//
// Cluster B capstone (Brett review §3): every I/O boundary that crosses
// `unknown` JSON into the type system must validate first. The dominant
// shape of that violation looks like:
//
//   const data = JSON.parse(raw) as DashboardDefinition;
//   const data = (await res.json()) as DashboardDefinition;
//   const data = JSON.parse(raw) as unknown as DashboardDefinition;
//
// All three are banned by this rule. The fix is always the same:
// convert to a typed value via a validator (e.g. parseDashboardDefinition,
// or a Zod parse). The validator either returns a typed result or
// reports an error; either way the cast is replaced by a function call
// whose runtime checks match its compile-time claim.
//
// Allowed:
//   - Casts to `unknown` (e.g. `JSON.parse(raw) as unknown`) — those
//     are the safe halfway step before validation, and explicitly
//     surface the boundary as untyped.
//   - JSON.parse / .json() in test files (.test.ts/.test.tsx) and
//     storybook fixtures — fixture-shaping doesn't cross the runtime
//     boundary the way production code does.
//   - The data-source layer (src/data-source/) which is the documented
//     carve-out for raw HTTP/file access.

const ALLOWED_FILE = /\.(test|stories)\.[cm]?[tj]sx?$/;
const ALLOWED_DIR = /(src\/data-source\/|src\/storybook\/fixtures\/|shared\/types\/dashboard\.ts)/;

function isJsonParseCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'JSON' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'parse'
  );
}

function isDotJsonAwait(node) {
  // `(await res.json())` — the JSON return type from fetch().
  // We match against the raw .json() call too (sync await stripped).
  let inner = node;
  if (inner.type === 'AwaitExpression') inner = inner.argument;
  return (
    inner &&
    inner.type === 'CallExpression' &&
    inner.callee.type === 'MemberExpression' &&
    !inner.callee.computed &&
    inner.callee.property.type === 'Identifier' &&
    inner.callee.property.name === 'json' &&
    inner.arguments.length === 0
  );
}

function isUnknownTypeAnnotation(typeAnnotation) {
  if (!typeAnnotation) return false;
  return typeAnnotation.type === 'TSUnknownKeyword';
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `as` casts directly on JSON.parse(...) or response.json() — validate the unknown shape first.',
    },
    messages: {
      banned:
        'Cast on parsed JSON crosses the I/O boundary without validation. Use a validator (e.g. parseDashboardDefinition) and let it produce the typed value. Casting to `unknown` first and then validating is allowed; casting directly to a domain type is not.',
    },
    schema: [],
  },
  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename();
    if (ALLOWED_FILE.test(filename)) return {};
    if (ALLOWED_DIR.test(filename)) return {};

    function checkCast(node) {
      // node.expression is what's being cast; node.typeAnnotation is the cast target.
      const expr = node.expression;
      if (!expr) return;
      const isParse = isJsonParseCall(expr) || isDotJsonAwait(expr);
      if (!isParse) return;
      // Allow `as unknown` — that's the documented safe halfway step.
      if (isUnknownTypeAnnotation(node.typeAnnotation)) return;
      context.report({ node, messageId: 'banned' });
    }

    return {
      // `JSON.parse(x) as Foo` — TSAsExpression
      TSAsExpression: checkCast,
      // `<Foo>JSON.parse(x)` — TSTypeAssertion (rare in modern TSX)
      TSTypeAssertion: checkCast,
    };
  },
};
