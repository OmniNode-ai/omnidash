import { z } from 'zod';

// Playback configuration constants - single source of truth
export const PLAYBACK_CONFIG = {
  /** Maximum allowed playback speed multiplier */
  MAX_SPEED: 100,
  /** Default playback speed */
  DEFAULT_SPEED: 1,
  /** Speed value representing instant playback */
  INSTANT_SPEED: 0,
  /** Minimum speed (for validation) */
  MIN_SPEED: 0,
} as const;

// Speed option type for UI
export const SpeedOptionSchema = z.object({
  value: z.number(),
  label: z.string(),
});
export type SpeedOption = z.infer<typeof SpeedOptionSchema>;

// Predefined speed options for UI controls
export const SPEED_OPTIONS: SpeedOption[] = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
  { value: PLAYBACK_CONFIG.INSTANT_SPEED, label: 'Instant' },
];

// Playback options schema (for API requests)
export const PlaybackOptionsSchema = z.object({
  file: z.string().min(1),
  speed: z
    .number()
    .min(PLAYBACK_CONFIG.MIN_SPEED)
    .max(PLAYBACK_CONFIG.MAX_SPEED)
    .default(PLAYBACK_CONFIG.DEFAULT_SPEED),
  loop: z.boolean().default(false),
});
export type PlaybackOptions = z.infer<typeof PlaybackOptionsSchema>;

// Playback status schema (for API responses)
export const PlaybackStatusSchema = z.object({
  success: z.boolean(),
  isPlaying: z.boolean(),
  isPaused: z.boolean(),
  currentIndex: z.number(),
  totalEvents: z.number(),
  progress: z.number().min(0).max(100),
  recordingFile: z.string(),
});
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

// Recording info schema
export const RecordingSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  eventCount: z.number(),
});
export type Recording = z.infer<typeof RecordingSchema>;

/**
 * Validates playback speed value.
 *
 * Valid values:
 * - 0: Instant mode (process all events immediately)
 * - 0.1-100: Speed multiplier (0.5x, 1x, 2x, etc.)
 *
 * The explicit INSTANT_SPEED check (speed === 0) is semantically important:
 * - Speed of 0 triggers "instant mode" which bypasses delay calculations entirely
 * - Playback timing uses `delay / speed`, so speed=0 requires special handling
 *   to avoid division issues and achieve the "process all at once" behavior
 * - This distinguishes 0 as a special mode, not just the minimum of a range
 *
 * @param speed - The playback speed value to validate
 * @returns true if speed is valid, false otherwise
 */
export function isValidSpeed(speed: number): boolean {
  return (
    speed === PLAYBACK_CONFIG.INSTANT_SPEED ||
    (speed >= PLAYBACK_CONFIG.MIN_SPEED && speed <= PLAYBACK_CONFIG.MAX_SPEED)
  );
}

// ============================================================================
// WebSocket Message Types for Playback Status Updates
// ============================================================================

/**
 * WebSocket message types for playback events.
 * Each message includes the full PlaybackStatus for consistency,
 * allowing clients to update their state from any message.
 */

// Base message with status (all messages include this)
const PlaybackWSBaseSchema = z.object({
  status: PlaybackStatusSchema,
});

// Playback started
export const PlaybackWSStartSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:start'),
});
export type PlaybackWSStart = z.infer<typeof PlaybackWSStartSchema>;

// Progress update (emitted for each event processed)
export const PlaybackWSProgressSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:progress'),
});
export type PlaybackWSProgress = z.infer<typeof PlaybackWSProgressSchema>;

// Playback paused
export const PlaybackWSPauseSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:pause'),
});
export type PlaybackWSPause = z.infer<typeof PlaybackWSPauseSchema>;

// Playback resumed
export const PlaybackWSResumeSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:resume'),
});
export type PlaybackWSResume = z.infer<typeof PlaybackWSResumeSchema>;

// Playback stopped
export const PlaybackWSStopSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:stop'),
});
export type PlaybackWSStop = z.infer<typeof PlaybackWSStopSchema>;

// Loop restarted (playback looped back to beginning)
export const PlaybackWSLoopSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:loop'),
});
export type PlaybackWSLoop = z.infer<typeof PlaybackWSLoopSchema>;

// Speed changed (includes the new speed value)
export const PlaybackWSSpeedChangeSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:speedChange'),
  speed: z.number().min(PLAYBACK_CONFIG.MIN_SPEED).max(PLAYBACK_CONFIG.MAX_SPEED),
});
export type PlaybackWSSpeedChange = z.infer<typeof PlaybackWSSpeedChangeSchema>;

// Loop mode changed (includes the new loop setting)
export const PlaybackWSLoopChangeSchema = PlaybackWSBaseSchema.extend({
  type: z.literal('playback:loopChange'),
  loop: z.boolean(),
});
export type PlaybackWSLoopChange = z.infer<typeof PlaybackWSLoopChangeSchema>;

/**
 * Discriminated union of all playback WebSocket message types.
 * Use this for type-safe message handling:
 *
 * @example
 * ```typescript
 * function handleMessage(msg: PlaybackWSMessage) {
 *   switch (msg.type) {
 *     case 'playback:start':
 *       console.log('Started:', msg.status.recordingFile);
 *       break;
 *     case 'playback:speedChange':
 *       console.log('Speed changed to:', msg.speed);
 *       break;
 *     // ... handle other message types
 *   }
 * }
 * ```
 */
export const PlaybackWSMessageSchema = z.discriminatedUnion('type', [
  PlaybackWSStartSchema,
  PlaybackWSProgressSchema,
  PlaybackWSPauseSchema,
  PlaybackWSResumeSchema,
  PlaybackWSStopSchema,
  PlaybackWSLoopSchema,
  PlaybackWSSpeedChangeSchema,
  PlaybackWSLoopChangeSchema,
]);
export type PlaybackWSMessage = z.infer<typeof PlaybackWSMessageSchema>;

/**
 * All possible playback WebSocket message type strings.
 * Useful for subscription filtering or logging.
 */
export const PLAYBACK_WS_MESSAGE_TYPES = [
  'playback:start',
  'playback:progress',
  'playback:pause',
  'playback:resume',
  'playback:stop',
  'playback:loop',
  'playback:speedChange',
  'playback:loopChange',
] as const;
export type PlaybackWSMessageType = (typeof PLAYBACK_WS_MESSAGE_TYPES)[number];

/**
 * Type guard to check if a value is a valid PlaybackWSMessage.
 * Uses Zod's safeParse for runtime validation.
 *
 * @param value - The value to check
 * @returns true if the value is a valid PlaybackWSMessage
 */
export function isPlaybackWSMessage(value: unknown): value is PlaybackWSMessage {
  return PlaybackWSMessageSchema.safeParse(value).success;
}

/**
 * Parse and validate a WebSocket message.
 * Returns the parsed message or null if invalid.
 *
 * @param value - The value to parse (typically from JSON.parse)
 * @returns The validated PlaybackWSMessage or null
 */
export function parsePlaybackWSMessage(value: unknown): PlaybackWSMessage | null {
  const result = PlaybackWSMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
