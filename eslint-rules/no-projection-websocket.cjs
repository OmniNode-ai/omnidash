// eslint-rules/no-projection-websocket.cjs
//
// OMN-12969: ban raw browser `new WebSocket(...)` in client source.
//
// Why this rule exists:
//   The dashboard previously opened a `/ws` invalidation/live-tail socket
//   (useWebSocketInvalidation, EventStream.useEventWebSocket) derived from the
//   projection backend URL. The deployed projection backend (FastAPI
//   projection-api) serves HTTP reads + an advisory SSE hint only — it never
//   registered a `/ws` route — so every browser upgrade was rejected (403) and
//   no INVALIDATE/event frame was ever delivered. The path was dead on both
//   ends and produced persistent console errors. It was removed in favour of
//   poll-only projection reads via `useProjectionQuery`.
//
// What this rule enforces:
//   No client code may construct a browser WebSocket. The authoritative live
//   update surface is the projection backend, which is HTTP/SSE. If a real
//   push channel is ever added, it must be a contract-declared endpoint that
//   actually exists on the deployed backend — wire it deliberately and update
//   this rule in the same change, rather than reintroducing an unwired socket.
//
// Scope:
//   Applies to the browser source tree (src/**). Test/spec/story files are
//   exempt so fixtures can still construct mock socket doubles if ever needed.
//
// There is intentionally NO inline-disable escape hatch documented here: a
// genuine push channel is an architectural change that should edit this rule,
// not suppress it.

'use strict';

const ALLOWED_FILE = /\.(test|spec|stories)\.[cm]?[tj]sx?$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow constructing a browser WebSocket in client source. The ' +
        'projection backend is HTTP/SSE only; the removed `/ws` path was a ' +
        'dead 403. Live updates are poll-driven via useProjectionQuery.',
    },
    messages: {
      noProjectionWebSocket:
        'Do not open a browser WebSocket (OMN-12969). The deployed projection ' +
        'backend has no `/ws` route — the upgrade is rejected (403). Use ' +
        'useProjectionQuery polling for live updates. A real push channel ' +
        'requires a contract-declared backend endpoint and an update to the ' +
        'local/no-projection-websocket rule, not an inline suppression.',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename();
    if (ALLOWED_FILE.test(filename)) return {};

    function isWebSocketIdentifier(callee) {
      // `new WebSocket(...)`
      if (callee.type === 'Identifier' && callee.name === 'WebSocket') return true;
      // `new window.WebSocket(...)` / `new globalThis.WebSocket(...)` / `new self.WebSocket(...)`
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'WebSocket'
      ) {
        return true;
      }
      return false;
    }

    return {
      NewExpression(node) {
        if (isWebSocketIdentifier(node.callee)) {
          context.report({ node, messageId: 'noProjectionWebSocket' });
        }
      },
    };
  },
};
