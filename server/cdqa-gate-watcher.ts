/**
 * CDQA Gate File Watcher (OMN-3190)
 *
 * Polls ~/.claude/skill-results/*\/cdqa-gate-log.json on a configurable interval
 * and feeds gate records into the CdqaGateProjection singleton.
 *
 * cdqa-gate-log.json shape (array or single object):
 *   [{ gate, pr_number, repo, result: 'PASS'|'WARN'|'BLOCK', timestamp }]
 *   OR
 *   { gate, pr_number, repo, result, timestamp }
 *
 * Kafka-backed projection is a follow-up ticket (OMN-3190 data source note).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cdqaGateProjection, type CdqaGateRecord } from './projections/cdqa-gate-projection';

// ============================================================================
// Constants
// ============================================================================

/** Root directory for skill result JSON files. */
const SKILL_RESULTS_ROOT = path.join(os.homedir(), '.claude', 'skill-results');

/** Filename pattern to look for in each skill-results subdirectory. */
const LOG_FILENAME = 'cdqa-gate-log.json';

/** Poll interval in milliseconds. */
const POLL_INTERVAL_MS = 15_000;

// ============================================================================
// Watcher state
// ============================================================================

/** Tracks which files have already been ingested to avoid re-processing. */
const ingestedFiles = new Set<string>();

// ============================================================================
// Poll logic
// ============================================================================

/**
 * Scan ~/.claude/skill-results for cdqa-gate-log.json files and ingest
 * any that have not yet been processed.
 *
 * Runs silently — errors are caught and logged without crashing the server.
 */
function pollSkillResults(): void {
  if (!fs.existsSync(SKILL_RESULTS_ROOT)) return;

  let entries: string[];
  try {
    entries = fs.readdirSync(SKILL_RESULTS_ROOT);
  } catch {
    return;
  }

  for (const entry of entries) {
    const logPath = path.join(SKILL_RESULTS_ROOT, entry, LOG_FILENAME);
    if (ingestedFiles.has(logPath)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(logPath);
    } catch {
      continue; // file doesn't exist in this subdirectory
    }
    if (!stat.isFile()) continue;

    try {
      const raw = fs.readFileSync(logPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      const records: CdqaGateRecord[] = Array.isArray(parsed)
        ? (parsed as CdqaGateRecord[])
        : [parsed as CdqaGateRecord];

      for (const record of records) {
        if (isValidGateRecord(record)) {
          cdqaGateProjection.handle(record);
        }
      }

      ingestedFiles.add(logPath);
      console.log(`[cdqa-gate-watcher] Ingested ${records.length} record(s) from ${logPath}`);
    } catch (err) {
      console.error(`[cdqa-gate-watcher] Failed to process ${logPath}:`, err);
    }
  }
}

// ============================================================================
// Validation
// ============================================================================

function isValidGateRecord(record: unknown): record is CdqaGateRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.gate === 'string' &&
    typeof r.pr_number === 'number' &&
    typeof r.repo === 'string' &&
    (r.result === 'PASS' || r.result === 'WARN' || r.result === 'BLOCK') &&
    typeof r.timestamp === 'string'
  );
}

// ============================================================================
// Lifecycle
// ============================================================================

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the CDQA gate file watcher.
 * Performs an immediate poll on start, then polls every POLL_INTERVAL_MS.
 *
 * Idempotent — calling start() when already running is a no-op.
 */
export function startCdqaGateWatcher(): void {
  if (intervalHandle !== null) return;

  console.log(
    `[cdqa-gate-watcher] Starting — polling ${SKILL_RESULTS_ROOT} every ${POLL_INTERVAL_MS}ms`
  );

  // Immediate first poll
  pollSkillResults();

  intervalHandle = setInterval(pollSkillResults, POLL_INTERVAL_MS);
}

/**
 * Stop the CDQA gate file watcher.
 */
export function stopCdqaGateWatcher(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[cdqa-gate-watcher] Stopped');
  }
}
