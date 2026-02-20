/**
 * Playback API Routes
 *
 * REST API for controlling event playback from the dashboard.
 * Broadcasts playback lifecycle events to WebSocket clients via playbackEventEmitter.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { Router, Request, Response } from 'express';
import { getPlaybackService, playbackLogger } from './event-playback';
import { getEventConsumer } from './event-consumer';
import { getPlaybackDataSource } from './playback-data-source';
import {
  PLAYBACK_CONFIG,
  isValidSpeed,
  type PlaybackStatus,
} from '@shared/schemas/playback-config';
import { emitPlaybackEvent } from './playback-events';

const router = Router();
const playback = getPlaybackService();

// Track current playback event handler to enable targeted cleanup
// (avoids removing other listeners with removeAllListeners)
let currentEventHandler: ((event: unknown) => void) | null = null;

// Track current lifecycle handlers for cleanup
let lifecycleHandlersRegistered = false;

// Mutex flag to prevent race condition when concurrent /start requests arrive
// Without this, two simultaneous requests could both create event handlers
let isStartingPlayback = false;

// Progress throttling state
let lastProgressBroadcast = 0;
let eventsSinceLastBroadcast = 0;
const PROGRESS_THROTTLE_MS = 100;
const PROGRESS_THROTTLE_EVENTS = 10;

/**
 * Get current playback status in the WebSocket message format.
 * Adds the required 'success' field to the base status.
 */
function getPlaybackStatusForWS(): PlaybackStatus {
  return {
    success: true,
    ...playback.getStatus(),
  };
}

/**
 * Broadcast a progress update, respecting throttle limits.
 * Only broadcasts if: >= PROGRESS_THROTTLE_EVENTS since last broadcast
 * OR >= PROGRESS_THROTTLE_MS milliseconds since last broadcast.
 *
 * @param force - If true, bypass throttling and always broadcast
 */
function broadcastProgress(force = false): void {
  const now = Date.now();
  eventsSinceLastBroadcast++;

  const shouldBroadcast =
    force ||
    eventsSinceLastBroadcast >= PROGRESS_THROTTLE_EVENTS ||
    now - lastProgressBroadcast >= PROGRESS_THROTTLE_MS;

  if (shouldBroadcast) {
    emitPlaybackEvent({
      type: 'playback:progress',
      status: getPlaybackStatusForWS(),
    });
    lastProgressBroadcast = now;
    eventsSinceLastBroadcast = 0;
  }
}

/**
 * Register lifecycle event handlers on the playback service.
 * These handlers broadcast state changes to WebSocket clients.
 * Only registers once - handlers persist for server lifetime.
 */
function registerLifecycleHandlers(): void {
  if (lifecycleHandlersRegistered) return;

  playback.on('playbackStart', () => {
    // Reset throttle state on new playback
    lastProgressBroadcast = Date.now();
    eventsSinceLastBroadcast = 0;

    emitPlaybackEvent({
      type: 'playback:start',
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('playbackPause', () => {
    emitPlaybackEvent({
      type: 'playback:pause',
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('playbackResume', () => {
    emitPlaybackEvent({
      type: 'playback:resume',
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('playbackStop', () => {
    emitPlaybackEvent({
      type: 'playback:stop',
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('playbackLoop', () => {
    // Reset throttle state when looping restarts
    lastProgressBroadcast = Date.now();
    eventsSinceLastBroadcast = 0;

    emitPlaybackEvent({
      type: 'playback:loop',
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('speedChange', (speed: number) => {
    emitPlaybackEvent({
      type: 'playback:speedChange',
      speed,
      status: getPlaybackStatusForWS(),
    });
  });

  playback.on('loopChange', (loop: boolean) => {
    emitPlaybackEvent({
      type: 'playback:loopChange',
      loop,
      status: getPlaybackStatusForWS(),
    });
  });

  lifecycleHandlersRegistered = true;
  playbackLogger.info('Playback lifecycle handlers registered for WebSocket broadcasting');
}

// Register lifecycle handlers on module load
registerLifecycleHandlers();

/**
 * GET /api/demo/recordings
 * List available recording files
 */
router.get('/recordings', (_req: Request, res: Response) => {
  try {
    const recordings = playback.listRecordings();
    res.json({
      success: true,
      recordings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/demo/status
 * Get current playback status
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    ...playback.getStatus(),
  });
});

/**
 * POST /api/demo/start
 * Start playback of a recording
 *
 * Body:
 *   - file: string (recording file name or path)
 *   - speed?: number (playback speed multiplier, default 1)
 *   - loop?: boolean (loop continuously, default false)
 */
router.post('/start', async (req: Request, res: Response) => {
  // Prevent race condition: block concurrent /start requests
  // Without this mutex, two simultaneous requests could both create event handlers
  if (isStartingPlayback) {
    return res.status(409).json({
      success: false,
      error: 'Playback start already in progress. Please wait and try again.',
    });
  }

  isStartingPlayback = true;
  try {
    const { file, speed = 1, loop = false } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: file',
      });
    }

    // Validate speed type and value
    if (typeof speed !== 'number' || !Number.isFinite(speed)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid speed value: must be a finite number',
      });
    }

    if (!isValidSpeed(speed)) {
      return res.status(400).json({
        success: false,
        error: `Invalid speed value. Must be ${PLAYBACK_CONFIG.INSTANT_SPEED} (instant) or between ${PLAYBACK_CONFIG.MIN_SPEED} and ${PLAYBACK_CONFIG.MAX_SPEED}`,
      });
    }

    // Validate loop type
    if (typeof loop !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Invalid loop value: must be a boolean',
      });
    }

    // Path traversal protection: always resolve relative to recordings directory.
    // Anchored to this module's location (not process.cwd()) so the path is
    // correct regardless of which directory the server process is started from.
    // SECURITY: Never trust user input for path construction
    //
    // Path is correct in both dev (server/playback-routes.ts → ../demo/recordings)
    // and prod (dist/index.js → ../demo/recordings) since both resolve to
    // <repo-root>/demo/recordings. The `..` is intentional, not coincidental.
    //
    // ESM REQUIREMENT: This file is ESM-only. The build pipeline (esbuild with
    // --format=esm, see package.json "build:server" script) always produces native
    // ESM output, so `import.meta.url` is guaranteed to be defined at runtime under
    // normal operation. Do NOT convert the build output to CJS; doing so would make
    // `import.meta.url` undefined and break path resolution here.
    //
    // Defensive fallback: if `import.meta.url` is somehow undefined (e.g. an
    // unexpected CJS wrapper, a test runner that evaluates the file outside ESM
    // context, or a future build change), fall back to `process.cwd()` so the
    // server does not crash at this point.
    // The fallback path intentionally disables demo playback — all requests will
    // fail the containment check and return 403. This is by design: if
    // import.meta.url is not available, the module path cannot be trusted, so
    // serving any files would be unsafe.
    const moduleDir =
      typeof import.meta.url === 'string'
        ? path.dirname(fileURLToPath(import.meta.url))
        : (() => {
            console.error(
              '[playback-routes] import.meta.url is undefined — ESM requirement violated. ' +
                'Falling back to process.cwd() for path resolution; recordings directory may be incorrect. ' +
                'Ensure the server is built and run as ESM (esbuild --format=esm).'
            );
            return process.cwd();
          })();
    const recordingsDir = path.resolve(moduleDir, '../demo/recordings');

    // Reject absolute paths and explicit path traversal attempts
    if (typeof file !== 'string' || file.includes('..') || file.includes('\x00') || path.isAbsolute(file)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: invalid file path',
      });
    }

    // Construct path within recordings directory only
    const resolvedPath = path.resolve(recordingsDir, file);

    // Double-check the resolved path stays within the recordings directory
    // This catches edge cases like symlinks or encoded characters
    if (!resolvedPath.startsWith(recordingsDir + path.sep) && resolvedPath !== recordingsDir) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: path traversal detected',
      });
    }

    const filePath = resolvedPath;

    // Wire up playback events to the EventConsumer
    const eventConsumer = getEventConsumer();

    // Snapshot current live data, then reset for clean demo experience
    if (eventConsumer) {
      // Only snapshot if there isn't already one (prevents overwriting during rapid restarts)
      if (!eventConsumer.hasStateSnapshot()) {
        eventConsumer.snapshotState();
      }
      eventConsumer.resetState();
    }

    // Remove only our previous handler to avoid duplicates
    // (using targeted removal instead of removeAllListeners to preserve other listeners)
    if (currentEventHandler) {
      playback.off('event', currentEventHandler);
      currentEventHandler = null;
    }

    // Get playback data source (demo playback only — not a Kafka replacement)
    const playbackDataSource = getPlaybackDataSource();

    // Forward ALL playback events through PlaybackDataSource for WebSocket broadcast
    // Note: this is for demo/recording replay only. Live operation requires Kafka.
    currentEventHandler = (recordedEvent) => {
      const event = recordedEvent as { topic: string; value: unknown };
      // Use PlaybackDataSource for direct WebSocket broadcast
      playbackDataSource.injectPlaybackEvent(event.topic, event.value as Record<string, unknown>);
      // Broadcast throttled progress updates via WebSocket
      broadcastProgress();
    };
    playback.on('event', currentEventHandler);

    await playback.startPlayback(filePath, {
      speed,
      loop,
      onComplete: () => {
        // Clean up handler when playback finishes naturally
        if (currentEventHandler) {
          playback.off('event', currentEventHandler);
          currentEventHandler = null;
        }
        // Force a final progress broadcast to ensure 100% is reported
        broadcastProgress(true);

        // DO NOT auto-restore: keep demo data visible until user manually clicks Stop
        // User expectation: demo finishes → data stays → user clicks Stop to return to live
        playbackLogger.info(
          'Demo playback completed, waiting for manual stop to restore live data'
        );
      },
      onEvent: (_event) => {
        // Log progress every 10 events (for server-side debugging)
        const status = playback.getStatus();
        if (status.currentIndex % 10 === 0) {
          playbackLogger.debug(`Progress: ${status.currentIndex}/${status.totalEvents}`);
        }
      },
    });

    res.json({
      success: true,
      message: 'Playback started',
      ...playback.getStatus(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    isStartingPlayback = false;
  }
});

/**
 * POST /api/demo/pause
 * Pause current playback
 */
router.post('/pause', (_req: Request, res: Response) => {
  playback.pausePlayback();
  res.json({
    success: true,
    message: 'Playback paused',
    ...playback.getStatus(),
  });
});

/**
 * POST /api/demo/resume
 * Resume paused playback
 */
router.post('/resume', (_req: Request, res: Response) => {
  playback.resumePlayback();
  res.json({
    success: true,
    message: 'Playback resumed',
    ...playback.getStatus(),
  });
});

/**
 * POST /api/demo/stop
 * Stop playback and restore live data from snapshot
 */
router.post('/stop', (_req: Request, res: Response) => {
  // Clean up event handler to prevent stale handler on next start
  if (currentEventHandler) {
    playback.off('event', currentEventHandler);
    currentEventHandler = null;
  }

  playback.stopPlayback();

  // Restore live data from snapshot taken before demo started
  const eventConsumer = getEventConsumer();
  let stateRestored = false;
  if (eventConsumer) {
    stateRestored = eventConsumer.restoreState();
  }

  res.json({
    success: true,
    message: stateRestored ? 'Playback stopped, live data restored' : 'Playback stopped',
    stateRestored,
    ...playback.getStatus(),
  });
});

/**
 * POST /api/demo/speed
 * Change playback speed
 *
 * Body:
 *   - speed: number (multiplier, e.g., 0.5, 1, 2, 5)
 */
router.post('/speed', (req: Request, res: Response) => {
  const { speed } = req.body;

  // Reject non-finite values (NaN, Infinity, -Infinity)
  if (typeof speed !== 'number' || !Number.isFinite(speed)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid speed value: must be a finite number',
    });
  }

  if (!isValidSpeed(speed)) {
    return res.status(400).json({
      success: false,
      error: `Invalid speed value. Must be ${PLAYBACK_CONFIG.INSTANT_SPEED} (instant) or between ${PLAYBACK_CONFIG.MIN_SPEED} and ${PLAYBACK_CONFIG.MAX_SPEED}`,
    });
  }

  playback.setSpeed(speed);
  res.json({
    success: true,
    message: `Speed set to ${speed}x`,
    ...playback.getStatus(),
  });
});

/**
 * POST /api/demo/loop
 * Toggle loop mode during playback
 *
 * Body:
 *   - loop: boolean (enable/disable loop)
 */
router.post('/loop', (req: Request, res: Response) => {
  const { loop } = req.body;

  if (typeof loop !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'Invalid loop value. Must be a boolean',
    });
  }

  playback.setLoop(loop);
  res.json({
    success: true,
    message: `Loop ${loop ? 'enabled' : 'disabled'}`,
    ...playback.getStatus(),
  });
});

/**
 * Cleanup function for server shutdown
 * Removes event handlers and stops playback to prevent orphaned resources
 */
export function cleanupPlaybackRoutes(): void {
  if (currentEventHandler) {
    playback.off('event', currentEventHandler);
    currentEventHandler = null;
  }
  playback.stopPlayback();
}

export default router;
