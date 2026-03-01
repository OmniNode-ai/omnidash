/**
 * Pipeline Health File Watcher (OMN-3192)
 *
 * Polls ~/.claude/pipelines/{ticket_id}/state.yaml on a configurable interval
 * and feeds pipeline events into the PipelineHealthProjection singleton.
 *
 * state.yaml shape (subset used here):
 *   ticket_id: OMN-1234
 *   current_phase: implement
 *   phases:
 *     implement:
 *       status: in_progress | completed | blocked
 *       started_at: ISO string
 *       completed_at: ISO string (optional)
 *     ...
 *
 * Kafka-backed projection is a follow-up ticket.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  pipelineHealthProjection,
  type PipelineEvent,
} from './projections/pipeline-health-projection';

// ============================================================================
// Constants
// ============================================================================

/** Root directory for pipeline state files. */
const PIPELINES_ROOT = path.join(os.homedir(), '.claude', 'pipelines');

/** Filename to look for in each pipeline subdirectory. */
const STATE_FILENAME = 'state.yaml';

/** Poll interval in milliseconds. */
const POLL_INTERVAL_MS = 15_000;

// ============================================================================
// Watcher state
// ============================================================================

/** Tracks last-seen mtime per state file to detect changes. */
const lastMtimeMs = new Map<string, number>();

// ============================================================================
// Poll logic
// ============================================================================

/**
 * Scan ~/.claude/pipelines for state.yaml files and ingest
 * any that have been updated since last poll.
 */
function pollPipelineStates(): void {
  if (!fs.existsSync(PIPELINES_ROOT)) return;

  let entries: string[];
  try {
    entries = fs.readdirSync(PIPELINES_ROOT);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip the ledger.json file itself
    if (entry === 'ledger.json') continue;

    const statePath = path.join(PIPELINES_ROOT, entry, STATE_FILENAME);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(statePath);
    } catch {
      continue; // not a pipeline directory or state file missing
    }
    if (!stat.isFile()) continue;

    const mtimeMs = stat.mtimeMs;
    const lastSeen = lastMtimeMs.get(statePath);

    if (lastSeen !== undefined && lastSeen === mtimeMs) continue; // not changed

    lastMtimeMs.set(statePath, mtimeMs);

    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const event = parseStateYaml(raw, entry);
      if (event) {
        pipelineHealthProjection.handle(event);
        console.log(
          `[pipeline-health-watcher] Updated pipeline for ${event.ticket_id} (phase: ${event.phase})`
        );
      }
    } catch (err) {
      console.error(`[pipeline-health-watcher] Failed to process ${statePath}:`, err);
    }
  }
}

// ============================================================================
// YAML parsing (minimal — avoids adding a YAML dep)
// ============================================================================

/**
 * Minimal YAML key extractor for known pipeline state.yaml fields.
 * Parses only the top-level scalar fields we need; does not handle
 * full YAML nesting. This is intentionally lightweight — the state
 * files are machine-written and have a stable, known format.
 */
function parseStateYaml(raw: string, ticketId: string): PipelineEvent | null {
  const lines = raw.split('\n');

  const get = (key: string): string | null => {
    for (const line of lines) {
      const m = line.match(new RegExp(`^${key}:\\s*(.+)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
    return null;
  };

  const currentPhase = get('current_phase');
  const repo = get('repo');
  const status = get('status') as PipelineEvent['status'] | null;
  const startedAt = get('started_at');

  if (!currentPhase || !repo) return null;

  // Determine effective status from current_phase
  const normalizedStatus = normalizeStatus(status);

  // Extract timestamp: prefer started_at, fall back to now
  const timestamp = startedAt ?? new Date().toISOString();

  return {
    ticket_id: ticketId,
    repo,
    phase: currentPhase,
    status: normalizedStatus,
    timestamp,
  };
}

function normalizeStatus(raw: string | null): PipelineEvent['status'] {
  switch (raw) {
    case 'done':
    case 'merged':
    case 'failed':
      return raw;
    case 'blocked':
    case 'held_conflict':
    case 'held':
      return 'blocked';
    default:
      return 'running';
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the pipeline health file watcher.
 * Performs an immediate poll on start, then polls every POLL_INTERVAL_MS.
 *
 * Idempotent — calling start() when already running is a no-op.
 */
export function startPipelineHealthWatcher(): void {
  if (intervalHandle !== null) return;

  console.log(
    `[pipeline-health-watcher] Starting — polling ${PIPELINES_ROOT} every ${POLL_INTERVAL_MS}ms`
  );

  // Immediate first poll
  pollPipelineStates();

  intervalHandle = setInterval(pollPipelineStates, POLL_INTERVAL_MS);
}

/**
 * Stop the pipeline health file watcher.
 */
export function stopPipelineHealthWatcher(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[pipeline-health-watcher] Stopped');
  }
}
