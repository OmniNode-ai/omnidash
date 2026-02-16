import { describe, it, expect } from 'vitest';
import { getEventDisplayLabel, computeNormalizedType } from '../event-bus-dashboard';

// =============================================================================
// getEventDisplayLabel
// =============================================================================

describe('getEventDisplayLabel', () => {
  describe('priority chain', () => {
    it('returns toolName when provided (highest priority)', () => {
      expect(
        getEventDisplayLabel({
          eventType: 'tool_call',
          toolName: 'Read',
          actionName: 'execute',
          selectedAgent: 'polymorphic',
          topic: 'dev.onex.evt.omniclaude.tool-executed.v1',
        })
      ).toBe('Read');
    });

    it('returns actionName when toolName is absent', () => {
      expect(
        getEventDisplayLabel({
          eventType: 'tool_call',
          actionName: 'execute',
          selectedAgent: 'polymorphic',
          topic: 'dev.onex.evt.omniclaude.tool-executed.v1',
        })
      ).toBe('execute');
    });

    it('returns route:<agent> when only selectedAgent is provided', () => {
      expect(
        getEventDisplayLabel({
          eventType: 'routing_decision',
          selectedAgent: 'api-architect',
        })
      ).toBe('route:api-architect');
    });

    it('extracts ONEX event-name segment from canonical topic', () => {
      // onex.evt.omniclaude.tool-executed.v1 => 'Tool Executed'
      expect(
        getEventDisplayLabel({
          eventType: 'some-event',
          topic: 'onex.evt.omniclaude.tool-executed.v1',
        })
      ).toBe('Tool Executed');
    });

    it('extracts ONEX event-name from env-prefixed topic', () => {
      // dev.onex.evt.omniclaude.session-started.v1 => extractSuffix strips 'dev.'
      // then segments[3] = 'session-started'
      expect(
        getEventDisplayLabel({
          eventType: 'some-event',
          topic: 'dev.onex.evt.omniclaude.session-started.v1',
        })
      ).toBe('Session Started');
    });

    it('falls back to getEventTypeLabel for non-ONEX topics', () => {
      // For a flat legacy topic like 'agent-routing-decisions' where no metadata
      // match exists, extractEventTypeLabel will title-case the meaningful segment.
      const result = getEventDisplayLabel({
        eventType: 'custom_action',
        topic: 'agent-routing-decisions',
      });
      // getEventTypeLabel processes 'custom_action' through extractEventTypeLabel
      // which splits on dots, filters, and title-cases => 'Custom Action'
      expect(result).toBe('Custom Action');
    });

    it('falls back to raw eventType when nothing matches', () => {
      // A short, non-ONEX, non-dotted eventType with no metadata will
      // be title-cased by extractEventTypeLabel.
      const result = getEventDisplayLabel({
        eventType: 'heartbeat',
      });
      expect(result).toBe('Heartbeat');
    });
  });

  describe('trailing-dot edge case', () => {
    it('does not return empty string for topic with trailing dot', () => {
      // 'onex.evt.producer.event-name.v1.' has trailing dot => last segment is '',
      // segments[-2] is 'v1' ... but length >= 5 and segments[0] is 'onex'.
      // After extractSuffix, segments = ['onex','evt','producer','event-name','v1','']
      // segments.length = 6 >= 5, segments[-2] = 'v1' => toTitleCase('v1') = 'V1'
      // which is non-empty so it would return. But if the penultimate segment were
      // empty (double trailing dots), the guard catches it.
      const result = getEventDisplayLabel({
        eventType: 'some-type',
        topic: 'onex.evt.producer..v1',
      });
      // segments = ['onex','evt','producer','','v1'], length=5, segments[-2] = ''
      // toTitleCase('') = '' => guard triggers, falls through to getEventTypeLabel
      expect(result).not.toBe('');
      expect(typeof result).toBe('string');
    });

    it('handles topic ending with multiple dots gracefully', () => {
      const result = getEventDisplayLabel({
        eventType: 'fallback-type',
        topic: 'onex.evt.producer.name...',
      });
      expect(result).not.toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles empty eventType', () => {
      const result = getEventDisplayLabel({ eventType: '' });
      expect(typeof result).toBe('string');
    });

    it('handles empty strings for all optional fields', () => {
      const result = getEventDisplayLabel({
        eventType: 'heartbeat',
        toolName: '',
        actionName: '',
        selectedAgent: '',
        topic: '',
      });
      // Empty strings are falsy, so all are skipped.
      // Falls through to getEventTypeLabel('heartbeat') => 'Heartbeat'
      expect(result).toBe('Heartbeat');
    });

    it('prefers toolName even when it is a single character', () => {
      expect(
        getEventDisplayLabel({
          eventType: 'x',
          toolName: 'X',
        })
      ).toBe('X');
    });
  });
});

// =============================================================================
// computeNormalizedType
// =============================================================================

describe('computeNormalizedType', () => {
  describe('bare version string handling', () => {
    it('returns toolName from details when eventType is bare "v1"', () => {
      expect(computeNormalizedType('v1', { toolName: 'Read' })).toBe('Read');
    });

    it('returns actionName from details when eventType is "v2" and no toolName', () => {
      expect(computeNormalizedType('v2', { actionName: 'execute' })).toBe('execute');
    });

    it('returns actionType from details when eventType is "v1" and no toolName/actionName', () => {
      expect(computeNormalizedType('v1', { actionType: 'lifecycle' })).toBe('lifecycle');
    });

    it('derives label from topic when details are empty and eventType is "v1"', () => {
      const result = computeNormalizedType('v1', null, 'onex.evt.omniclaude.session-started.v1');
      expect(result).toBe('Session Started');
    });

    it('returns "unknown" when eventType is "v1" and no details or topic', () => {
      expect(computeNormalizedType('v1', null)).toBe('unknown');
    });

    it('returns "unknown" when eventType is "v3" and topic provides no better label', () => {
      // A topic that has no ONEX structure and no metadata match
      // getEventDisplayLabel will fall back to getEventTypeLabel('v3')
      // which processes through extractEventTypeLabel. Since 'v3' is filtered
      // as a version suffix, there are no meaningful segments left, so it
      // returns 'v3' as-is. computeNormalizedType then sees topicLabel === eventType
      // and falls through to 'unknown'.
      expect(computeNormalizedType('v3', null, 'some-flat-topic')).toBe('unknown');
    });
  });

  describe('non-version eventType', () => {
    it('delegates to getEventDisplayLabel with details fields', () => {
      expect(
        computeNormalizedType('tool_call', {
          toolName: 'Write',
          actionName: 'execute',
          selectedAgent: 'frontend',
        })
      ).toBe('Write');
    });

    it('uses actionName when toolName is absent', () => {
      expect(
        computeNormalizedType('tool_call', {
          actionName: 'compile',
        })
      ).toBe('compile');
    });

    it('uses selectedAgent prefixed with route: when no tool/action', () => {
      expect(
        computeNormalizedType('routing_decision', {
          selectedAgent: 'debug',
        })
      ).toBe('route:debug');
    });

    it('falls back through getEventDisplayLabel for null details', () => {
      const result = computeNormalizedType('custom_event', null);
      // extractEventTypeLabel('custom_event') => split on dots (only 1 segment)
      // => toTitleCase('custom_event') => 'Custom Event'
      expect(result).toBe('Custom Event');
    });

    it('passes topic through for ONEX segment extraction', () => {
      const result = computeNormalizedType(
        'some-event',
        null,
        'dev.onex.evt.platform.node-heartbeat.v1'
      );
      expect(result).toBe('Node Heartbeat');
    });
  });

  describe('edge cases', () => {
    it('does not treat "v1beta" as a bare version string', () => {
      // "v1beta" does not match /^v\d+$/
      const result = computeNormalizedType('v1beta', null);
      expect(result).not.toBe('unknown');
    });

    it('does not treat "version1" as a bare version string', () => {
      const result = computeNormalizedType('version1', null);
      expect(result).not.toBe('unknown');
    });

    it('handles empty details object', () => {
      const result = computeNormalizedType('v1', {});
      // No toolName, actionName, or actionType => falls through
      // No topic => returns 'unknown'
      expect(result).toBe('unknown');
    });
  });
});
