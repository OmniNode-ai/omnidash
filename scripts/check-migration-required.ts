/* eslint-disable no-console */
/**
 * Projection-migration coupling gate (OMN-3749).
 *
 * Detects PRs that modify read-model-consumer.ts (Kafka projection logic)
 * without including a corresponding migration file. Modeled after
 * omnibase_infra/scripts/check_migration_required.py.
 *
 * Bypass: Add `// no-migration: OMN-#### <reason>` anywhere in the changed file.
 *
 * Usage (CI -- compare against base branch):
 *   npx tsx scripts/check-migration-required.ts --ci
 *
 * Usage (pre-commit -- check staged files):
 *   npx tsx scripts/check-migration-required.ts --pre-commit
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** Files whose changes imply a possible schema change. */
const PROJECTION_PATTERNS = [
  /read-model-consumer\.ts$/,
  /projection[_-].*\.ts$/,
  /consumer[_-].*\.ts$/,
];

/** Directories that contain migration files. */
const MIGRATION_DIR = 'migrations/';

/** Bypass comment pattern: // no-migration: OMN-#### <reason> */
const BYPASS_RE = /\/\/\s*no-migration:\s*OMN-\d+/i;

/** SQL bypass comment pattern: -- no-schema: OMN-#### <reason> */
const SQL_BYPASS_RE = /--\s*no-schema:\s*OMN-\d+/i;

function isProjectionFile(filePath: string): boolean {
  return PROJECTION_PATTERNS.some((p) => p.test(filePath));
}

function isDeletedFile(filePath: string): boolean {
  return !fs.existsSync(filePath);
}

function hasBypassComment(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return BYPASS_RE.test(content) || SQL_BYPASS_RE.test(content);
  } catch {
    // File may have been deleted in the PR
    return false;
  }
}

function gitExec(...args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function getChangedFiles(ci: boolean): string[] {
  let output: string;
  if (ci) {
    // In CI, compare HEAD against the merge base with origin/main.
    // GitHub Actions checkout may be shallow, so fall back to diff against
    // origin/main directly if merge-base fails.
    try {
      const mergeBase = gitExec('merge-base', 'HEAD', 'origin/main').trim();
      output = gitExec('diff', '--name-only', `${mergeBase}...HEAD`);
    } catch {
      output = gitExec('diff', '--name-only', 'origin/main...HEAD');
    }
  } else {
    output = gitExec('diff', '--cached', '--name-only');
  }

  return output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function isCosmeticOnly(filePath: string): boolean {
  // For TypeScript we do a simpler heuristic: if the diff only touches
  // comments (lines starting with // or * or /*), whitespace, or imports,
  // treat as cosmetic.
  try {
    const diff = gitExec('diff', 'origin/main...HEAD', '--', filePath);

    const changedLines = diff
      .split('\n')
      .filter((line) => /^[+-]/.test(line) && !/^[+-]{3}/.test(line))
      .map((line) => line.slice(1).trim())
      .filter((line) => line.length > 0);

    if (changedLines.length === 0) return true;

    return changedLines.every(
      (line) =>
        line.startsWith('//') ||
        line.startsWith('*') ||
        line.startsWith('/*') ||
        line.startsWith('*/') ||
        line.startsWith('import ') ||
        line.startsWith('export type') ||
        /^\s*$/.test(line)
    );
  } catch {
    return false;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const preCommit = args.includes('--pre-commit');

  if (!ci && !preCommit) {
    console.error('Usage: npx tsx scripts/check-migration-required.ts --ci | --pre-commit');
    process.exit(2);
  }

  const changedFiles = getChangedFiles(ci);

  // Find projection files that were changed
  const projectionFiles = changedFiles.filter(isProjectionFile);
  if (projectionFiles.length === 0) {
    console.log('OK: no projection files changed, migration coupling check passed.');
    process.exit(0);
  }

  // Check if the PR already includes a migration file
  const hasMigration = changedFiles.some((f) => f.startsWith(MIGRATION_DIR) && f.endsWith('.sql'));
  if (hasMigration) {
    console.log('OK: projection files changed with accompanying migration, coupling check passed.');
    process.exit(0);
  }

  // Check each projection file for bypass comment or cosmetic-only changes
  const violations: string[] = [];
  for (const pf of projectionFiles) {
    if (isDeletedFile(pf)) {
      console.log(`SKIP: ${pf} was deleted — no schema change possible.`);
      continue;
    }
    if (hasBypassComment(pf)) {
      console.log(`BYPASS: ${pf} has no-migration bypass comment.`);
      continue;
    }
    if (ci && isCosmeticOnly(pf)) {
      console.log(`SKIP: ${pf} has only cosmetic changes (comments/whitespace/imports).`);
      continue;
    }
    violations.push(pf);
  }

  if (violations.length === 0) {
    console.log('OK: projection-migration coupling check passed.');
    process.exit(0);
  }

  console.error('');
  console.error('ERROR: Projection file(s) changed without a migration file in this PR:');
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  console.error('');
  console.error('Either:');
  console.error('  1. Add a migration file to migrations/');
  console.error('  2. Add "// no-migration: OMN-#### <reason>" to the changed file');
  console.error('     if no schema change is needed');
  console.error('');
  process.exit(1);
}

main();
