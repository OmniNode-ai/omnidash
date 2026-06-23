// eslint-rules/index.cjs
module.exports = {
  rules: {
    'no-typography-inline': require('./no-typography-inline.cjs'),
    'no-cast-on-parsed-json': require('./no-cast-on-parsed-json.cjs'),
    'no-projection-fallback': require('./no-projection-fallback.cjs'),
    'no-env-fallback': require('./no-env-fallback.cjs'),
    'no-projection-websocket': require('./no-projection-websocket.cjs'),
    'no-untyped-empty-state': require('./no-untyped-empty-state.cjs'),
    'no-non-authoritative-read-source': require('./no-non-authoritative-read-source.cjs'),
  },
};
