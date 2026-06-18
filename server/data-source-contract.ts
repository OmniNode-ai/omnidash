import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const CONTRACT_PATH = resolve(__dirname, '..', 'contract.yaml');
const CONTRACT_OVERLAY_PATH = resolve(__dirname, '..', 'contract.local.yaml');

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

interface RuntimeContract {
  data_source: {
    default: DataSourceMode;
    url: string;
    ws_url: string;
    sqlite_db_path: string;
    postgres_database_url_secret_ref: string;
  };
  event_bus: {
    bootstrap_servers: string;
    client_id: string;
  };
  renderer_capability: {
    heartbeat_enabled: string;
    heartbeat_interval_ms: string;
  };
}

type RuntimeContractPatch = {
  data_source?: Partial<RuntimeContract['data_source']>;
  event_bus?: Partial<RuntimeContract['event_bus']>;
  renderer_capability?: Partial<RuntimeContract['renderer_capability']>;
};

function defaultContract(): RuntimeContract {
  return {
    data_source: {
      default: 'sqlite',
      url: 'http://localhost:3002',
      ws_url: 'ws://localhost:3002/ws',
      sqlite_db_path: '~/.omninode/delegation/delegation.sqlite',
      postgres_database_url_secret_ref: '',
    },
    event_bus: {
      bootstrap_servers: '',
      client_id: 'omnidash-server',
    },
    renderer_capability: {
      heartbeat_enabled: 'true',
      heartbeat_interval_ms: '30000',
    },
  };
}

function parseYamlRuntimeContract(raw: string): RuntimeContractPatch {
  // Minimal YAML parser for the flat contract.yaml runtime config sections.
  // js-yaml is a transitive dep but not a declared direct dep — use a
  // simple line-by-line parse to avoid coupling to an undeclared package.
  const result: RuntimeContractPatch = {};
  let section: keyof RuntimeContract | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch) {
      const name = sectionMatch[1] as keyof RuntimeContract;
      section =
        name === 'data_source' || name === 'event_bus' || name === 'renderer_capability'
          ? name
          : null;
      continue;
    }
    if (!section) continue;

    const m = line.match(/^\s+(\w+):\s+"?([^"]*)"?\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (section === 'data_source') {
      result.data_source ??= {};
      if (key === 'default') result.data_source.default = value as DataSourceMode;
      else if (key === 'url') result.data_source.url = value;
      else if (key === 'ws_url') result.data_source.ws_url = value;
      else if (key === 'sqlite_db_path') result.data_source.sqlite_db_path = value;
      else if (key === 'postgres_database_url_secret_ref') {
        result.data_source.postgres_database_url_secret_ref = value;
      }
    } else if (section === 'event_bus') {
      result.event_bus ??= {};
      if (key === 'bootstrap_servers') result.event_bus.bootstrap_servers = value;
      else if (key === 'client_id') result.event_bus.client_id = value;
    } else if (section === 'renderer_capability') {
      result.renderer_capability ??= {};
      if (key === 'heartbeat_enabled') result.renderer_capability.heartbeat_enabled = value;
      else if (key === 'heartbeat_interval_ms') {
        result.renderer_capability.heartbeat_interval_ms = value;
      }
    }
  }

  return result;
}

function mergeContract(base: RuntimeContract, overlay: RuntimeContractPatch): RuntimeContract {
  return {
    data_source: {
      ...base.data_source,
      ...overlay.data_source,
    },
    event_bus: {
      ...base.event_bus,
      ...overlay.event_bus,
    },
    renderer_capability: {
      ...base.renderer_capability,
      ...overlay.renderer_capability,
    },
  };
}

function expandTilde(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

let _contract: RuntimeContract | null = null;

export function loadRuntimeContract(
  contractPath = CONTRACT_PATH,
  overlayPath = CONTRACT_OVERLAY_PATH,
): RuntimeContract {
  let contract = mergeContract(defaultContract(), parseYamlRuntimeContract(readFileSync(contractPath, 'utf8')));
  if (existsSync(overlayPath)) {
    contract = mergeContract(contract, parseYamlRuntimeContract(readFileSync(overlayPath, 'utf8')));
  }
  return contract;
}

function loadContract(): RuntimeContract {
  if (_contract) return _contract;
  _contract = loadRuntimeContract();
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
  /** Contract-declared secret reference for the Postgres projection DB URL. */
  postgresDatabaseUrlSecretRef: string | null;
  /** Resolved Postgres projection DB URL. Null when no contract secret ref is configured. */
  postgresDatabaseUrl: string | null;
}

function resolveSecretRef(secretRef: string): string | null {
  if (!secretRef) return null;
  const [scheme, name] = secretRef.split(':', 2);
  if (scheme !== 'env' || !name) {
    throw new Error(`Unsupported data_source postgres_database_url_secret_ref: ${secretRef}`);
  }
  const value = process.env[name];
  return value && value.trim() !== '' ? value : null;
}

export function loadDataSourceConfig(
  contractPath?: string,
  overlayPath?: string,
): DataSourceConfig {
  const contract = contractPath ? loadRuntimeContract(contractPath, overlayPath) : loadContract();
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
    postgresDatabaseUrlSecretRef: contract.data_source.postgres_database_url_secret_ref || null,
    postgresDatabaseUrl: resolveSecretRef(contract.data_source.postgres_database_url_secret_ref),
  };
}

export interface EventBusConfig {
  /** Contract-resolved Kafka/Redpanda broker list for dispatch publishing. */
  bootstrapServers: string[];
  /** Kafka client id for the omnidash bridge producer. */
  clientId: string;
}

export function loadEventBusConfig(): EventBusConfig {
  const contract = loadContract();
  const rawBootstrapServers =
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS
    ?? contract.event_bus.bootstrap_servers;
  const bootstrapServers = rawBootstrapServers
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    bootstrapServers,
    clientId: process.env.OMNIDASH_EVENT_BUS_CLIENT_ID ?? contract.event_bus.client_id,
  };
}

export interface CapabilityHeartbeatConfig {
  /** Whether the server declares the renderer capability heartbeat on startup. */
  enabled: boolean;
  /** Re-publish interval in milliseconds. */
  intervalMs: number;
}

function parseBool(value: string): boolean {
  return value.trim().toLowerCase() === 'true';
}

/**
 * OMN-13131 (W-cap): resolve the renderer capability-heartbeat config. The
 * interval and enabled flag are contract-driven (overridable by env for lane
 * tuning). The heartbeat is force-disabled when no event_bus bootstrap_servers
 * are configured — the producer needs a broker, and silently emitting nowhere
 * would let the W5 row drift to is_degraded with no signal as to why.
 */
export function loadCapabilityHeartbeatConfig(): CapabilityHeartbeatConfig {
  const contract = loadContract();
  const rawEnabled =
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED
    ?? contract.renderer_capability.heartbeat_enabled;
  const rawIntervalMs =
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS
    ?? contract.renderer_capability.heartbeat_interval_ms;
  const intervalMs = Number.parseInt(rawIntervalMs, 10);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(
      `renderer_capability.heartbeat_interval_ms must be a positive integer, got: ${rawIntervalMs}`,
    );
  }
  const hasBroker = loadEventBusConfig().bootstrapServers.length > 0;
  return {
    enabled: parseBool(rawEnabled) && hasBroker,
    intervalMs,
  };
}
