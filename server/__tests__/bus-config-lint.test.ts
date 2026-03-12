/**
 * Lint guard: no direct process.env.KAFKA_BOOTSTRAP_SERVERS or
 * process.env.KAFKA_BROKERS reads outside the authorized callsites (OMN-4779).
 *
 * bus-config.ts is the sole authorized reader of raw Kafka env vars.
 * All other server code must call resolveBrokers() / getBrokerString() from
 * bus-config.ts to ensure consistent precedence and bus-mode enforcement.
 *
 * Allowed files:
 *   - server/bus-config.ts  — sole authorized resolver of raw env vars
 *   - *.test.ts             — test files may mock env vars directly
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER_DIR = path.resolve(import.meta.dirname || __dirname, '..');

/**
 * Recursively collect all .ts files under a directory, excluding node_modules.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        results.push(...collectTsFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('BUS-CONFIG-LINT: broker env vars must only be read through bus-config', () => {
  it('has no direct process.env.KAFKA_BOOTSTRAP_SERVERS reads outside bus-config.ts and test files', () => {
    const files = collectTsFiles(SERVER_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      // bus-config.ts is the sole authorized reader
      if (filePath.endsWith('bus-config.ts')) continue;
      // test files may mock env vars directly
      if (filePath.endsWith('.test.ts')) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('process.env.KAFKA_BOOTSTRAP_SERVERS')) {
        violations.push(path.relative(SERVER_DIR, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it('has no direct process.env.KAFKA_BROKERS reads outside bus-config.ts and test files', () => {
    const files = collectTsFiles(SERVER_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      // bus-config.ts is the sole authorized reader
      if (filePath.endsWith('bus-config.ts')) continue;
      // test files may mock env vars directly
      if (filePath.endsWith('.test.ts')) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('process.env.KAFKA_BROKERS')) {
        violations.push(path.relative(SERVER_DIR, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it('bus-config.ts exists as the singleton broker resolver', () => {
    const busConfigPath = path.join(SERVER_DIR, 'bus-config.ts');
    expect(fs.existsSync(busConfigPath)).toBe(true);
  });

  it('bus-config.ts exports resolveBrokers or getBrokerString', () => {
    const busConfigPath = path.join(SERVER_DIR, 'bus-config.ts');
    const content = fs.readFileSync(busConfigPath, 'utf-8');
    const exportsExpected =
      content.includes('export function resolveBrokers') ||
      content.includes('export function getBrokerString') ||
      content.includes('export const resolveBrokers') ||
      content.includes('export const getBrokerString');
    expect(exportsExpected).toBe(true);
  });
});
