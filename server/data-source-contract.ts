import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const CONTRACT_PATH = resolve(__dirname, '..', 'contract.yaml');
const CONTRACT_OVERLAY_PATH = resolve(__dirname, '..', 'contract.local.yaml');

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export type TenantAuthMode = 'disabled' | 'required';

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
  auth: {
    tenant_mode: string;
    issuer_url: string;
    audience: string;
    tenant_claim: string;
  };
  onboarding: {
    enabled: string;
    keycloak_apply_mode: string;
    keycloak_admin_base_url: string;
    keycloak_admin_client_id: string;
    keycloak_admin_client_secret_ref: string;
    postgres_database_url_secret_ref: string;
  };
}

type RuntimeContractPatch = {
  data_source?: Partial<RuntimeContract['data_source']>;
  event_bus?: Partial<RuntimeContract['event_bus']>;
  renderer_capability?: Partial<RuntimeContract['renderer_capability']>;
  auth?: Partial<RuntimeContract['auth']>;
  onboarding?: Partial<RuntimeContract['onboarding']>;
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
    auth: {
      // OMN-13824: tenant auth ships disabled until the Keycloak realm carries
      // the tenant claim (deploy/keycloak/ APPLY PLAN). 'required' enforces a
      // verified bearer token with a non-empty tenant claim on every request.
      tenant_mode: 'disabled',
      issuer_url: '',
      audience: '',
      tenant_claim: 'tenant_id',
    },
    onboarding: {
      // OMN-10875: self-service onboarding ships disabled; the Keycloak
      // admin surface defaults to plan mode (live realm applies stay
      // operator-gated).
      enabled: 'false',
      keycloak_apply_mode: 'plan',
      keycloak_admin_base_url: '',
      keycloak_admin_client_id: '',
      keycloak_admin_client_secret_ref: '',
      postgres_database_url_secret_ref: '',
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
        name === 'data_source'
          || name === 'event_bus'
          || name === 'renderer_capability'
          || name === 'auth'
          || name === 'onboarding'
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
    } else if (section === 'auth') {
      result.auth ??= {};
      if (key === 'tenant_mode') result.auth.tenant_mode = value;
      else if (key === 'issuer_url') result.auth.issuer_url = value;
      else if (key === 'audience') result.auth.audience = value;
      else if (key === 'tenant_claim') result.auth.tenant_claim = value;
    } else if (section === 'onboarding') {
      result.onboarding ??= {};
      if (key === 'enabled') result.onboarding.enabled = value;
      else if (key === 'keycloak_apply_mode') result.onboarding.keycloak_apply_mode = value;
      else if (key === 'keycloak_admin_base_url') result.onboarding.keycloak_admin_base_url = value;
      else if (key === 'keycloak_admin_client_id') result.onboarding.keycloak_admin_client_id = value;
      else if (key === 'keycloak_admin_client_secret_ref') {
        result.onboarding.keycloak_admin_client_secret_ref = value;
      } else if (key === 'postgres_database_url_secret_ref') {
        result.onboarding.postgres_database_url_secret_ref = value;
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
    auth: {
      ...base.auth,
      ...overlay.auth,
    },
    onboarding: {
      ...base.onboarding,
      ...overlay.onboarding,
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

export interface AuthConfig {
  /** disabled (pass-through, no tenant context) or required (verified bearer token mandatory). */
  tenantMode: TenantAuthMode;
  /** OIDC issuer URL, e.g. the Keycloak realm URL. Empty when auth is disabled. */
  issuerUrl: string;
  /** Expected `aud` claim; empty string disables audience checking. */
  audience: string;
  /** Token claim carrying the tenant id (deploy/keycloak/ mints `tenant_id`). */
  tenantClaim: string;
}

/**
 * OMN-13824 / OMN-1636: resolve the tenant-auth config. Contract-driven with
 * env overrides for lane tuning (same pattern as the other loaders). Fails
 * fast on an unknown mode and on `required` without an issuer — a silently
 * misconfigured auth gate must never boot.
 */
export function loadAuthConfig(): AuthConfig {
  const contract = loadContract();
  const rawMode = process.env.OMNIDASH_TENANT_AUTH_MODE ?? contract.auth.tenant_mode;
  if (rawMode !== 'disabled' && rawMode !== 'required') {
    throw new Error(`auth.tenant_mode must be 'disabled' or 'required', got: ${rawMode}`);
  }
  const issuerUrl = process.env.OMNIDASH_OIDC_ISSUER_URL ?? contract.auth.issuer_url;
  const audience = process.env.OMNIDASH_OIDC_AUDIENCE ?? contract.auth.audience;
  const tenantClaim = process.env.OMNIDASH_TENANT_CLAIM ?? contract.auth.tenant_claim;
  if (rawMode === 'required' && !issuerUrl) {
    throw new Error(
      "auth.tenant_mode 'required' needs auth.issuer_url (contract.yaml / contract.local.yaml or OMNIDASH_OIDC_ISSUER_URL)",
    );
  }
  if (!tenantClaim || tenantClaim.trim() === '') {
    throw new Error('auth.tenant_claim must be a non-empty claim name');
  }
  return { tenantMode: rawMode, issuerUrl, audience, tenantClaim };
}

export type KeycloakApplyMode = 'plan' | 'execute';

export interface OnboardingConfig {
  /** Master switch for the self-service onboarding endpoints. */
  enabled: boolean;
  /** plan (typed apply-plan, no realm mutation) or execute (live admin calls). */
  keycloakApplyMode: KeycloakApplyMode;
  /** Realm admin REST base URL (execute mode only). */
  keycloakAdminBaseUrl: string;
  keycloakAdminClientId: string;
  /** Resolved admin client secret; null when the ref/env is absent. */
  keycloakAdminClientSecret: string | null;
  /** Resolved writer-role Postgres URL for the tenants registry. */
  postgresDatabaseUrl: string | null;
}

/**
 * OMN-10875: resolve the self-service onboarding config. Contract-driven with
 * OMNIDASH_ONBOARDING_* env overrides for lane tuning. Fail-fast contract:
 * when enabled, the tenants-registry database ref must resolve and the apply
 * mode must be well-formed — a half-wired onboarding surface must never boot.
 */
export function loadOnboardingConfig(): OnboardingConfig {
  const contract = loadContract();
  const rawEnabled = process.env.OMNIDASH_ONBOARDING_ENABLED ?? contract.onboarding.enabled;
  const enabled = rawEnabled.trim().toLowerCase() === 'true';
  const rawApplyMode =
    process.env.OMNIDASH_ONBOARDING_KC_APPLY_MODE ?? contract.onboarding.keycloak_apply_mode;
  if (rawApplyMode !== 'plan' && rawApplyMode !== 'execute') {
    throw new Error(
      `onboarding.keycloak_apply_mode must be 'plan' or 'execute', got: ${rawApplyMode}`,
    );
  }
  const secretRef = contract.onboarding.keycloak_admin_client_secret_ref;
  const dbRef = contract.onboarding.postgres_database_url_secret_ref;
  const config: OnboardingConfig = {
    enabled,
    keycloakApplyMode: rawApplyMode,
    keycloakAdminBaseUrl:
      process.env.OMNIDASH_ONBOARDING_KC_ADMIN_BASE_URL
      ?? contract.onboarding.keycloak_admin_base_url,
    keycloakAdminClientId:
      process.env.OMNIDASH_ONBOARDING_KC_ADMIN_CLIENT_ID
      ?? contract.onboarding.keycloak_admin_client_id,
    keycloakAdminClientSecret: resolveSecretRef(secretRef),
    postgresDatabaseUrl: resolveSecretRef(dbRef),
  };
  if (enabled && !config.postgresDatabaseUrl) {
    throw new Error(
      'onboarding.enabled needs onboarding.postgres_database_url_secret_ref to resolve '
      + '(writer-role connection for the tenants registry)',
    );
  }
  return config;
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
