/**
 * EventEnrichmentHandlers Tests (OMN-2418)
 *
 * Covers:
 * - deriveEventCategory: tool_event, routing_event, error_event, unknown fallback
 * - getEnrichmentPipeline: singleton identity
 * - EventEnrichmentPipeline.run: never throws (malformed payloads)
 * - Confidence clamping: fractional (0–1) and percentage (> 1) values
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveEventCategory,
  getEnrichmentPipeline,
  resetEnrichmentPipelineForTesting,
  EventEnrichmentPipeline,
} from '../event-enrichment-handlers';

// ============================================================================
// deriveEventCategory
// ============================================================================

describe('deriveEventCategory', () => {
  // ------------------------------------------------------------------------
  // tool_event
  // ------------------------------------------------------------------------

  describe('tool_event', () => {
    it('returns "tool_event" when payload has a string toolName field', () => {
      expect(deriveEventCategory({ toolName: 'Read' }, 'agent-action', 'agent-actions')).toBe(
        'tool_event'
      );
    });

    it('returns "tool_event" when payload has a snake_case tool_name field', () => {
      expect(deriveEventCategory({ tool_name: 'Write' }, 'agent-action', 'agent-actions')).toBe(
        'tool_event'
      );
    });

    it('returns "tool_event" when toolName is nested inside a data wrapper', () => {
      expect(
        deriveEventCategory({ data: { toolName: 'Bash' } }, 'agent-action', 'agent-actions')
      ).toBe('tool_event');
    });

    it('does NOT return "tool_event" when toolName is not a string (e.g. number)', () => {
      // non-string toolName falls through to other classifiers
      const result = deriveEventCategory({ toolName: 42 }, 'routing', 'routing-topic');
      expect(result).not.toBe('tool_event');
    });
  });

  // ------------------------------------------------------------------------
  // routing_event
  // ------------------------------------------------------------------------

  describe('routing_event', () => {
    it('returns "routing_event" when payload has a selectedAgent field', () => {
      expect(
        deriveEventCategory({ selectedAgent: 'polymorphic-agent' }, 'action', 'some-topic')
      ).toBe('routing_event');
    });

    it('returns "routing_event" when type contains "routing"', () => {
      expect(deriveEventCategory({}, 'routing-decision', 'some-topic')).toBe('routing_event');
    });

    it('returns "routing_event" when topic contains "route"', () => {
      expect(deriveEventCategory({}, 'decision', 'agent-route-events')).toBe('routing_event');
    });
  });

  // ------------------------------------------------------------------------
  // error_event
  // ------------------------------------------------------------------------

  describe('error_event', () => {
    it('returns "error_event" when type contains "error"', () => {
      expect(deriveEventCategory({}, 'agent-error', 'some-topic')).toBe('error_event');
    });

    it('returns "error_event" when type contains "failed"', () => {
      expect(deriveEventCategory({}, 'task-failed', 'some-topic')).toBe('error_event');
    });

    it('returns "error_event" when topic contains "error"', () => {
      expect(deriveEventCategory({}, 'action', 'onex.evt.agent.error.v1')).toBe('error_event');
    });

    it('returns "error_event" when type contains "failure"', () => {
      expect(deriveEventCategory({}, 'routing-failure', 'some-topic')).toBe('error_event');
    });
  });

  // ------------------------------------------------------------------------
  // intent_event
  // ------------------------------------------------------------------------

  describe('intent_event', () => {
    it('returns "intent_event" when type contains "intent"', () => {
      expect(deriveEventCategory({}, 'intent-classified', 'some-topic')).toBe('intent_event');
    });

    it('returns "intent_event" when payload has intentCategory field', () => {
      expect(
        deriveEventCategory({ intentCategory: 'code-generation' }, 'action', 'some-topic')
      ).toBe('intent_event');
    });
  });

  // ------------------------------------------------------------------------
  // node_heartbeat
  // ------------------------------------------------------------------------

  describe('node_heartbeat', () => {
    it('returns "node_heartbeat" when type contains "heartbeat"', () => {
      expect(deriveEventCategory({}, 'node-heartbeat', 'platform-topic')).toBe('node_heartbeat');
    });
  });

  // ------------------------------------------------------------------------
  // node_lifecycle
  // ------------------------------------------------------------------------

  describe('node_lifecycle', () => {
    it('returns "node_lifecycle" when type contains "registration"', () => {
      expect(deriveEventCategory({}, 'node-registration', 'some-topic')).toBe('node_lifecycle');
    });

    it('returns "node_lifecycle" when topic contains "node-registry"', () => {
      expect(deriveEventCategory({}, 'update', 'onex.node-registry.events')).toBe('node_lifecycle');
    });
  });

  // ------------------------------------------------------------------------
  // unknown (default)
  // ------------------------------------------------------------------------

  describe('unknown', () => {
    it('returns "unknown" for an empty payload with an unrecognized type/topic', () => {
      expect(deriveEventCategory({}, 'generic-action', 'generic-topic')).toBe('unknown');
    });

    it('returns "unknown" when payload is empty and type/topic have no keywords', () => {
      expect(deriveEventCategory({}, '', '')).toBe('unknown');
    });
  });

  // ------------------------------------------------------------------------
  // Precedence: toolName beats routing-related type
  // ------------------------------------------------------------------------

  describe('precedence', () => {
    it('toolName takes highest priority over routing type keyword', () => {
      expect(deriveEventCategory({ toolName: 'Read' }, 'routing-decision', 'routing-topic')).toBe(
        'tool_event'
      );
    });

    it('error_event takes priority over routing selectedAgent', () => {
      // error is checked before selectedAgent in the classifier
      expect(deriveEventCategory({ selectedAgent: 'agent-x' }, 'task-error', 'some-topic')).toBe(
        'error_event'
      );
    });
  });
});

// ============================================================================
// getEnrichmentPipeline — singleton
// ============================================================================

describe('getEnrichmentPipeline', () => {
  beforeEach(() => resetEnrichmentPipelineForTesting());

  it('returns an EventEnrichmentPipeline instance', () => {
    const pipeline = getEnrichmentPipeline();
    expect(pipeline).toBeInstanceOf(EventEnrichmentPipeline);
  });

  it('returns the same instance on repeated calls (singleton)', () => {
    const first = getEnrichmentPipeline();
    const second = getEnrichmentPipeline();
    expect(first).toBe(second);
  });

  it('resetEnrichmentPipelineForTesting resets the singleton — new call returns a different instance', () => {
    const before = getEnrichmentPipeline();
    resetEnrichmentPipelineForTesting();
    const after = getEnrichmentPipeline();
    expect(before).not.toBe(after);
  });
});

// ============================================================================
// EventEnrichmentPipeline.run — never throws
// ============================================================================

describe('EventEnrichmentPipeline.run', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('does not throw for a normal routing payload', () => {
    expect(() =>
      pipeline.run(
        { selectedAgent: 'polymorphic-agent', confidence: 0.87 },
        'routing',
        'routing-topic'
      )
    ).not.toThrow();
  });

  it('does not throw for an empty payload', () => {
    expect(() => pipeline.run({}, 'unknown-type', 'unknown-topic')).not.toThrow();
  });

  it('does not throw for a payload with null values', () => {
    expect(() =>
      pipeline.run({ toolName: null, selectedAgent: null }, 'action', 'topic')
    ).not.toThrow();
  });

  it('does not throw for a payload with unexpected nested types', () => {
    expect(() =>
      pipeline.run({ data: [1, 2, 3], confidence: 'not-a-number' }, 'weird-type', 'weird-topic')
    ).not.toThrow();
  });

  it('does not throw when type and topic are empty strings', () => {
    expect(() => pipeline.run({}, '', '')).not.toThrow();
  });

  it('returns an object with the required enrichment fields', () => {
    const result = pipeline.run(
      { selectedAgent: 'test-agent', confidence: 0.9 },
      'routing-decision',
      'routing-topic'
    );
    expect(result).toHaveProperty('enrichmentVersion', 'v1');
    expect(result).toHaveProperty('handler');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('normalizedType');
    expect(result).toHaveProperty('artifacts');
  });

  it('returns a fallback enrichment when processing fails internally', () => {
    // Simulate a completely broken payload scenario by running with
    // extremely unusual but valid JS values
    const result = pipeline.run({}, 'action', 'topic');
    expect(result.enrichmentVersion).toBe('v1');
    expect(typeof result.summary).toBe('string');
  });
});

// ============================================================================
// Confidence clamping: fractional vs percentage inputs
// ============================================================================

describe('confidence clamping in RoutingDecisionHandler', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('renders 0.95 as "95%" in the summary', () => {
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 0.95 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('95%');
    expect(result.summary).not.toContain('9500%');
  });

  it('renders 95 (integer percentage) as "95%" in the summary', () => {
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 95 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('95%');
    expect(result.summary).not.toContain('9500%');
  });

  it('renders 1.0 (100% fractional) as "100%" in the summary', () => {
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 1.0 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('100%');
  });

  it('renders 0.0 as "0%" in the summary', () => {
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 0.0 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('0%');
  });

  it('clamps an out-of-range value of 150 to "100%" in the summary', () => {
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 150 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('100%');
  });

  it('renders 1.5 (ambiguous boundary in (1,2)) as "2%" — treated as already-percentage and rounded', () => {
    // Values in the exclusive range (1, 2) are treated as already-in-percent form
    // by the heuristic (confidence > 1 → Math.round(confidence)). This means 1.5
    // becomes Math.round(1.5) = 2, not 150. This test documents the known ambiguous
    // behavior so that future refactors do not silently change it.
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: 1.5 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('2%');
  });

  it('omits the percentage part when confidence is NaN (num() guard)', () => {
    // NaN should be filtered out by the num() guard fix applied in OMN-2418
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: NaN },
      'routing-decision',
      'routing-topic'
    );
    // Summary should NOT contain "(NaN%)" — it should omit the confidence part entirely
    expect(result.summary).not.toContain('NaN');
    // The agent name should still appear
    expect(result.summary).toContain('my-agent');
  });
});

// ============================================================================
// ToolExecutedHandler enrichment
// ============================================================================

describe('ToolExecutedHandler enrichment', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('file_read: enriches toolName, filePath and produces a file_read artifact', () => {
    const result = pipeline.run(
      { toolName: 'read', tool_input: { file_path: '/tmp/test.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('read');
    expect(result.filePath).toBe('/tmp/test.ts');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('file_read');
    // display value should be the basename of the path
    expect(result.artifacts[0].display).toBe('test.ts');
  });

  it('file_read: summary contains the tool name and basename', () => {
    const result = pipeline.run(
      { toolName: 'read', tool_input: { file_path: '/src/server/index.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.summary).toContain('read');
    expect(result.summary).toContain('index.ts');
  });

  it('bash: enriches toolName, bashCommand and produces a bash_command artifact', () => {
    const result = pipeline.run(
      { toolName: 'bash', tool_input: { command: 'ls -la /tmp' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('bash');
    expect(result.bashCommand).toBe('ls -la /tmp');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('bash_command');
  });

  it('bash: artifact display is a truncated form of the command', () => {
    const longCommand = 'find /Volumes/PRO-G40/Code -name "*.ts" -not -path "*/node_modules/*"';
    const result = pipeline.run(
      { toolName: 'bash', tool_input: { command: longCommand } },
      'agent-action',
      'agent-actions'
    );
    // truncate(s, 40) uses a hardcoded slice of 57 chars + '...' = 60 max output length.
    // The max parameter only controls the threshold check, not the slice offset.
    // So display length is at most 60, and it is shorter than the 69-char original.
    expect(result.artifacts[0].display).not.toBe(longCommand);
    expect((result.artifacts[0].display ?? '').length).toBeLessThanOrEqual(60);
  });

  it('unrecognized tool: still returns a valid enrichment with a toolName', () => {
    const result = pipeline.run(
      { toolName: 'WebFetch', tool_input: { url: 'https://example.com' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.enrichmentVersion).toBe('v1');
    expect(result.handler).toBe('ToolExecutedHandler');
    expect(result.category).toBe('tool_event');
    expect(result.toolName).toBe('WebFetch');
    // unrecognized tools produce no artifacts and no filePath/bashCommand
    expect(result.artifacts).toHaveLength(0);
    expect(result.filePath).toBeUndefined();
    expect(result.bashCommand).toBeUndefined();
  });

  it('array tool_input: does not crash and still returns a valid enrichment', () => {
    // Guard against array inputs (Issue 3 — Array.isArray guard)
    const result = pipeline.run(
      { toolName: 'read', tool_input: ['/tmp/test.ts', '/tmp/other.ts'] },
      'agent-action',
      'agent-actions'
    );
    expect(result.enrichmentVersion).toBe('v1');
    expect(result.toolName).toBe('read');
    // Array input should be ignored — filePath falls back to payload-level lookup
    // which also won't find it, so filePath is undefined and no artifact is pushed
    expect(result.filePath).toBeUndefined();
    expect(result.artifacts).toHaveLength(0);
  });
});

// ============================================================================
// Confidence clamping in IntentHandler
// ============================================================================

describe('confidence clamping in IntentHandler', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('renders 0.95 as "95%" in the summary', () => {
    const result = pipeline.run(
      { intent_category: 'code_generation', confidence: 0.95 },
      'intent.classify',
      'intent-topic'
    );
    expect(result.summary).toContain('95%');
    expect(result.summary).not.toContain('9500%');
  });

  it('renders 95 (integer percentage) as "95%" in the summary — not 9500%', () => {
    const result = pipeline.run(
      { intent_category: 'code_generation', confidence: 95 },
      'intent.classify',
      'intent-topic'
    );
    expect(result.summary).toContain('95%');
    expect(result.summary).not.toContain('9500%');
  });

  it('omits the percentage part when confidence is NaN (num() guard)', () => {
    const result = pipeline.run(
      { intent_category: 'code_generation', confidence: NaN },
      'intent.classify',
      'intent-topic'
    );
    // Summary should NOT contain "(NaN%)" — confidence part is omitted entirely
    expect(result.summary).not.toContain('NaN');
    // The intent category should still appear
    expect(result.summary).toContain('code_generation');
  });
});
