/**
 * Projection Bootstrap Tests (OMN-2195, OMN-2196)
 *
 * Covers:
 * - extractProducerFromTopic: source inference from ONEX canonical topic names
 * - extractActionFromTopic: event type inference from ONEX canonical topic names
 *
 * OMN-2195: Events ingested via EventBusDataSource must infer the source
 * (producer) from the topic name when the upstream message has no `source` field.
 * OMN-2196: Events with empty `event_type` must infer the action from the topic.
 */

import { describe, it, expect } from 'vitest';
import { extractProducerFromTopic, extractActionFromTopic } from '../projection-bootstrap';

// ============================================================================
// extractProducerFromTopic
// ============================================================================

describe('extractProducerFromTopic (OMN-2195)', () => {
  describe('ONEX canonical topics', () => {
    it('should extract "omniintelligence" from onex.cmd.omniintelligence.tool-content.v1', () => {
      expect(extractProducerFromTopic('onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'omniintelligence'
      );
    });

    it('should extract "omniclaude" from onex.evt.omniclaude.session-started.v1', () => {
      expect(extractProducerFromTopic('onex.evt.omniclaude.session-started.v1')).toBe('omniclaude');
    });

    it('should extract "platform" from onex.evt.platform.node-heartbeat.v1', () => {
      expect(extractProducerFromTopic('onex.evt.platform.node-heartbeat.v1')).toBe('platform');
    });

    it('should extract "omnimemory" from onex.evt.omnimemory.intent-stored.v1', () => {
      expect(extractProducerFromTopic('onex.evt.omnimemory.intent-stored.v1')).toBe('omnimemory');
    });

    it('should extract "validation" from onex.evt.validation.cross-repo-run-started.v1', () => {
      expect(extractProducerFromTopic('onex.evt.validation.cross-repo-run-started.v1')).toBe(
        'validation'
      );
    });

    it('should handle cmd topics the same as evt topics', () => {
      expect(extractProducerFromTopic('onex.cmd.platform.request-introspection.v1')).toBe(
        'platform'
      );
    });

    it('should handle intent topics', () => {
      expect(extractProducerFromTopic('onex.intent.platform.runtime-tick.v1')).toBe('platform');
    });

    it('should handle snapshot topics', () => {
      expect(extractProducerFromTopic('onex.snapshot.platform.registration-snapshots.v1')).toBe(
        'platform'
      );
    });
  });

  describe('env-prefixed topics (legacy format)', () => {
    it('should strip "dev." prefix and extract producer', () => {
      expect(extractProducerFromTopic('dev.onex.evt.omniclaude.session-started.v1')).toBe(
        'omniclaude'
      );
    });

    it('should strip "staging." prefix and extract producer', () => {
      expect(extractProducerFromTopic('staging.onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'omniintelligence'
      );
    });

    it('should strip "prod." prefix and extract producer', () => {
      expect(extractProducerFromTopic('prod.onex.evt.platform.node-heartbeat.v1')).toBe('platform');
    });
  });

  describe('legacy flat topics (non-ONEX)', () => {
    it('should return "system" for agent-actions', () => {
      expect(extractProducerFromTopic('agent-actions')).toBe('system');
    });

    it('should return "system" for agent-routing-decisions', () => {
      expect(extractProducerFromTopic('agent-routing-decisions')).toBe('system');
    });

    it('should return "system" for agent-transformation-events', () => {
      expect(extractProducerFromTopic('agent-transformation-events')).toBe('system');
    });

    it('should return "system" for router-performance-metrics', () => {
      expect(extractProducerFromTopic('router-performance-metrics')).toBe('system');
    });
  });

  describe('edge cases', () => {
    it('should return "system" for empty string', () => {
      expect(extractProducerFromTopic('')).toBe('system');
    });

    it('should return "system" for topic with fewer than 5 segments', () => {
      expect(extractProducerFromTopic('onex.evt.platform')).toBe('system');
    });

    it('should return "system" for non-onex dotted topic', () => {
      expect(extractProducerFromTopic('some.other.topic.format.v1')).toBe('system');
    });

    it('should extract producer from ONEX topic with >5 segments', () => {
      // segments.length >= 5 guard still matches; segments[2] is the producer
      expect(extractProducerFromTopic('onex.evt.platform.multi-part-name.extra.v1')).toBe(
        'platform'
      );
    });
  });
});

// ============================================================================
// extractActionFromTopic
// ============================================================================

describe('extractActionFromTopic (OMN-2196)', () => {
  describe('ONEX canonical topics', () => {
    it('should extract "tool-content" from onex.cmd.omniintelligence.tool-content.v1', () => {
      expect(extractActionFromTopic('onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'tool-content'
      );
    });

    it('should extract "session-started" from onex.evt.omniclaude.session-started.v1', () => {
      expect(extractActionFromTopic('onex.evt.omniclaude.session-started.v1')).toBe(
        'session-started'
      );
    });

    it('should extract "node-heartbeat" from onex.evt.platform.node-heartbeat.v1', () => {
      expect(extractActionFromTopic('onex.evt.platform.node-heartbeat.v1')).toBe('node-heartbeat');
    });

    it('should extract "intent-classified" from onex.evt.omniintelligence.intent-classified.v1', () => {
      expect(extractActionFromTopic('onex.evt.omniintelligence.intent-classified.v1')).toBe(
        'intent-classified'
      );
    });
  });

  describe('env-prefixed topics', () => {
    it('should strip prefix and extract action', () => {
      expect(extractActionFromTopic('dev.onex.evt.omniclaude.session-started.v1')).toBe(
        'session-started'
      );
    });

    it('should handle staging prefix', () => {
      expect(extractActionFromTopic('staging.onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'tool-content'
      );
    });
  });

  describe('legacy flat topics', () => {
    it('should return empty string for agent-actions', () => {
      expect(extractActionFromTopic('agent-actions')).toBe('');
    });

    it('should return empty string for agent-routing-decisions', () => {
      expect(extractActionFromTopic('agent-routing-decisions')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(extractActionFromTopic('')).toBe('');
    });

    it('should return empty string for short dotted topic', () => {
      expect(extractActionFromTopic('onex.evt.platform')).toBe('');
    });

    it('should return empty string for non-onex dotted topic with 5 segments', () => {
      expect(extractActionFromTopic('some.other.topic.format.v1')).toBe('');
    });

    it('should extract second-to-last segment from ONEX topic with >5 segments', () => {
      // With 6 segments the >= 5 guard matches; segments[length - 2] picks
      // the second-to-last segment ("extra"), not the canonical event-name slot.
      expect(extractActionFromTopic('onex.evt.platform.multi-part-name.extra.v1')).toBe('extra');
    });
  });
});
