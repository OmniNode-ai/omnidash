/**
 * Reads contract.yaml and writes src/config/generated/data-source-defaults.ts.
 * Run via: npm run generate:config
 *
 * The generated file is the client-side contract entrypoint — src/data-source/index.ts
 * imports defaults from it. Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL)
 * remain as optional runtime overrides.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(__dirname, '..', 'contract.yaml');
const outPath = resolve(__dirname, '..', 'src', 'config', 'generated', 'data-source-defaults.ts');

type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

interface Defaults {
  mode: DataSourceMode;
  url: string;
  wsUrl: string;
  sqliteDbPath: string;
}

function parseContract(raw: string): Defaults {
  const defaults: Defaults = {
    mode: 'sqlite',
    url: 'http://localhost:3002',
    wsUrl: 'ws://localhost:3002/ws',
    sqliteDbPath: '~/.omninode/delegation/delegation.sqlite',
  };

  let inDataSource = false;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line === 'data_source:') {
      inDataSource = true;
      continue;
    }
    if (inDataSource && /^\S/.test(line) && !line.startsWith(' ') && !line.startsWith('\t')) {
      inDataSource = false;
    }
    if (!inDataSource) continue;

    const m = line.match(/^\s+(\w+):\s+"?([^"]*)"?\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'default') defaults.mode = value as DataSourceMode;
    else if (key === 'url') defaults.url = value;
    else if (key === 'ws_url') defaults.wsUrl = value;
    else if (key === 'sqlite_db_path') defaults.sqliteDbPath = value;
  }

  return defaults;
}

const raw = readFileSync(contractPath, 'utf8');
const d = parseContract(raw);

const generated = `// GENERATED — do not edit. Source: contract.yaml
// Regenerate with: npm run generate:config
//
// OMN-10756: data-source defaults are owned by contract.yaml.
// Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL, VITE_HTTP_DATA_SOURCE_URL)
// are optional overrides; these values are the canonical defaults.

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export const DATA_SOURCE_DEFAULT_MODE: DataSourceMode = ${JSON.stringify(d.mode)};
export const DATA_SOURCE_DEFAULT_URL: string = ${JSON.stringify(d.url)};
export const DATA_SOURCE_DEFAULT_WS_URL: string = ${JSON.stringify(d.wsUrl)};
export const DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: string = ${JSON.stringify(d.sqliteDbPath)};
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, generated, 'utf8');
console.log(`[generate:config] wrote ${outPath}`);
