/**
 * OMN-12882: no-non-authoritative-read-source ESLint rule unit tests.
 *
 * Pattern follows src/no-projection-websocket.test.ts: import ESLint via
 * string-concat so Vite can't statically resolve the dev-dep at bundle time,
 * then drive the rule with ESLint.lintText().
 *
 * Guards Phase 6 "Permanent Guardrails": dashboard source must not read from
 * non-authoritative demo read origins — banned ports (:8765, :3010, :3002),
 * direct DB client imports (pg, sqlite3, better-sqlite3), or second backend
 * authority references (evidence-pipeline-flow).
 *
 * Standard projection reads go through src/data-source/ and must pass silently.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// Paths outside the approved data-source seam (will be checked by the rule)
const SRC_WIDGET = resolve(ROOT, 'src/components/dashboard/__lint_fixture_auth_read.tsx');
const TEST_FILE = resolve(ROOT, 'src/components/dashboard/__lint_fixture_auth_read.test.tsx');

// The approved seam: src/data-source/ is exempt from this rule
const DATASOURCE_FILE = resolve(ROOT, 'src/data-source/__lint_fixture_auth_read.ts');

async function lint(code: string, filePath: string) {
  const eslintModule = 'es' + 'lint';
  const { ESLint } = await import(eslintModule);
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m: { ruleId?: string }) => m.ruleId?.endsWith('no-non-authoritative-read-source'),
  );
}

// ── Positive tests: rule MUST fire ──────────────────────────────────────────

describe('no-non-authoritative-read-source: positive (rule fires)', () => {
  // Banned port :8765 (SEA demo server)
  it('flags fetch with :8765 port (SEA demo server)', async () => {
    const code = `
      const resp = await fetch('http://localhost:8765/api/sea/generate');
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for :8765').toBeGreaterThan(0);
  });

  it('flags fetch with :3010 port (merge proxy)', async () => {
    const code = `
      const resp = await fetch('http://localhost:3010/projection/events');
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for :3010').toBeGreaterThan(0);
  });

  it('flags fetch with :3002 port (bespoke projection alt)', async () => {
    const code = `
      const resp = await fetch('http://localhost:3002/projection/delegation');
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for :3002').toBeGreaterThan(0);
  });

  it('flags template literal with :8765 port', async () => {
    const code = `
      const base = 'http://localhost:8765';
      const resp = await fetch(\`\${base}/api/sea/generate\`);
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for template :8765').toBeGreaterThan(0);
  });

  it('flags direct pg import in src/', async () => {
    const code = `
      import { Client } from 'pg';
      const client = new Client({ host: 'localhost' });
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for pg import').toBeGreaterThan(0);
  });

  it('flags direct sqlite3 import in src/', async () => {
    const code = `
      import sqlite3 from 'sqlite3';
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for sqlite3 import').toBeGreaterThan(0);
  });

  it('flags direct better-sqlite3 import in src/', async () => {
    const code = `
      import Database from 'better-sqlite3';
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for better-sqlite3 import').toBeGreaterThan(0);
  });

  it('flags evidence-pipeline-flow as a URL path second backend reference', async () => {
    // URL with a path segment — this is the banned second backend authority pattern.
    const code = `
      const url = 'http://localhost:3002/v1/evidence-pipeline-flow/events';
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for evidence-pipeline-flow URL path').toBeGreaterThan(0);
  });

  it('flags evidence-pipeline-flow as a relative path in template literal', async () => {
    const code = `
      const path = \`/v1/evidence-pipeline-flow/status\`;
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected a violation for evidence-pipeline-flow in template').toBeGreaterThan(0);
  });
});

// ── Negative tests: rule MUST NOT fire ──────────────────────────────────────

describe('no-non-authoritative-read-source: negative (rule silent)', () => {
  it('does not flag standard /projection/{topic} fetch via approved seam', async () => {
    const code = `
      import { projectionUrl } from '@/data-source/projection-base-url';
      const url = projectionUrl('onex.snapshot.projection.delegation.summary.v1');
      const resp = await fetch(url);
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected no violations for approved projection fetch').toBe(0);
  });

  it('does not flag fetch with no banned port (proxy-relative path)', async () => {
    const code = `
      const resp = await fetch('/projection/onex.snapshot.projection.delegation.summary.v1');
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected no violations for proxy-relative fetch').toBe(0);
  });

  it('does not flag pg import inside server/ (server code is exempt)', async () => {
    const code = `
      import { Client } from 'pg';
    `;
    const serverFile = resolve(ROOT, 'server/routes.ts');
    const msgs = await lint(code, serverFile);
    expect(msgs.length, 'expected no violations in server/').toBe(0);
  });

  it('does not flag better-sqlite3 import inside server/', async () => {
    const code = `
      import Database from 'better-sqlite3';
    `;
    const serverFile = resolve(ROOT, 'server/db.ts');
    const msgs = await lint(code, serverFile);
    expect(msgs.length, 'expected no violations in server/').toBe(0);
  });

  it('does not flag banned-port string in test files', async () => {
    const code = `
      const mockUrl = 'http://localhost:8765/api/sea/generate';
    `;
    const msgs = await lint(code, TEST_FILE);
    expect(msgs.length, 'expected no violations in test file').toBe(0);
  });

  it('does not flag banned-port string in data-source/ (approved seam)', async () => {
    const code = `
      const base = import.meta.env.VITE_HTTP_DATA_SOURCE_URL ?? 'http://localhost:3002';
    `;
    // env-fallback-ok: data-source seam comment already present in real code
    const msgs = await lint(code, DATASOURCE_FILE);
    expect(msgs.length, 'expected no violations in data-source/').toBe(0);
  });

  it('does not flag pg import in data-source/ (approved seam)', async () => {
    const code = `
      import { Client } from 'pg';
    `;
    const msgs = await lint(code, DATASOURCE_FILE);
    expect(msgs.length, 'expected no violations for pg in data-source/').toBe(0);
  });

  it('does not flag a port-looking number that is not a host:port pattern', async () => {
    const code = `
      const timeout = 3002;
      const count = 8765;
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected no violations for standalone numbers').toBe(0);
  });

  it('does not flag evidence-pipeline-flow as a React Query cache key (no slash)', async () => {
    // Cache key string with no URL path separators — not a backend reference.
    const code = `
      const { data } = useQuery({ queryKey: ['evidence-pipeline-flow'] });
    `;
    const msgs = await lint(code, SRC_WIDGET);
    expect(msgs.length, 'expected no violations for bare cache key string').toBe(0);
  });

  it('does not flag banned-port URL in generated config (exempt path)', async () => {
    const code = `
      export const DATA_SOURCE_DEFAULT_URL: string = "http://localhost:3002";
    `;
    const generatedFile = resolve(ROOT, 'src/config/generated/data-source-defaults.ts');
    const msgs = await lint(code, generatedFile);
    expect(msgs.length, 'expected no violations in generated config').toBe(0);
  });
});
