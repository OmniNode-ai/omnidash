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

// Speed validation helper
export function isValidSpeed(speed: number): boolean {
  // 0 is special "instant" value, otherwise must be within bounds
  return (
    speed === PLAYBACK_CONFIG.INSTANT_SPEED ||
    (speed >= PLAYBACK_CONFIG.MIN_SPEED && speed <= PLAYBACK_CONFIG.MAX_SPEED)
  );
}
