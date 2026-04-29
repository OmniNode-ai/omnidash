// eslint-rules/no-projection-fallback.cjs
//
// OMN-10304: flags fallback defaults applied to projection-derived values.
//
// v1 SCOPE (phased minimum — see PR body for documented false negatives):
//   CATCHES:
//     • Direct `??` or `||` on a member-expression where the object is a
//       variable bound from useProjectionQuery (e.g. `data[0].field ?? 0`).
//     • Direct `??` or `||` on a member-expression where the object is a
//       callback parameter iterating over a projection binding (e.g.
//       `data.map((d) => d.field ?? 0)` where `data` came from useProjectionQuery).
//     • Direct destructuring defaults on projection row variables
//       (e.g. `const { total_tokens = 0 } = projectionRow`).
//
//   DOES NOT CATCH (v1 false negatives, documented):
//     • Transitive flow: values passed through helper functions or spread into
//       a new object before a fallback is applied.
//     • Cross-file flow: a projection result exported from one file and
//       imported with a fallback in another file.
//     • for...of loop variables over projection arrays
//       (e.g. `for (const d of data) { d.field ?? 0 }`) — only .map/.forEach/.filter
//       callback first-params and direct destructures are detected in v1.
//
//   EXPLICITLY EXEMPT:
//     • Numeric literals for layout (margins, padding, gap values)
//     • Numeric literals for animation (durations, delays, easings)
//     • Numeric literals for dimensions (widths, heights, viewport sizes)
//     • Pagination pageSize defaults
//     • Test fixtures (.test.ts/.test.tsx) and Storybook stories (.stories.tsx)
//     • Chart geometry constants (axis ticks, legend offsets, tick counts)
//     • Map.get() fallbacks (e.g. `map.get(key) ?? 0`) — local accumulation,
//       not direct projection field reads.
//
// Detection strategy (v1):
//   1. Collect all identifiers bound from useProjectionQuery() in the current
//      function scope (e.g. `const { data } = useProjectionQuery(...)`).
//   2. When entering a callback passed to a method call whose object is a
//      projection binding (e.g. `data.map((d) => ...)`, `data.forEach(...)`),
//      register the first parameter (`d`) as a projection-row binding.
//   3. Report when a LogicalExpression (?? or ||) whose left-hand side is a
//      MemberExpression rooted in a projection binding.
//   4. Report when a VariableDeclarator's ObjectPattern init is a projection
//      binding and any property has an AssignmentPattern default.

'use strict';

const ALLOWED_FILE = /\.(test|spec|stories)\.[cm]?[tj]sx?$/;
const PROJECTION_HOOK = 'useProjectionQuery';

// Array methods whose first callback parameter is a row from the array.
const ARRAY_ROW_METHODS = new Set([
  'map', 'forEach', 'filter', 'find', 'findIndex', 'flatMap', 'some', 'every', 'reduce',
]);

function isProjectionQueryCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === PROJECTION_HOOK
  );
}

function isProjectionQueryResult(node) {
  if (!node) return false;
  if (isProjectionQueryCall(node)) return true;
  if (node.type === 'AwaitExpression') return isProjectionQueryResult(node.argument);
  return false;
}

// Collect variable names bound from useProjectionQuery() in a list of statements.
// Two passes: first collect direct hook results, then collect one-hop re-assignments
// (e.g. `const row = data[0]` after `const { data } = useProjectionQuery(...)`).
function collectProjectionBindings(bodyStatements) {
  const bindings = new Set();

  // Pass 1: direct useProjectionQuery() results.
  for (const stmt of bodyStatements) {
    if (!stmt || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations) {
      if (!isProjectionQueryResult(decl.init)) continue;
      if (decl.id.type === 'ObjectPattern') {
        for (const prop of decl.id.properties) {
          if (prop.type === 'Property' && prop.value.type === 'Identifier') {
            bindings.add(prop.value.name);
          } else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
            bindings.add(prop.argument.name);
          }
        }
      } else if (decl.id.type === 'Identifier') {
        bindings.add(decl.id.name);
      }
    }
  }

  // Pass 2: one-hop re-assignments from projection bindings.
  // e.g. `const row = data[0]` or `const d = data?.[0]`
  for (const stmt of bodyStatements) {
    if (!stmt || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations) {
      if (decl.id.type !== 'Identifier') continue;
      if (!decl.init) continue;
      const root = rootIdent(decl.init);
      if (root && bindings.has(root)) {
        bindings.add(decl.id.name);
      }
    }
  }

  return bindings;
}

// Returns the root identifier name of a MemberExpression chain.
function rootIdent(node) {
  let n = node;
  while (n.type === 'MemberExpression' || n.type === 'ChainExpression') {
    n = n.type === 'ChainExpression' ? n.expression : n.object;
  }
  return n.type === 'Identifier' ? n.name : null;
}

// Is this a MemberExpression (or chain) rooted in one of the given bindings?
function isProjectionMember(node, bindings) {
  const root = rootIdent(node);
  return root !== null && bindings.has(root);
}

// Is this a Map.get() call? We exempt these because they're local accumulator
// lookups, not direct projection field reads.
function isMapGetCall(node) {
  // (acc.get(key) ?? 0) — node.left is a CallExpression whose callee is .get
  if (node.type !== 'CallExpression') return false;
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'get'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow fallback defaults (??  ||  destructuring =) applied directly to ' +
        'projection-derived values. Replace with null + EmptyState rendering.',
    },
    messages: {
      projectionFallback:
        'Fallback default on a projection-derived value hides missing data. ' +
        'Remove the fallback and render an EmptyState when the value is null/undefined.',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename();
    if (ALLOWED_FILE.test(filename)) return {};

    // Stack of binding sets, one per function scope. Each entry maps
    // identifiers → true when they are projection-derived.
    const scopeStack = [];

    function currentBindings() {
      const merged = new Set();
      for (const s of scopeStack) {
        for (const b of s) merged.add(b);
      }
      return merged;
    }

    function bodyOf(node) {
      const body = node.body;
      if (!body) return [];
      if (Array.isArray(body)) return body;
      if (body.type === 'BlockStatement') return body.body;
      return [];
    }

    // When we enter a function, collect its statement-level projection bindings.
    function enterFunctionScope(node) {
      const stmts = bodyOf(node);
      const bindings = collectProjectionBindings(stmts);
      // If this function is an array-method callback and its parent call's
      // object is a projection binding in the outer scope, the first param
      // is a projection row.
      const outerBindings = currentBindings();
      if (outerBindings.size > 0) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'CallExpression' &&
          parent.callee.type === 'MemberExpression' &&
          !parent.callee.computed &&
          parent.callee.property.type === 'Identifier' &&
          ARRAY_ROW_METHODS.has(parent.callee.property.name)
        ) {
          const arrayObj = parent.callee.object;
          if (isProjectionMember(arrayObj, outerBindings)) {
            // First param is a row identifier — add it to this scope's bindings.
            const params = node.params;
            if (params && params.length > 0) {
              const firstParam = params[0];
              if (firstParam.type === 'Identifier') {
                bindings.add(firstParam.name);
              } else if (firstParam.type === 'ObjectPattern') {
                // Destructured row param `({ field }) => ...`
                for (const prop of firstParam.properties) {
                  if (prop.type === 'Property' && prop.value.type === 'Identifier') {
                    bindings.add(prop.value.name);
                  }
                }
              }
            }
          }
        }
      }
      scopeStack.push(bindings);
    }

    function exitScope() {
      scopeStack.pop();
    }

    return {
      Program(node) {
        const bindings = collectProjectionBindings(node.body);
        scopeStack.push(bindings);
      },
      'Program:exit': exitScope,

      FunctionDeclaration(node) { enterFunctionScope(node); },
      'FunctionDeclaration:exit': exitScope,

      FunctionExpression(node) { enterFunctionScope(node); },
      'FunctionExpression:exit': exitScope,

      ArrowFunctionExpression(node) { enterFunctionScope(node); },
      'ArrowFunctionExpression:exit': exitScope,

      // Flag `expr ?? fallback` and `expr || fallback` where expr is a
      // projection-derived member expression.
      LogicalExpression(node) {
        if (node.operator !== '??' && node.operator !== '||') return;
        const bindings = currentBindings();
        if (bindings.size === 0) return;
        const left = node.left;
        const right = node.right;
        // Exempt Map.get() calls (acc.get(key) ?? 0)
        if (isMapGetCall(left)) return;
        // Exempt `?? null` and `?? undefined` — these are honest null conversions,
        // not data-hiding numeric fallbacks.
        if (
          right.type === 'Literal' && right.value === null
        ) return;
        if (
          right.type === 'Identifier' && right.name === 'undefined'
        ) return;
        // Must be a MemberExpression (or chain) rooted at a projection binding.
        if (
          (left.type === 'MemberExpression' || left.type === 'ChainExpression') &&
          isProjectionMember(left, bindings)
        ) {
          context.report({ node, messageId: 'projectionFallback' });
        }
      },

      // Flag `const { field = 0 } = projectionRow` (direct statement-level
      // destructuring default on a projection binding).
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern') return;
        if (!node.init) return;
        const bindings = currentBindings();
        if (bindings.size === 0) return;
        const isProjectionInit =
          (node.init.type === 'Identifier' && bindings.has(node.init.name)) ||
          (
            (node.init.type === 'MemberExpression' || node.init.type === 'ChainExpression') &&
            isProjectionMember(node.init, bindings)
          );
        if (!isProjectionInit) return;
        for (const prop of node.id.properties) {
          if (prop.type === 'Property' && prop.value.type === 'AssignmentPattern') {
            context.report({ node: prop.value, messageId: 'projectionFallback' });
          }
        }
      },
    };
  },
};
