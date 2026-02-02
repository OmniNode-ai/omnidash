/**
 * Playback Events Module
 *
 * Provides a typed EventEmitter for playback WebSocket events.
 * Used by playback-routes.ts to emit events that websocket.ts broadcasts.
 *
 * This follows the same pattern as intent-events.ts and registry-events.ts.
 */

import { EventEmitter } from 'events';
import type { PlaybackWSMessage } from '@shared/schemas/playback-config';

/**
 * Event emitter for playback-related events.
 * Websocket.ts listens to these events and broadcasts to connected clients.
 */
class PlaybackEventEmitter extends EventEmitter {}

export const playbackEventEmitter = new PlaybackEventEmitter();

/**
 * Emit a playback WebSocket message.
 * Called by playback-routes.ts when playback lifecycle events occur.
 *
 * @param message - The typed PlaybackWSMessage to broadcast
 */
export function emitPlaybackEvent(message: PlaybackWSMessage): void {
  playbackEventEmitter.emit('playback', message);
}

export type { PlaybackWSMessage };
