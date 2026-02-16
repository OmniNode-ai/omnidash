/**
 * Shared Topic Parser Tests
 *
 * Tests for the canonical shared functions in @shared/topics:
 * - extractProducerFromTopic: returns producer name or null
 * - extractProducerFromTopicOrDefault: returns producer name or a default string
 * - extractActionFromTopic: returns action name or empty string
 *
 * These test the shared (null-returning) contract directly, unlike the
 * server-side tests in server/__tests__/projection-bootstrap.test.ts which
 * test the server wrapper (that applies ?? 'system').
 */

import { describe, it, expect } from 'vitest';
import {
  extractProducerFromTopic,
  extractProducerFromTopicOrDefault,
  extractActionFromTopic,
} from '../topics';

// ============================================================================
// extractProducerFromTopic (shared — returns null for non-ONEX topics)
// ============================================================================

describe('extractProducerFromTopic (shared)', () => {
  describe('ONEX canonical topics', () => {
    it('should extract "omniclaude" from onex.evt.omniclaude.session-started.v1', () => {
      expect(extractProducerFromTopic('onex.evt.omniclaude.session-started.v1')).toBe('omniclaude');
    });

    it('should extract "omniintelligence" from onex.cmd.omniintelligence.tool-content.v1', () => {
      expect(extractProducerFromTopic('onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'omniintelligence'
      );
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

    it('should strip "production." prefix and extract producer', () => {
      expect(extractProducerFromTopic('production.onex.evt.platform.node-heartbeat.v1')).toBe(
        'platform'
      );
    });

    it('should strip "test." prefix and extract producer', () => {
      expect(extractProducerFromTopic('test.onex.evt.omniclaude.session-started.v1')).toBe(
        'omniclaude'
      );
    });

    it('should strip "local." prefix and extract producer', () => {
      expect(extractProducerFromTopic('local.onex.evt.omniclaude.session-started.v1')).toBe(
        'omniclaude'
      );
    });
  });

  describe('legacy flat topics (non-ONEX) — returns null', () => {
    it('should return null for agent-actions', () => {
      expect(extractProducerFromTopic('agent-actions')).toBeNull();
    });

    it('should return null for agent-routing-decisions', () => {
      expect(extractProducerFromTopic('agent-routing-decisions')).toBeNull();
    });

    it('should return null for agent-transformation-events', () => {
      expect(extractProducerFromTopic('agent-transformation-events')).toBeNull();
    });

    it('should return null for router-performance-metrics', () => {
      expect(extractProducerFromTopic('router-performance-metrics')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(extractProducerFromTopic('')).toBeNull();
    });

    it('should return null for topic with fewer than 5 segments', () => {
      expect(extractProducerFromTopic('onex.evt.platform')).toBeNull();
    });

    it('should return null for non-onex dotted topic', () => {
      expect(extractProducerFromTopic('some.other.topic.format.v1')).toBeNull();
    });

    it('should extract producer from ONEX topic with >5 segments', () => {
      expect(extractProducerFromTopic('onex.evt.platform.multi-part-name.extra.v1')).toBe(
        'platform'
      );
    });
  });
});

// ============================================================================
// extractProducerFromTopicOrDefault (convenience wrapper)
// ============================================================================

describe('extractProducerFromTopicOrDefault', () => {
  describe('ONEX canonical topics (delegates to extractProducerFromTopic)', () => {
    it('should extract "omniclaude" from onex.evt.omniclaude.session-started.v1', () => {
      expect(extractProducerFromTopicOrDefault('onex.evt.omniclaude.session-started.v1')).toBe(
        'omniclaude'
      );
    });

    it('should extract "platform" from onex.evt.platform.node-heartbeat.v1', () => {
      expect(extractProducerFromTopicOrDefault('onex.evt.platform.node-heartbeat.v1')).toBe(
        'platform'
      );
    });
  });

  describe('env-prefixed topics', () => {
    it('should strip prefix and extract producer', () => {
      expect(extractProducerFromTopicOrDefault('dev.onex.evt.omniclaude.session-started.v1')).toBe(
        'omniclaude'
      );
    });
  });

  describe('legacy flat topics — returns default value', () => {
    it('should return "system" (default) for agent-actions', () => {
      expect(extractProducerFromTopicOrDefault('agent-actions')).toBe('system');
    });

    it('should return "system" (default) for router-performance-metrics', () => {
      expect(extractProducerFromTopicOrDefault('router-performance-metrics')).toBe('system');
    });

    it('should return custom default when provided', () => {
      expect(extractProducerFromTopicOrDefault('agent-actions', 'unknown')).toBe('unknown');
    });

    it('should return custom default for empty string', () => {
      expect(extractProducerFromTopicOrDefault('', 'fallback')).toBe('fallback');
    });
  });

  describe('edge cases', () => {
    it('should return "system" (default) for empty string', () => {
      expect(extractProducerFromTopicOrDefault('')).toBe('system');
    });

    it('should return "system" (default) for topic with fewer than 5 segments', () => {
      expect(extractProducerFromTopicOrDefault('onex.evt.platform')).toBe('system');
    });

    it('should return "system" (default) for non-onex dotted topic', () => {
      expect(extractProducerFromTopicOrDefault('some.other.topic.format.v1')).toBe('system');
    });
  });
});

// ============================================================================
// extractActionFromTopic (shared)
// ============================================================================

describe('extractActionFromTopic (shared)', () => {
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

    it('should extract "intent-stored" from onex.evt.omnimemory.intent-stored.v1', () => {
      expect(extractActionFromTopic('onex.evt.omnimemory.intent-stored.v1')).toBe('intent-stored');
    });
  });

  describe('env-prefixed topics', () => {
    it('should strip "dev." prefix and extract action', () => {
      expect(extractActionFromTopic('dev.onex.evt.omniclaude.session-started.v1')).toBe(
        'session-started'
      );
    });

    it('should strip "staging." prefix and extract action', () => {
      expect(extractActionFromTopic('staging.onex.cmd.omniintelligence.tool-content.v1')).toBe(
        'tool-content'
      );
    });

    it('should strip "prod." prefix and extract action', () => {
      expect(extractActionFromTopic('prod.onex.evt.platform.node-heartbeat.v1')).toBe(
        'node-heartbeat'
      );
    });

    it('should strip "production." prefix and extract action', () => {
      expect(extractActionFromTopic('production.onex.evt.platform.node-heartbeat.v1')).toBe(
        'node-heartbeat'
      );
    });

    it('should strip "test." prefix and extract action', () => {
      expect(extractActionFromTopic('test.onex.evt.omniclaude.session-started.v1')).toBe(
        'session-started'
      );
    });

    it('should strip "local." prefix and extract action', () => {
      expect(extractActionFromTopic('local.onex.evt.omniclaude.session-started.v1')).toBe(
        'session-started'
      );
    });
  });

  describe('legacy flat topics — returns empty string', () => {
    it('should return empty string for agent-actions', () => {
      expect(extractActionFromTopic('agent-actions')).toBe('');
    });

    it('should return empty string for agent-routing-decisions', () => {
      expect(extractActionFromTopic('agent-routing-decisions')).toBe('');
    });

    it('should return empty string for router-performance-metrics', () => {
      expect(extractActionFromTopic('router-performance-metrics')).toBe('');
    });
  });

  describe('6-segment topics (multi-part event names)', () => {
    it('should join segments between producer and version for 6-segment topic', () => {
      // onex.evt.omniclaude.transformation.completed.v1 → 'transformation-completed'
      expect(extractActionFromTopic('onex.evt.omniclaude.transformation.completed.v1')).toBe(
        'transformation-completed'
      );
    });

    it('should join segments for synthetic 6-segment topic', () => {
      expect(extractActionFromTopic('onex.evt.platform.multi-part-name.extra.v1')).toBe(
        'multi-part-name-extra'
      );
    });

    it('should handle env-prefixed 6-segment topic', () => {
      expect(extractActionFromTopic('dev.onex.evt.omniclaude.transformation.completed.v1')).toBe(
        'transformation-completed'
      );
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
  });
});
