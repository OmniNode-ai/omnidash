import { describe, it, expect } from 'vitest';
import { EXCLUDED_TOPICS_FOR_STORAGE } from '../server/event-bus-data-source.js';

/**
 * Tests for the topic exclusion filter in event-bus-data-source.
 * Ensures heartbeat and pattern pipeline events are excluded from DB storage
 * while allowing normal operational events through.
 */

function shouldStoreEvent(topic: string): boolean {
  return !EXCLUDED_TOPICS_FOR_STORAGE.has(topic);
}

describe('event-bus-data-source topic filtering', () => {
  it('excludes heartbeat events from storage', () => {
    expect(shouldStoreEvent('onex.evt.platform.node-heartbeat.v1')).toBe(false);
  });

  it('excludes pattern pipeline events from storage', () => {
    expect(shouldStoreEvent('onex.evt.omniintelligence.pattern-learned.v1')).toBe(false);
    expect(shouldStoreEvent('onex.evt.omniintelligence.pattern-stored.v1')).toBe(false);
    expect(shouldStoreEvent('onex.evt.omniintelligence.pattern-projection.v1')).toBe(false);
    expect(shouldStoreEvent('onex.cmd.omniintelligence.pattern-learning.v1')).toBe(false);
  });

  it('contains exactly 5 excluded topics', () => {
    expect(EXCLUDED_TOPICS_FOR_STORAGE.size).toBe(5);
  });

  it('allows normal operational events through', () => {
    expect(shouldStoreEvent('onex.evt.omniclaude.tool-executed.v1')).toBe(true);
    expect(shouldStoreEvent('onex.evt.omniclaude.routing-decision.v1')).toBe(true);
    expect(shouldStoreEvent('onex.evt.omniclaude.gate-decision.v1')).toBe(true);
  });
});
