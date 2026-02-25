/**
 * Shared runtime identity module for ONEX runtime integration.
 *
 * This module reads environment variables once at module load time,
 * providing a singleton object that can be imported across the codebase.
 *
 * Environment variables consumed:
 * - ONEX_NODE_ID: Unique identifier assigned by the runtime supervisor
 * - ONEX_CONTRACT_FINGERPRINT: Hash of the node's contract.yaml
 * - ONEX_RUNTIME_MODE: Operating mode — one of the RuntimeMode union values
 * - ONEX_ENV: Environment name (dev, staging, prod)
 * - ONEX_SUPERVISOR_PID: Process ID of the supervising runtime
 * - ONEX_INJECTED_AT: ISO timestamp when identity was injected
 */

/** Valid operating modes for the ONEX runtime. */
export type RuntimeMode = 'standalone' | 'managed' | 'orchestrated' | 'development';

const VALID_RUNTIME_MODES: readonly RuntimeMode[] = [
  'standalone',
  'managed',
  'orchestrated',
  'development',
];

/**
 * Parses ONEX_RUNTIME_MODE from the environment.
 * Falls back to 'standalone' if the value is absent or not a recognised RuntimeMode.
 */
function parseRuntimeMode(value: string | undefined): RuntimeMode {
  if (value && (VALID_RUNTIME_MODES as readonly string[]).includes(value)) {
    return value as RuntimeMode;
  }
  return 'standalone';
}

export interface RuntimeIdentity {
  nodeId: string | null;
  contractFingerprint: string | null;
  runtimeMode: RuntimeMode;
  env: string;
  supervised: boolean;
  supervisorPid: string | null;
  injectedAt: string | null;
}

/**
 * Singleton runtime identity object, populated from environment variables.
 * Values are read once at module load time.
 */
export const runtimeIdentity: RuntimeIdentity = {
  nodeId: process.env.ONEX_NODE_ID || null,
  contractFingerprint: process.env.ONEX_CONTRACT_FINGERPRINT || null,
  runtimeMode: parseRuntimeMode(process.env.ONEX_RUNTIME_MODE),
  env: process.env.ONEX_ENV || 'dev',
  supervised: !!process.env.ONEX_NODE_ID,
  supervisorPid: process.env.ONEX_SUPERVISOR_PID || null,
  injectedAt: process.env.ONEX_INJECTED_AT || null,
};

/**
 * Returns the runtime identity in snake_case format for JSON API responses.
 * This maintains API compatibility with external consumers expecting snake_case keys.
 */
export function getRuntimeIdentityForApi(): Record<string, string | boolean | null> {
  return {
    node_id: runtimeIdentity.nodeId,
    contract_fingerprint: runtimeIdentity.contractFingerprint,
    runtime_mode: runtimeIdentity.runtimeMode,
    env: runtimeIdentity.env,
    supervised: runtimeIdentity.supervised,
    supervisor_pid: runtimeIdentity.supervisorPid,
    injected_at: runtimeIdentity.injectedAt,
  };
}
