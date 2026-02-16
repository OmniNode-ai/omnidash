/**
 * Projection Bootstrap Smoke Tests (OMN-2195, OMN-2196)
 *
 * Verifies that the re-exports from server/projection-bootstrap.ts work
 * correctly and that the server-side behavioral contract (e.g. 'system'
 * default for legacy topics) is maintained.
 *
 * Exhaustive pattern coverage lives in shared/__tests__/topics.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { extractProducerFromTopicOrDefault, extractActionFromTopic } from '../projection-bootstrap';

// ============================================================================
// extractProducerFromTopicOrDefault — re-export smoke tests
// ============================================================================

describe('extractProducerFromTopicOrDefault (re-export)', () => {
  it('should extract producer from a canonical ONEX topic', () => {
    expect(extractProducerFromTopicOrDefault('onex.evt.omniclaude.session-started.v1')).toBe(
      'omniclaude'
    );
  });

  it('should strip env prefix and extract producer', () => {
    expect(extractProducerFromTopicOrDefault('dev.onex.evt.platform.node-heartbeat.v1')).toBe(
      'platform'
    );
  });

  it('should return "system" (default) for legacy flat topics', () => {
    expect(extractProducerFromTopicOrDefault('agent-actions')).toBe('system');
    expect(extractProducerFromTopicOrDefault('agent-routing-decisions')).toBe('system');
    expect(extractProducerFromTopicOrDefault('router-performance-metrics')).toBe('system');
  });

  it('should return "system" for empty string', () => {
    expect(extractProducerFromTopicOrDefault('')).toBe('system');
  });
});

// ============================================================================
// extractActionFromTopic — re-export smoke tests
// ============================================================================

describe('extractActionFromTopic (re-export)', () => {
  it('should extract action from a standard 5-segment ONEX topic', () => {
    expect(extractActionFromTopic('onex.cmd.omniintelligence.tool-content.v1')).toBe(
      'tool-content'
    );
  });

  it('should join multi-part event names from 6-segment topics', () => {
    expect(extractActionFromTopic('onex.evt.omniclaude.transformation.completed.v1')).toBe(
      'transformation-completed'
    );
  });

  it('should strip env prefix and extract action', () => {
    expect(extractActionFromTopic('dev.onex.evt.omniclaude.session-started.v1')).toBe(
      'session-started'
    );
  });

  it('should return empty string for legacy flat topics', () => {
    expect(extractActionFromTopic('agent-actions')).toBe('');
  });

  it('should return empty string for empty input', () => {
    expect(extractActionFromTopic('')).toBe('');
  });
});
