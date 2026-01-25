/**
 * Intent Event Emitter for WebSocket broadcasting.
 *
 * Provides a centralized event emitter for intent-related events,
 * allowing the WebSocket handler to broadcast real-time updates
 * to subscribed clients.
 *
 * Event Types:
 * - 'intents': General intent events (distribution, session, recent)
 * - 'intents-distribution': Distribution updates
 * - 'intents-session-{sessionId}': Session-specific updates
 *
 * Part of demo critical path: Hook → Intelligence → Memory → Dashboard
 */

import { EventEmitter } from 'events';

export interface IntentEvent {
  type: 'INTENT_STORED' | 'INTENT_DISTRIBUTION' | 'INTENT_SESSION' | 'INTENT_RECENT';
  timestamp: string;
  correlation_id?: string;
  session_id?: string;
  data: Record<string, unknown>;
}

class IntentEventEmitterClass extends EventEmitter {
  /**
   * Emit an intent event to all subscribers.
   *
   * Routes events to:
   * - General 'intents' topic (all intent events)
   * - Specific subtopic based on event type
   */
  emitIntentEvent(event: IntentEvent): void {
    // Broadcast to general intents topic
    this.emit('intents', event);

    // Also emit to specific subtopic based on event type
    if (event.type === 'INTENT_DISTRIBUTION') {
      this.emit('intents-distribution', event);
    } else if (event.type === 'INTENT_SESSION' && event.session_id) {
      this.emit(`intents-session-${event.session_id}`, event);
    } else if (event.type === 'INTENT_RECENT') {
      this.emit('intents-recent', event);
    } else if (event.type === 'INTENT_STORED') {
      this.emit('intents-stored', event);
    }
  }

  /**
   * Emit a real-time intent stored event.
   * Called when a new intent is stored in the graph database.
   */
  emitIntentStored(data: {
    intent_id: string;
    session_id: string;
    intent_category: string;
    confidence: number;
    keywords?: string[];
    correlation_id?: string;
  }): void {
    this.emitIntentEvent({
      type: 'INTENT_STORED',
      timestamp: new Date().toISOString(),
      correlation_id: data.correlation_id,
      session_id: data.session_id,
      data,
    });
  }

  /**
   * Emit a distribution update event.
   * Called when intent distribution data is refreshed.
   */
  emitDistributionUpdate(data: {
    distribution: Record<string, number>;
    total_intents: number;
    time_range_hours: number;
  }): void {
    this.emitIntentEvent({
      type: 'INTENT_DISTRIBUTION',
      timestamp: new Date().toISOString(),
      data,
    });
  }
}

export const intentEventEmitter = new IntentEventEmitterClass();
