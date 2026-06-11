/**
 * OMN-12969: no-projection-websocket ESLint rule unit tests.
 *
 * Pattern follows src/no-env-fallback.test.ts: import ESLint via string-concat
 * so Vite can't statically resolve the dev-dep at bundle time, then drive the
 * rule with ESLint.lintText().
 *
 * Guards the removal of the dead `/ws` invalidation/live-tail path: client
 * source may no longer construct a browser WebSocket against the projection
 * backend (which is HTTP/SSE only — the `/ws` upgrade was a 403).
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

const SRC_FILE = resolve(ROOT, 'src/__lint_fixture_projection_ws.tsx');
const TEST_FILE = resolve(ROOT, 'src/__lint_fixture_projection_ws.test.tsx');

async function lint(code: string, filePath: string) {
  const eslintModule = 'es' + 'lint';
  const { ESLint } = await import(eslintModule);
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m: { ruleId?: string }) => m.ruleId?.endsWith('no-projection-websocket'),
  );
}

// ── Positive tests: rule MUST fire ──────────────────────────────────────────

describe('no-projection-websocket: positive (rule fires)', () => {
  it('flags new WebSocket(url)', async () => {
    const code = `
      const ws = new WebSocket('ws://localhost:3002/ws');
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags new window.WebSocket(url)', async () => {
    const code = `
      const ws = new window.WebSocket('ws://localhost:3002/ws');
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags new globalThis.WebSocket(url)', async () => {
    const code = `
      const ws = new globalThis.WebSocket('ws://localhost:3002/ws');
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });
});

// ── Negative tests: rule MUST NOT fire ──────────────────────────────────────

describe('no-projection-websocket: negative (rule silent)', () => {
  it('does not flag a non-WebSocket constructor', async () => {
    const code = `
      const es = new EventSource('/v1/evidence-pipeline/events/stream');
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations').toBe(0);
  });

  it('does not flag the WebSocket identifier outside a NewExpression', async () => {
    const code = `
      const ctor = WebSocket;
      const ready = ctor && ctor.OPEN;
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations').toBe(0);
  });

  it('does not flag new WebSocket in test files (mocks are allowed)', async () => {
    const code = `
      const ws = new WebSocket('ws://localhost:3002/ws');
    `;
    const msgs = await lint(code, TEST_FILE);
    expect(msgs.length, 'expected no violations in test file').toBe(0);
  });
});
