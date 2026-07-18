// eslint-rules/no-fetch-header-overwrite.test.cjs
//
// OMN-14764 (F-19-D): RuleTester coverage for no-fetch-header-overwrite.
// RuleTester registers via the ambient describe/it that vitest provides
// (vitest.config.ts sets globals: true).

'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-fetch-header-overwrite.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-fetch-header-overwrite', rule, {
  valid: [
    // No spread of caller options -> there are no inherited headers to drop.
    "fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });",
    // The headers literal re-spreads caller headers -> correct merge.
    "fetch(url, { ...init, headers: { ...init.headers, 'Content-Type': 'x' } });",
    // Spread present but no fresh headers literal.
    'fetch(url, { ...init });',
    // Spread + headers, but headers is not an object literal (can't prove a drop).
    'fetch(url, { ...init, headers: buildHeaders(init) });',
    // No RequestInit at all.
    'fetch(url);',
    // Spread + other keys, no headers key.
    "fetch(url, { ...init, method: 'POST' });",
    // Not fetch.
    "post(url, { ...init, headers: { 'Content-Type': 'x' } });",
  ],
  invalid: [
    {
      // The exact F-19-D drop pattern.
      code: "fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });",
      errors: [{ messageId: 'headerOverwrite' }],
    },
    {
      // Empty fresh headers literal still overwrites the spread's headers.
      code: 'fetch(url, { ...opts, headers: {} });',
      errors: [{ messageId: 'headerOverwrite' }],
    },
    {
      // window.fetch member form.
      code: 'window.fetch(url, { ...init, headers: { Authorization: token } });',
      errors: [{ messageId: 'headerOverwrite' }],
    },
    {
      // Quoted "headers" key.
      code: "fetch(url, { ...init, 'headers': { 'X-Foo': '1' } });",
      errors: [{ messageId: 'headerOverwrite' }],
    },
  ],
});
