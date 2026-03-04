/**
 * WorkerHealthProjection — In-memory projection for Docker container health (OMN-3598)
 *
 * Data source: Polled from `docker inspect` via worker-health-poller.ts
 *
 * Tracks runtime containers matching prefixes:
 *   - omnibase-infra-runtime-*
 *   - omninode-runtime*
 *
 * Payload shape served via /api/worker-health:
 *   WorkerHealthPayload { workers: WorkerHealthRecord[], summary: WorkerHealthSummary, dockerAvailable: boolean, restartThreshold: number }
 */

// ============================================================================
// Types
// ============================================================================

/** Health record for a single Docker container. */
export interface WorkerHealthRecord {
  /** Container name (e.g. omninode-runtime, omnibase-infra-runtime-effects). */
  name: string;
  /** Container status string from docker inspect (e.g. "running", "exited", "restarting"). */
  status: string;
  /** Number of container restarts. */
  restartCount: number;
  /** Docker healthcheck status: "healthy", "unhealthy", "starting", or "none". */
  health: string;
  /** ISO timestamp when the container was started. Null if never started. */
  startedAt: string | null;
  /** ISO timestamp when this record was last updated by the poller. */
  lastUpdated: string;
}

/** Summary counts for the Worker Health dashboard header. */
export interface WorkerHealthSummary {
  /** Total number of tracked containers. */
  total: number;
  /** Containers that are running and healthy (or running with no healthcheck). */
  healthy: number;
  /** Containers with restartCount > restartThreshold. */
  restarting: number;
  /** Containers that are not running (exited, dead, created, etc.). */
  down: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Restart count above which a container is flagged as "restarting". */
const RESTART_THRESHOLD = 5;

// ============================================================================
// Projection
// ============================================================================

/**
 * WorkerHealthProjection — in-memory accumulator for Docker container health.
 *
 * Keyed by container name. Supports:
 *   - ingest(record): update container health from a fresh poll
 *   - getAll(): retrieve all worker records sorted by name
 *   - getSummary(): aggregate counts for the dashboard header
 *   - setDockerAvailable(available): track docker CLI availability
 */
export class WorkerHealthProjection {
  private readonly workers = new Map<string, WorkerHealthRecord>();
  private _dockerAvailable = true;

  /** The restart threshold exposed to the API consumer. */
  get restartThreshold(): number {
    return RESTART_THRESHOLD;
  }

  /** Whether docker CLI was reachable on the last poll attempt. */
  get dockerAvailable(): boolean {
    return this._dockerAvailable;
  }

  /**
   * Ingest a fresh poll result for a container.
   * Replaces any existing record for the same container name.
   */
  ingest(record: WorkerHealthRecord): void {
    this.workers.set(record.name, record);
  }

  /**
   * Replace the entire worker set atomically.
   * Removes workers no longer present (container was removed).
   */
  replaceAll(records: WorkerHealthRecord[]): void {
    this.workers.clear();
    for (const record of records) {
      this.workers.set(record.name, record);
    }
  }

  /**
   * Update docker availability flag.
   */
  setDockerAvailable(available: boolean): void {
    this._dockerAvailable = available;
  }

  /**
   * Retrieve all worker health records, sorted by name for deterministic rendering.
   */
  getAll(): WorkerHealthRecord[] {
    return [...this.workers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Aggregate summary counts for the dashboard header.
   */
  getSummary(): WorkerHealthSummary {
    const all = this.getAll();
    let healthy = 0;
    let restarting = 0;
    let down = 0;

    for (const w of all) {
      if (w.restartCount > RESTART_THRESHOLD) {
        restarting++;
      } else if (w.status === 'running') {
        healthy++;
      } else {
        down++;
      }
    }

    return {
      total: all.length,
      healthy,
      restarting,
      down,
    };
  }
}

/** Singleton projection instance used by the poller and API route. */
export const workerHealthProjection = new WorkerHealthProjection();
