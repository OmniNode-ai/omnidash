/**
 * Reads contract.yaml and writes src/config/generated/data-source-defaults.ts.
 * Run via: npm run generate:config
 *
 * The generated file is the client-side contract entrypoint — src/data-source/index.ts
 * imports defaults from it. Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL)
 * remain as optional runtime overrides.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(__dirname, '..', 'contract.yaml');
const contractOverlayPath = resolve(__dirname, '..', 'contract.local.yaml');
const outPath = resolve(__dirname, '..', 'src', 'config', 'generated', 'data-source-defaults.ts');

type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export interface Defaults {
  mode: DataSourceMode;
  url: string;
  sqliteDbPath: string;
  projectionTenantId: string;
  // OMN-26056: the dashboard's one refresh interval (seconds) and the decisions record window (0 = the server's own page).
  refreshIntervalSeconds: number;
  decisionsPageLimit: number;
}

/** OMN-23330 AC21: nothing refreshes faster than this unless src/theme/refresh.ts names it with a reason. */
const REFRESH_INTERVAL_FLOOR_SECONDS = 30;
/** The projection API's own page of decisions (omnimarket node_projection_query_api_effect), the most a window may ask. */
const DECISIONS_PAGE_LIMIT_CEILING = 500;

function wholeNumber(key: string, value: string, min: number, max: number): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(n) || n < min || n > max) {
    throw new Error(`refresh.${key} must be a whole number from ${min} to ${max}, got "${value}"`);
  }
  return n;
}

function defaultDataSource(): Defaults {
  return {
    mode: 'sqlite',
    url: 'http://localhost:3002',
    sqliteDbPath: '~/.omninode/delegation/delegation.sqlite',
    // OMN-18159: no default tenant, ever. See contract.yaml.
    projectionTenantId: '',
    refreshIntervalSeconds: REFRESH_INTERVAL_FLOOR_SECONDS,
    decisionsPageLimit: 0,
  };
}

export function parseContract(raw: string, initial: Defaults = defaultDataSource()): Defaults {
  const defaults: Defaults = { ...initial };

  let section: 'data_source' | 'refresh' | null = null;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line === 'data_source:') {
      section = 'data_source';
      continue;
    }
    // OMN-26056: the refresh section, the one declared place for the interval and the window.
    if (line === 'refresh:') {
      section = 'refresh';
      continue;
    }
    if (section !== null && /^\S/.test(line) && !line.startsWith(' ') && !line.startsWith('\t')) {
      section = null;
    }
    if (section === null) continue;

    const m = line.match(/^\s+(\w+):\s+"?([^"]*)"?\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (section === 'refresh') {
      if (key === 'interval_seconds') defaults.refreshIntervalSeconds = wholeNumber(key, value, REFRESH_INTERVAL_FLOOR_SECONDS, 86_400);
      else if (key === 'decisions_page_limit') defaults.decisionsPageLimit = wholeNumber(key, value, 0, DECISIONS_PAGE_LIMIT_CEILING);
      continue;
    }
    if (key === 'default') defaults.mode = value as DataSourceMode;
    else if (key === 'url') defaults.url = value;
    // OMN-12969: ws_url removed — the `/ws` invalidation path was dead
    // (no `/ws` route on the deployed projection backend). Live updates are
    // poll-driven via useProjectionQuery. The key is ignored if still present.
    else if (key === 'sqlite_db_path') defaults.sqliteDbPath = value;
    else if (key === 'projection_tenant_id') defaults.projectionTenantId = value;
  }

  return defaults;
}

function main(): void {
  let d = parseContract(readFileSync(contractPath, 'utf8'));
  if (existsSync(contractOverlayPath)) {
    d = parseContract(readFileSync(contractOverlayPath, 'utf8'), d);
}

const generated = `// GENERATED — do not edit. Source: contract.yaml
// Regenerate with: npm run generate:config
//
// OMN-10756: data-source defaults are owned by contract.yaml.
// Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL, VITE_HTTP_DATA_SOURCE_URL)
// are optional overrides; these values are the canonical defaults.

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export const DATA_SOURCE_DEFAULT_MODE: DataSourceMode = ${JSON.stringify(d.mode)};
export const DATA_SOURCE_DEFAULT_URL: string = ${JSON.stringify(d.url)};
export const DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: string = ${JSON.stringify(d.sqliteDbPath)};

// OMN-18159: the tenant tenant-scoped exposures are read as. Empty means none
// is configured, and every tenant-scoped exposure then refuses rather than
// being read unscoped.
export const PROJECTION_TENANT_ID_DEFAULT: string = ${JSON.stringify(d.projectionTenantId)};

// OMN-26056: the one refresh interval in seconds (src/theme/refresh.ts reads it) and the decisions record window, the
// number of runs one decisions page asks for (0 = no limit sent, the server's own page of 500). Both are declared in
// contract.yaml's refresh section and may be named by a deployment overlay (contract.local.yaml).
export const REFRESH_INTERVAL_SECONDS_DEFAULT: number = ${d.refreshIntervalSeconds};
export const DECISIONS_PAGE_LIMIT_DEFAULT: number = ${d.decisionsPageLimit};
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, generated, 'utf8');
console.log(`[generate:config] wrote ${outPath}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
