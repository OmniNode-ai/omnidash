import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const CONTRACT_PATH = resolve(__dirname, '..', 'contract.yaml');

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

interface DataSourceContract {
  data_source: {
    default: DataSourceMode;
    url: string;
    ws_url: string;
    sqlite_db_path: string;
  };
}

function parseYamlDataSource(raw: string): DataSourceContract {
  // Minimal YAML parser for the flat contract.yaml structure.
  // js-yaml is a transitive dep but not a declared direct dep — use a
  // simple line-by-line parse to avoid coupling to an undeclared package.
  const result: DataSourceContract = {
    data_source: {
      default: 'sqlite',
      url: 'http://localhost:3002',
      ws_url: 'ws://localhost:3002/ws',
      sqlite_db_path: '~/.omninode/delegation/delegation.sqlite',
    },
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
    if (key === 'default') result.data_source.default = value as DataSourceMode;
    else if (key === 'url') result.data_source.url = value;
    else if (key === 'ws_url') result.data_source.ws_url = value;
    else if (key === 'sqlite_db_path') result.data_source.sqlite_db_path = value;
  }

  return result;
}

function expandTilde(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

let _contract: DataSourceContract | null = null;

function loadContract(): DataSourceContract {
  if (_contract) return _contract;
  const raw = readFileSync(CONTRACT_PATH, 'utf8');
  _contract = parseYamlDataSource(raw);
  return _contract;
}

export interface DataSourceConfig {
  /** Resolved data source mode: env override > contract default */
  mode: DataSourceMode;
  /** Bridge URL for sqlite/http client connections */
  url: string;
  /** WebSocket invalidation URL */
  wsUrl: string;
  /** Absolute path to the SQLite DB file */
  sqliteDbPath: string;
}

export function loadDataSourceConfig(): DataSourceConfig {
  const contract = loadContract();
  const mode = (process.env.OMNIDASH_DATA_SOURCE as DataSourceMode | undefined)
    ?? contract.data_source.default;
  const url = process.env.OMNIDASH_BRIDGE_URL ?? contract.data_source.url;
  const wsUrl = contract.data_source.ws_url;
  const rawDbPath = process.env.OMNIDASH_SQLITE_DB_PATH ?? contract.data_source.sqlite_db_path;
  return {
    mode,
    url,
    wsUrl,
    sqliteDbPath: expandTilde(rawDbPath),
  };
}
