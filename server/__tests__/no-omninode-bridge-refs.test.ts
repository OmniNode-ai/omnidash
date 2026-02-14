/**
 * Verification test: no references to omninode_bridge in source code (OMN-2061)
 *
 * omnidash owns its own read-model database (omnidash_analytics).
 * There should be no references to the old shared database (omninode_bridge)
 * in any TypeScript, TSX, or JSON source files.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname || __dirname, '..', '..');

/**
 * Recursively find files matching given extensions, excluding certain directories.
 */
function findFiles(dir: string, extensions: string[], excludeDirs: string[]): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          results.push(...findFiles(fullPath, extensions, excludeDirs));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results;
}

describe('DB-SPLIT-10: No omninode_bridge references', () => {
  it('has no omninode_bridge references in TypeScript/JSON source files', () => {
    const sourceFiles = findFiles(
      PROJECT_ROOT,
      ['.ts', '.tsx', '.json'],
      ['node_modules', 'dist', 'docs', '.git', '.claude', 'coverage']
    );

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      // Skip this test file itself
      if (filePath.includes('no-omninode-bridge-refs.test.ts')) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('omninode_bridge')) {
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('has OMNIDASH_ANALYTICS_DB_URL as the canonical connection variable', () => {
    const envExample = fs.readFileSync(path.join(PROJECT_ROOT, '.env.example'), 'utf-8');

    expect(envExample).toContain('OMNIDASH_ANALYTICS_DB_URL');
    expect(envExample).toContain('omnidash_analytics');
  });

  it('storage.ts prioritizes OMNIDASH_ANALYTICS_DB_URL', () => {
    const storageContent = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server', 'storage.ts'),
      'utf-8'
    );

    expect(storageContent).toContain('OMNIDASH_ANALYTICS_DB_URL');
    expect(storageContent).toContain('omnidash_analytics');
  });

  it('drizzle.config.ts uses OMNIDASH_ANALYTICS_DB_URL', () => {
    const drizzleConfig = fs.readFileSync(path.join(PROJECT_ROOT, 'drizzle.config.ts'), 'utf-8');

    expect(drizzleConfig).toContain('OMNIDASH_ANALYTICS_DB_URL');
  });

  it('migration file exists for read-model tables', () => {
    const migrationsDir = path.join(PROJECT_ROOT, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.includes('omnidash_analytics'));

    expect(files.length).toBeGreaterThan(0);
  });

  it('read-model consumer module exists', () => {
    const consumerPath = path.join(PROJECT_ROOT, 'server', 'read-model-consumer.ts');
    expect(fs.existsSync(consumerPath)).toBe(true);
  });
});
