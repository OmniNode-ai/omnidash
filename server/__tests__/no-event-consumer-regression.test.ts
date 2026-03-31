/**
 * Anti-regression guard: No production code should import EventConsumer (OMN-7135)
 *
 * After the single-consumer architecture migration (OMN-7125), all EventConsumer
 * usage has been replaced with DB-backed projections. This test ensures no new
 * imports of EventConsumer are introduced in production code.
 *
 * Uses fs.readFileSync to scan files — no child_process/exec.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SERVER_DIR = join(__dirname, '..');

/**
 * Recursively collect all .ts files under a directory, excluding __tests__
 * and node_modules.
 */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Files that are PART of the EventConsumer module itself (allowed to reference it)
const ALLOWED_FILES = new Set([
  'event-consumer.ts',
  'consumers/consumer-lifecycle.ts',
  'consumers/consumer-state-helpers.ts',
  'consumers/event-preload.ts',
  'consumers/domain/types.ts',
  'consumers/domain/consumer-utils.ts',
]);

describe('No EventConsumer regression (OMN-7135)', () => {
  const tsFiles = collectTsFiles(SERVER_DIR);

  it('no production file imports from event-consumer', () => {
    const violations: string[] = [];

    for (const filePath of tsFiles) {
      const rel = relative(SERVER_DIR, filePath);
      if (ALLOWED_FILES.has(rel)) continue;

      const content = readFileSync(filePath, 'utf-8');

      // Check for import statements referencing event-consumer
      // Match: import ... from './event-consumer' or from '../event-consumer' etc.
      const importPattern = /import\s+.*from\s+['"][^'"]*event-consumer['"]/g;
      const matches = content.match(importPattern);
      if (matches) {
        // Filter out comment-only lines
        for (const match of matches) {
          const lines = content.split('\n');
          const lineIdx = lines.findIndex((l) => l.includes(match));
          if (lineIdx >= 0) {
            const line = lines[lineIdx].trim();
            // Skip if the line is a comment
            if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
            violations.push(`${rel}: ${line}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no production route file calls EventConsumer methods directly', () => {
    const routeFiles = tsFiles.filter((f) => f.includes('/routes/') || f.endsWith('-routes.ts'));
    const violations: string[] = [];
    const forbiddenPatterns = [
      /eventConsumer\.getAgentMetrics/,
      /eventConsumer\.getRecentActions/,
      /eventConsumer\.getPerformanceStats/,
      /eventConsumer\.getPerformanceMetrics/,
      /eventConsumer\.getHealthStatus/,
      /eventConsumer\.getRoutingDecisions/,
      /eventConsumer\.getRecentTransformations/,
      /eventConsumer\.getRegisteredNodes/,
      /eventConsumer\.getNodeRegistryStats/,
      /eventConsumer\.validateConnection/,
      /eventConsumer\.start\(/,
      /eventConsumer\.stop\(/,
    ];

    for (const filePath of routeFiles) {
      const rel = relative(SERVER_DIR, filePath);
      const content = readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(`${rel}: contains ${pattern.source}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
