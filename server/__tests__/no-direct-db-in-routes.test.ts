/**
 * CI gate: route files MUST NOT import getIntelligenceDb / tryGetIntelligenceDb (OMN-2325)
 *
 * All data access from route handlers must go through ProjectionService views.
 * Direct SQL queries couple the API layer to storage schema and bypass the
 * projection read path. This test fails if any *-routes.ts file imports the
 * database accessor, enforcing the projection-only architecture.
 *
 * Modeled after no-omninode-bridge-refs.test.ts.
 *
 * Exceptions:
 *   - intelligence-routes.ts: 65+ queries across 40+ endpoints. Migration to
 *     projections is a multi-ticket effort. The agents/summary endpoint already
 *     uses in-memory eventConsumer; remaining endpoints need incremental migration.
 *     TODO(OMN-2325-followup): Split into domain-specific route files, then
 *     create projections for each domain group.
 *   - validation-routes.ts: event handlers (handleValidationRunStarted, etc.)
 *     are write-side concerns that legitimately need DB access. The read-side
 *     route handlers in this file are tracked separately. Once the write-side
 *     is extracted to a dedicated consumer module, this exception can be removed.
 *   - alert-routes.ts: alert CRUD operations require direct DB writes.
 *     Once alerts are event-sourced, this exception can be removed.
 *   - golden-path-routes.ts: golden path CRUD operations require direct DB writes.
 *     Once golden paths are event-sourced, this exception can be removed.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER_DIR = path.resolve(import.meta.dirname, '..');

/**
 * Route files that are TEMPORARILY exempt from this rule.
 * Each entry must have a justification comment above.
 *
 * The goal is to shrink this list to zero over time.
 */
const EXEMPT_FILES = new Set([
  // 65+ queries across 40+ endpoints. Migration is a multi-ticket effort.
  // TODO(OMN-2325-followup): Split into domain-specific route files.
  'intelligence-routes.ts',

  // Write-side event handlers (handleValidationRunStarted, etc.)
  // live alongside read routes in the same file. Once extracted
  // to a separate write-side module, remove this exemption.
  'validation-routes.ts',

  // Alert CRUD requires direct DB writes (not yet event-sourced).
  'alert-routes.ts',

  // Golden path CRUD requires direct DB writes (not yet event-sourced).
  'golden-path-routes.ts',
]);

/**
 * Patterns that indicate direct DB access from route files.
 * Uses regex to match actual import statements, avoiding false positives
 * from comments or string literals that happen to mention these identifiers.
 */
const FORBIDDEN_IMPORT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'getIntelligenceDb', regex: /import\s.*getIntelligenceDb/ },
  { name: 'tryGetIntelligenceDb', regex: /import\s.*tryGetIntelligenceDb/ },
];

describe('OMN-2325: No direct DB access in route files', () => {
  it('route files do not import getIntelligenceDb or tryGetIntelligenceDb', () => {
    const routeFiles = fs
      .readdirSync(SERVER_DIR)
      .filter((f) => f.endsWith('-routes.ts') && !EXEMPT_FILES.has(f));

    expect(routeFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of routeFiles) {
      const filePath = path.join(SERVER_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const { name, regex } of FORBIDDEN_IMPORT_PATTERNS) {
        if (regex.test(content)) {
          violations.push(`${file} imports ${name}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Route files must not import DB accessors directly.\n` +
          `Use projectionService.getView('domain').getSnapshot() instead.\n` +
          `Violations:\n  ${violations.join('\n  ')}`
      );
    }
  });

  it('exempt files list only contains files that actually exist', () => {
    const missing = [...EXEMPT_FILES].filter((f) => !fs.existsSync(path.join(SERVER_DIR, f)));
    expect(missing).toEqual([]);
  });
});
