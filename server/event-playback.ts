/**
 * Event Playback Service
 *
 * Replays recorded events from JSONL files for demos.
 * Integrates with the existing EventConsumer by emitting to its EventEmitter.
 *
 * Usage:
 *   - Call startPlayback() with a recording file path
 *   - Events are replayed with original timing (or accelerated)
 *   - Dashboard components receive events as if they came from Kafka
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Logger for playback module - matches EventConsumer pattern
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const currentLogLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.info;

export const playbackLogger = {
  debug: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.log(`[Playback:debug] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.log(`[Playback] ${message}`);
    }
  },
  warn: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn(`[Playback:warn] ${message}`);
    }
  },
  error: (message: string, error?: unknown) => {
    // Errors always log regardless of level
    console.error(`[Playback:error] ${message}`, error ?? '');
  },
};

export interface RecordedEvent {
  timestamp: string;
  relativeMs: number;
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: unknown;
}

export interface PlaybackOptions {
  /** Speed multiplier (1 = real-time, 2 = 2x speed, 0 = instant) */
  speed?: number;
  /** Loop playback continuously */
  loop?: boolean;
  /** Filter to specific topics */
  topics?: string[];
  /** Callback when playback completes */
  onComplete?: () => void;
  /** Callback for each event */
  onEvent?: (event: RecordedEvent) => void;
}

export class EventPlaybackService extends EventEmitter {
  private isPlaying = false;
  private isPaused = false;
  private currentTimeout: NodeJS.Timeout | null = null;
  private currentImmediate: NodeJS.Immediate | null = null;
  private events: RecordedEvent[] = [];
  private currentIndex = 0;
  private options: PlaybackOptions = {};
  private recordingFile: string = '';

  constructor() {
    super();
  }

  /**
   * Load a recording file
   */
  loadRecording(filePath: string): RecordedEvent[] {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Recording file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    this.events = lines
      .map((line, index) => {
        try {
          return JSON.parse(line) as RecordedEvent;
        } catch (e) {
          playbackLogger.warn(`Failed to parse line ${index + 1}: ${e}`);
          return null;
        }
      })
      .filter((e): e is RecordedEvent => e !== null);

    this.recordingFile = absolutePath;
    playbackLogger.info(`Loaded ${this.events.length} events from ${path.basename(filePath)}`);

    return this.events;
  }

  /**
   * List available recordings in the demo/recordings directory
   */
  listRecordings(): { name: string; path: string; size: number; eventCount?: number }[] {
    const recordingsDir = path.resolve('demo/recordings');

    if (!fs.existsSync(recordingsDir)) {
      return [];
    }

    return fs
      .readdirSync(recordingsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const fullPath = path.join(recordingsDir, f);
        const stats = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const eventCount = content.trim().split('\n').filter(Boolean).length;

        return {
          name: f,
          path: fullPath,
          size: stats.size,
          eventCount,
        };
      })
      .sort((a, b) => b.size - a.size);
  }

  /**
   * Start playback
   */
  async startPlayback(filePath: string, options: PlaybackOptions = {}): Promise<void> {
    if (this.isPlaying) {
      playbackLogger.info('Already playing, stopping current playback...');
      this.stopPlayback();
    }

    this.loadRecording(filePath);
    this.options = {
      speed: 1,
      loop: false,
      ...options,
    };
    this.currentIndex = 0;
    this.isPlaying = true;
    this.isPaused = false;

    playbackLogger.info(`Starting playback at ${this.options.speed}x speed`);
    this.emit('playbackStart', { file: this.recordingFile, eventCount: this.events.length });

    await this.playNextEvent();
  }

  /**
   * Play the next event in sequence
   */
  private async playNextEvent(): Promise<void> {
    if (!this.isPlaying || this.isPaused) return;

    if (this.currentIndex >= this.events.length) {
      if (this.options.loop) {
        playbackLogger.info('Looping...');
        this.currentIndex = 0;
        this.emit('playbackLoop');
      } else {
        this.stopPlayback();
        this.options.onComplete?.();
        return;
      }
    }

    const event = this.events[this.currentIndex];
    const nextEvent = this.events[this.currentIndex + 1];

    // Filter by topics if specified
    if (this.options.topics && !this.options.topics.includes(event.topic)) {
      this.currentIndex++;
      this.currentImmediate = setImmediate(() => this.playNextEvent());
      return;
    }

    // Emit the event
    this.emitEvent(event);
    this.options.onEvent?.(event);

    this.currentIndex++;

    // Schedule next event
    if (nextEvent && this.options.speed !== 0) {
      const delay = (nextEvent.relativeMs - event.relativeMs) / (this.options.speed || 1);
      this.currentTimeout = setTimeout(() => this.playNextEvent(), Math.max(0, delay));
    } else {
      // Instant mode or last event
      // Yield to event loop every 50 events to prevent CPU blocking
      if (this.options.speed === 0 && this.currentIndex % 50 === 0) {
        this.currentTimeout = setTimeout(() => this.playNextEvent(), 0);
      } else {
        this.currentImmediate = setImmediate(() => this.playNextEvent());
      }
    }
  }

  /**
   * Emit an event to the appropriate handler based on topic
   */
  private emitEvent(event: RecordedEvent): void {
    // Emit generic event
    this.emit('event', event);

    // Emit topic-specific events that match EventConsumer patterns
    const value = event.value as Record<string, unknown>;

    switch (event.topic) {
      case 'agent-routing-decisions':
        this.emit('routingDecision', value);
        break;
      case 'agent-actions':
        this.emit('action', value);
        break;
      case 'agent-transformation-events':
        this.emit('transformation', value);
        break;
      case 'router-performance-metrics':
        this.emit('performanceMetric', value);
        break;
      case 'dev.onex.evt.omniclaude.prompt-submitted.v1':
        this.emit('promptSubmitted', value);
        break;
      case 'dev.onex.evt.omniclaude.session-started.v1':
        this.emit('sessionStarted', value);
        break;
      case 'dev.onex.evt.omniclaude.session-ended.v1':
        this.emit('sessionEnded', value);
        break;
      case 'dev.onex.evt.omniclaude.tool-executed.v1':
        this.emit('toolExecuted', value);
        break;
      case 'dev.onex.evt.omniintelligence.intent-classified.v1':
        this.emit('intentClassified', value);
        break;
      default:
        this.emit('unknownTopic', event);
    }
  }

  /**
   * Pause playback
   */
  pausePlayback(): void {
    if (!this.isPlaying) return;

    this.isPaused = true;
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.currentImmediate) {
      clearImmediate(this.currentImmediate);
      this.currentImmediate = null;
    }

    playbackLogger.info(`Paused at event ${this.currentIndex}/${this.events.length}`);
    this.emit('playbackPause');
  }

  /**
   * Resume playback
   */
  resumePlayback(): void {
    if (!this.isPlaying || !this.isPaused) return;

    this.isPaused = false;
    playbackLogger.info('Resumed');
    this.emit('playbackResume');
    this.playNextEvent();
  }

  /**
   * Stop playback
   */
  stopPlayback(): void {
    this.isPlaying = false;
    this.isPaused = false;

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.currentImmediate) {
      clearImmediate(this.currentImmediate);
      this.currentImmediate = null;
    }

    playbackLogger.info('Stopped');
    this.emit('playbackStop');
  }

  /**
   * Get playback status
   */
  getStatus(): {
    isPlaying: boolean;
    isPaused: boolean;
    currentIndex: number;
    totalEvents: number;
    progress: number;
    recordingFile: string;
  } {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalEvents: this.events.length,
      progress: this.events.length > 0 ? (this.currentIndex / this.events.length) * 100 : 0,
      recordingFile: this.recordingFile,
    };
  }

  /**
   * Set playback speed
   * If currently playing, reschedules the next event with the new speed
   */
  setSpeed(speed: number): void {
    this.options.speed = speed;
    playbackLogger.info(`Speed set to ${speed}x`);
    this.emit('speedChange', speed);

    // If actively playing (not paused), reschedule with new speed
    if (this.isPlaying && !this.isPaused) {
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
        this.currentTimeout = null;
      }
      if (this.currentImmediate) {
        clearImmediate(this.currentImmediate);
        this.currentImmediate = null;
      }
      // Schedule next event with new speed
      this.playNextEvent();
    }
  }

  /**
   * Set loop mode
   * Can be toggled during playback
   */
  setLoop(loop: boolean): void {
    this.options.loop = loop;
    playbackLogger.info(`Loop ${loop ? 'enabled' : 'disabled'}`);
    this.emit('loopChange', loop);
  }
}

// Singleton instance for server-wide use
let playbackInstance: EventPlaybackService | null = null;

export function getPlaybackService(): EventPlaybackService {
  if (!playbackInstance) {
    playbackInstance = new EventPlaybackService();
  }
  return playbackInstance;
}
