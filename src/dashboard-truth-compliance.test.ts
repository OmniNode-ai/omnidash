import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DASHBOARD_DIR = resolve(ROOT, 'src/components/dashboard');
const COMPONENT_README = resolve(DASHBOARD_DIR, 'README.md');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SOURCE_EXCLUDES = ['.test.ts', '.test.tsx', '.stories.ts', '.stories.tsx'];

const FORBIDDEN_IMPORTS = [
  'pg',
  'postgres',
  'postgresql',
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'mongodb',
  'redis',
  'ioredis',
  '@prisma/client',
  'prisma',
  'drizzle-orm',
  'kafkajs',
  'node:net',
  'node:http',
  'node:https',
  'node:tls',
  'node:dgram',
];

const FORBIDDEN_RUNTIME_MARKERS = [
  { pattern: /\bnew\s+PrismaClient\s*\(/, label: 'PrismaClient' },
  { pattern: /\bnew\s+Pool\s*\(/, label: 'database Pool' },
  { pattern: /\bnew\s+Client\s*\(\s*\{[^}]*connectionString/s, label: 'database Client' },
  { pattern: /\bKafka\s*\(/, label: 'Kafka client' },
  { pattern: /\bcreateClient\s*\(\s*\{[^}]*socket/s, label: 'backend socket client' },
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    if (SOURCE_EXCLUDES.some((suffix) => entry.name.endsWith(suffix))) continue;
    out.push(full);
  }
  return out.sort();
}

function importPattern(packageName: string): RegExp {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp([
    `\\b(?:import|export)\\b[^;\\n]*(?:from\\s*)?['"]${escaped}['"]`,
    `\\bimport\\s*\\(\\s*['"]${escaped}['"]\\s*\\)`,
    `\\brequire(?:\\.resolve)?\\s*\\(\\s*['"]${escaped}['"]\\s*\\)`,
  ].join('|'));
}

describe('dashboard component truth contract', () => {
  it('documents the component-level truth boundary', () => {
    expect(existsSync(COMPONENT_README)).toBe(true);
    const readme = readFileSync(COMPONENT_README, 'utf8');
    expect(readme).toContain('OmniNode deterministic truth doctrine');
    expect(readme).toContain('Dashboard components are presentation surfaces');
    expect(readme).toContain('must not');
    expect(readme).toContain('read Postgres');
    expect(readme).toContain('React state must not become the source of truth');
  });

  it('keeps backend database and event-bus clients out of dashboard components', () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(DASHBOARD_DIR)) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file);
      for (const packageName of FORBIDDEN_IMPORTS) {
        if (importPattern(packageName).test(src)) {
          violations.push(`${rel}: imports forbidden backend client "${packageName}"`);
        }
      }
      for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
        if (marker.pattern.test(src)) {
          violations.push(`${rel}: constructs ${marker.label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
