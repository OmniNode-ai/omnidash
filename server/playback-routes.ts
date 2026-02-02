/**
 * Playback API Routes
 *
 * REST API for controlling event playback from the dashboard.
 */

import path from 'path';
import { Router, Request, Response } from 'express';
import { getPlaybackService, playbackLogger } from './event-playback';
import { getEventConsumer } from './event-consumer';
import { PLAYBACK_CONFIG, isValidSpeed } from '@shared/schemas/playback-config';

const router = Router();
const playback = getPlaybackService();

// Track current playback event handler to enable targeted cleanup
// (avoids removing other listeners with removeAllListeners)
let currentEventHandler: ((event: unknown) => void) | null = null;

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
  try {
    const { file, speed = 1, loop = false } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: file',
      });
    }

    // Resolve file path
    const filePath =
      file.startsWith('/') || file.startsWith('.') ? file : `demo/recordings/${file}`;

    // Path traversal protection: ensure file is within allowed directory
    const recordingsDir = path.resolve('demo/recordings');
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(recordingsDir + path.sep)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file path: must be within demo/recordings directory',
      });
    }

    // Wire up playback events to the EventConsumer
    const eventConsumer = getEventConsumer();

    // Reset state for clean demo experience
    if (eventConsumer) {
      eventConsumer.resetState();
    }

    // Remove only our previous handler to avoid duplicates
    // (using targeted removal instead of removeAllListeners to preserve other listeners)
    if (currentEventHandler) {
      playback.off('event', currentEventHandler);
      currentEventHandler = null;
    }

    // Forward ALL playback events through EventConsumer's injection method
    // This ensures events flow through the same handlers as live Kafka events
    if (eventConsumer) {
      currentEventHandler = (recordedEvent) => {
        // Inject into EventConsumer using the same pipeline as live events
        const event = recordedEvent as { topic: string; value: unknown };
        eventConsumer.injectPlaybackEvent(event.topic, event.value as Record<string, unknown>);
      };
      playback.on('event', currentEventHandler);
    }

    await playback.startPlayback(filePath, {
      speed,
      loop,
      onComplete: () => {
        // Clean up handler when playback finishes naturally
        if (currentEventHandler) {
          playback.off('event', currentEventHandler);
          currentEventHandler = null;
        }
      },
      onEvent: (_event) => {
        // Log progress every 10 events
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
 * Stop playback
 */
router.post('/stop', (_req: Request, res: Response) => {
  // Clean up event handler to prevent stale handler on next start
  if (currentEventHandler) {
    playback.off('event', currentEventHandler);
    currentEventHandler = null;
  }

  playback.stopPlayback();
  res.json({
    success: true,
    message: 'Playback stopped',
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

  if (typeof speed !== 'number' || !isValidSpeed(speed)) {
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

export default router;
