/**
 * Worker Health Poller (OMN-3598)
 *
 * Polls `docker inspect` every 30s for all containers matching tracked prefixes,
 * then feeds results into the WorkerHealthProjection singleton.
 *
 * Tracked container name prefixes:
 *   - omnibase-infra-runtime
 *   - omninode-runtime
 *
 * If docker CLI is unavailable, the poller logs a warning (with 5-minute cooldown)
 * and retries on the next interval — it does NOT crash the server.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  workerHealthProjection,
  type WorkerHealthRecord,
} from './projections/worker-health-projection';

const execFileAsync = promisify(execFile);

// ============================================================================
// Constants
// ============================================================================

/** Poll interval in milliseconds. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Container name prefixes to track.
 * Any container whose name starts with one of these (after stripping leading /)
 * is included in the health projection.
 */
const TRACKED_PREFIXES = ['omnibase-infra-runtime', 'omninode-runtime'];

/** Minimum interval between "docker unavailable" log messages (ms). */
const LOG_COOLDOWN_MS = 5 * 60_000;

// ============================================================================
// State
// ============================================================================

/** Timestamp of the last "docker unavailable" warning log. */
let lastDockerUnavailableLogAt = 0;

// ============================================================================
// Docker inspect types
// ============================================================================

interface DockerInspectResult {
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    StartedAt?: string;
    Health?: {
      Status?: string;
    };
  };
  RestartCount: number;
}

// ============================================================================
// Poll logic
// ============================================================================

/**
 * List container IDs matching our tracked prefixes using `docker ps -a`.
 */
async function listTrackedContainerIds(): Promise<string[]> {
  // Use docker ps with filters for each prefix
  const filterArgs: string[] = [];
  for (const prefix of TRACKED_PREFIXES) {
    filterArgs.push('--filter', `name=${prefix}`);
  }

  const { stdout } = await execFileAsync(
    'docker',
    ['ps', '-a', '--format', '{{.ID}}', ...filterArgs],
    { timeout: 10_000 }
  );

  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * Run `docker inspect` on the given container IDs and parse results.
 */
async function inspectContainers(ids: string[]): Promise<WorkerHealthRecord[]> {
  if (ids.length === 0) return [];

  const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{json .}}', ...ids], {
    timeout: 10_000,
  });

  const now = new Date().toISOString();
  const records: WorkerHealthRecord[] = [];

  // docker inspect outputs one JSON object per line when using --format
  for (const line of stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as DockerInspectResult;
      const name = parsed.Name.replace(/^\//, ''); // strip leading /

      // Verify the name matches our tracked prefixes
      const isTracked = TRACKED_PREFIXES.some((prefix) => name.startsWith(prefix));
      if (!isTracked) continue;

      // Normalize health status: docker returns undefined/<no value> when no healthcheck
      let health = parsed.State.Health?.Status ?? 'none';
      if (health === '<no value>' || health === '') {
        health = 'none';
      }

      // Normalize startedAt: docker returns "0001-01-01T00:00:00Z" for never-started
      let startedAt: string | null = parsed.State.StartedAt ?? null;
      if (startedAt && startedAt.startsWith('0001-01-01')) {
        startedAt = null;
      }

      records.push({
        name,
        status: parsed.State.Status ?? 'unknown',
        restartCount: parsed.RestartCount ?? 0,
        health,
        startedAt,
        lastUpdated: now,
      });
    } catch {
      // Skip malformed JSON lines
    }
  }

  return records;
}

/**
 * Execute a single poll cycle: list containers, inspect them, update projection.
 */
async function pollWorkerHealth(): Promise<void> {
  try {
    const ids = await listTrackedContainerIds();
    const records = await inspectContainers(ids);

    workerHealthProjection.replaceAll(records);
    workerHealthProjection.setDockerAvailable(true);

    // Reset log cooldown on success
    lastDockerUnavailableLogAt = 0;
  } catch (err) {
    workerHealthProjection.setDockerAvailable(false);

    // Log with cooldown to avoid spamming every 30s
    const now = Date.now();
    if (now - lastDockerUnavailableLogAt >= LOG_COOLDOWN_MS) {
      console.warn(
        '[worker-health-poller] Docker CLI unavailable:',
        err instanceof Error ? err.message : String(err)
      );
      lastDockerUnavailableLogAt = now;
    }
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the worker health poller.
 * Performs an immediate poll on start, then polls every POLL_INTERVAL_MS.
 *
 * Idempotent — calling start() when already running is a no-op.
 */
export function startWorkerHealthPoller(): void {
  if (intervalHandle !== null) return;

  console.log(
    `[worker-health-poller] Starting — polling docker inspect every ${POLL_INTERVAL_MS}ms`
  );

  // Immediate first poll (fire-and-forget, errors are caught inside)
  pollWorkerHealth().catch((err) =>
    console.error('[worker-health-poller] Initial poll error:', err)
  );

  intervalHandle = setInterval(() => {
    pollWorkerHealth().catch((err) => console.error('[worker-health-poller] Poll error:', err));
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the worker health poller.
 */
export function stopWorkerHealthPoller(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[worker-health-poller] Stopped');
  }
}
