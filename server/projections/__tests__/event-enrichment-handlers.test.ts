/**
 * EventEnrichmentHandlers Tests (OMN-2418)
 *
 * Covers:
 * - deriveEventCategory: tool_event, routing_event, error_event, unknown fallback
 * - getEnrichmentPipeline: singleton identity
 * - EventEnrichmentPipeline.run: never throws (malformed payloads)
 * - Confidence clamping: fractional (0–1) and percentage (> 1) values
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
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

    it('returns "routing_event" when topic contains "routing"', () => {
      expect(deriveEventCategory({}, 'decision', 'agent-routing-events')).toBe('routing_event');
    });

    it('does NOT return "routing_event" for router-performance-metrics (contains "router" but not "routing")', () => {
      // "router-performance-metrics" contains the substring "route" (via "router") but NOT "routing".
      // After the fix, lTopic.includes('route') was removed from the classifier; only
      // lTopic.includes('routing') is checked. Without a selectedAgent field or routing keyword
      // in the type, this topic must NOT produce routing_event.
      const result = deriveEventCategory({}, 'performance-snapshot', 'router-performance-metrics');
      expect(result).not.toBe('routing_event');
    });

    it('returns "routing_event" when type is "routing-decision" and topic has no routing keyword', () => {
      // 'routing-decision' contains 'routing' — matched by the lType.includes('routing') branch.
      // topic is 'agent-actions' which contains neither 'routing' nor 'route', and payload has
      // no selectedAgent. The classifier must match via the lType.includes('routing') check.
      const result = deriveEventCategory({}, 'routing-decision', 'agent-actions');
      expect(result).toBe('routing_event');
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

    it('returns "error_event" when topic contains "failure"', () => {
      expect(deriveEventCategory({}, 'agent.completed', 'onex.evt.agent.failure.v1')).toBe(
        'error_event'
      );
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

    it('topic-based failure detection wins over payload selectedAgent field', () => {
      // payload has selectedAgent (routing indicator) but the topic contains "failure"
      // (error indicator). error_event is checked before the selectedAgent payload branch,
      // so topic-failure takes precedence.
      expect(
        deriveEventCategory(
          { selectedAgent: 'polymorphic-agent' },
          'agent.completed',
          'agent.failure.v1'
        )
      ).toBe('error_event');
    });
  });
});

// ============================================================================
// getEnrichmentPipeline — singleton
// ============================================================================

// NOTE: resetEnrichmentPipelineForTesting() is a no-op when NODE_ENV === 'production'.
// These tests must run with NODE_ENV !== 'production' (e.g. 'test') to function correctly.
describe('getEnrichmentPipeline', () => {
  beforeAll(() => {
    // Verify the reset function actually clears the singleton.
    // If NODE_ENV is 'production' or unset, resetEnrichmentPipelineForTesting() is a no-op and
    // these tests will produce false positives (singleton never resets between cases).
    resetEnrichmentPipelineForTesting();
    const pipeline = getEnrichmentPipeline();
    resetEnrichmentPipelineForTesting();
    // After a second reset the module-level variable should be undefined.
    // Re-calling getEnrichmentPipeline() must produce a NEW (distinct) instance.
    const afterReset = getEnrichmentPipeline();
    // If reset is a no-op (production env), the tests cannot validate singleton behavior
    if (afterReset === pipeline) {
      throw new Error(
        'resetEnrichmentPipelineForTesting is a no-op in this environment — check NODE_ENV'
      );
    }
  });

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

  it('returns a valid enrichment for an unrecognized event type via DefaultHandler', () => {
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

  it('clamps a negative confidence of -0.5 to "0%" in the summary', () => {
    // Implementation: Math.max(0, Math.round(-0.5 * 100)) = Math.max(0, -50) = 0
    // confPct is 0 (not undefined), so the confidence part IS included as "(0%)"
    const result = pipeline.run(
      { selectedAgent: 'my-agent', confidence: -0.5 },
      'routing-decision',
      'routing-topic'
    );
    expect(result.summary).toContain('0%');
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
    // truncate(s, 40) caps output at 40 characters (37 chars of content + '...')
    expect(result.artifacts[0].display).not.toBe(longCommand);
    expect((result.artifacts[0].display ?? '').length).toBeLessThanOrEqual(40);
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

  it('write: produces a file_write artifact and populates filePath', () => {
    const result = pipeline.run(
      { toolName: 'write', tool_input: { file_path: '/tmp/output.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('write');
    expect(result.filePath).toBe('/tmp/output.ts');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('file_write');
    expect(result.artifacts[0].value).toBe('/tmp/output.ts');
    // display should be the basename
    expect(result.artifacts[0].display).toBe('output.ts');
  });

  it('glob: produces a glob_pattern artifact with the pattern value', () => {
    const result = pipeline.run(
      { toolName: 'glob', tool_input: { pattern: '**/*.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('glob');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('glob_pattern');
    expect(result.artifacts[0].value).toBe('**/*.ts');
    // glob does not set filePath — it uses the pattern field only
    expect(result.filePath).toBeUndefined();
  });

  it('edit: produces a file_edit artifact and populates filePath', () => {
    const result = pipeline.run(
      { toolName: 'edit', tool_input: { file_path: '/src/server/index.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('edit');
    expect(result.filePath).toBe('/src/server/index.ts');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('file_edit');
    expect(result.artifacts[0].value).toBe('/src/server/index.ts');
    // display should be the basename
    expect(result.artifacts[0].display).toBe('index.ts');
  });

  it('multiedit: produces a file_edit artifact and populates filePath', () => {
    const result = pipeline.run(
      { toolName: 'multiedit', tool_input: { file_path: '/src/shared/types.ts' } },
      'agent-action',
      'agent-actions'
    );
    expect(result.toolName).toBe('multiedit');
    expect(result.filePath).toBe('/src/shared/types.ts');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe('file_edit');
    expect(result.artifacts[0].value).toBe('/src/shared/types.ts');
    expect(result.artifacts[0].display).toBe('types.ts');
  });
});

// ============================================================================
// ErrorEventHandler enrichment output
// ============================================================================

describe('ErrorEventHandler enrichment output', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('produces category "error_event", handler "ErrorEventHandler", and summary containing the error message', () => {
    const result = pipeline.run(
      { type: 'task-failed', payload: { error: 'Something went wrong' } },
      'task-failed',
      'agent-actions'
    );
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.summary).toContain('Something went wrong');
  });

  it('extracts ".error" from a structured object when ".message" is absent — { message: { error: "x" } } shape', () => {
    // When payload is { message: { error: 'Something went wrong' } }, findField() resolves
    // rawError to { error: 'Something went wrong' } (the message object).
    // Because rawError lacks a .message key, the old code fell back to str(rawError) which
    // returns undefined (not a string), producing 'Unknown error'.
    // The fix checks .error as a fallback when .message is absent.
    const result = pipeline.run(
      { message: { error: 'Something went wrong' } },
      'task-failed',
      'agent-actions'
    );
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Something went wrong');
    expect(result.summary).toContain('Something went wrong');
  });

  it('empty string error field falls through to "Unknown error" (|| guard)', () => {
    // error: '' is falsy — with || the fallback kicks in, so error/summary should read "Unknown error"
    const result = pipeline.run({ error: '' }, 'task-failed', 'agent-actions');
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Unknown error');
    expect(result.summary).toContain('Unknown error');
    // The summary must NOT contain a bare ": " followed immediately by nothing
    expect(result.summary).not.toMatch(/: $/);
  });

  it('empty string error with sibling message field surfaces the sibling (MAJOR 2 fix)', () => {
    // { error: '', message: 'Connection refused' }: str('') returns '' which is falsy,
    // so the sibling scan is entered. 'message' is found at the top level and returned.
    const result = pipeline.run(
      { error: '', message: 'Connection refused' },
      'task-failed',
      'agent-actions'
    );
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Connection refused');
    expect(result.summary).toContain('Connection refused');
  });

  it('object with neither .message nor .error string degrades to "Unknown error"', () => {
    // { message: { code: 42 } } → rawError is { code: 42 }; it has no .message (undefined)
    // and no .error string; str() on both returns undefined → errorMsg is undefined →
    // || fallback produces 'Unknown error'
    const result = pipeline.run({ message: { code: 42 } }, 'task-failed', 'agent-actions');
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Unknown error');
    expect(result.summary).toContain('Unknown error');
  });

  it('prefers top-level string "message" over object-valued "error" when both are present', () => {
    // Payload: { error: { code: 500 }, message: 'Connection timeout' }
    // findField(['error', 'message', ...]) returns the object { code: 500 } first (error key wins).
    // str({ code: 500 }) is undefined, so the fixed code falls back to the remaining top-level
    // string fields and finds 'Connection timeout' in the "message" key.
    const result = pipeline.run(
      { error: { code: 500 }, message: 'Connection timeout' },
      'task-failed',
      'agent-actions'
    );
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Connection timeout');
    expect(result.summary).toContain('Connection timeout');
  });

  it('falls back to Unknown error when error object has no .message or .error sub-key', () => {
    // Known limitation: structured error objects without .message or .error lose context.
    // { error: { stack: 'at line 1', code: 500 } } → findField resolves rawError to
    // { stack: 'at line 1', code: 500 }. That object has neither a .message string nor
    // an .error string (both sub-keys are absent), so str() on both returns undefined.
    // errorMsg falls through to undefined, and || 'Unknown error' kicks in.
    // Callers that need error details to survive enrichment should use a top-level string
    // field (.error or .message) rather than a structured object with arbitrary sub-keys.
    const result = pipeline.run(
      { error: { stack: 'at line 1', code: 500 } },
      'task-failed',
      'tasks'
    );
    expect(result.error).toBe('Unknown error');
    expect(result.summary).toContain('Unknown error');
  });

  it('does NOT extract unrelated nested message when error is an object (Fix 1: top-level scan only)', () => {
    // Before Fix 1, the Step 1 fallback called findField() which descends into WRAPPER_KEYS.
    // This caused { error: { code: 500 }, data: { message: 'unrelated context' } } to
    // incorrectly surface 'unrelated context' as the error message (found via data wrapper).
    // After Fix 1 the fallback is a plain top-level key scan — no wrapper descent.
    // 'message' is absent at the top level, so the fallback returns undefined.
    // Step 2 then looks inside the error object, which has no .message or .error string,
    // so the result falls through to 'Unknown error'.
    const result = pipeline.run(
      { error: { code: 500 }, data: { message: 'unrelated context' } },
      'task-failed',
      'agent-actions'
    );
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    // 'unrelated context' must NOT be extracted — it lives inside a wrapper, not at the top level
    expect(result.error).not.toBe('unrelated context');
    expect(result.summary).not.toContain('unrelated context');
    // The correct outcome is 'Unknown error' because the error object has no usable string sub-key
    expect(result.error).toBe('Unknown error');
  });

  it('extracts a top-level string error field directly (simplest possible case)', () => {
    // Verifies that a plain { error: 'Direct error string' } payload at the top level
    // is extracted without any wrapper descent or structured-object logic.
    const result = pipeline.run({ error: 'Direct error string' }, 'task-failed', 'agent-actions');
    expect(result.category).toBe('error_event');
    expect(result.handler).toBe('ErrorEventHandler');
    expect(result.error).toBe('Direct error string');
    expect(result.summary).toContain('Direct error string');
  });
});

// ============================================================================
// NodeHeartbeatHandler enrichment output
// ============================================================================

describe('NodeHeartbeatHandler enrichment output', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('produces category "node_heartbeat", handler "NodeHeartbeatHandler", correct nodeId, and a non-empty summary', () => {
    const result = pipeline.run(
      { nodeId: 'test-node-1', health: 'healthy' },
      'node-heartbeat',
      'node.heartbeat.v1'
    );
    expect(result.category).toBe('node_heartbeat');
    expect(result.handler).toBe('NodeHeartbeatHandler');
    expect(result.nodeId).toBe('test-node-1');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// NodeLifecycleHandler enrichment output
// ============================================================================

describe('NodeLifecycleHandler enrichment output', () => {
  const pipeline = new EventEnrichmentPipeline();

  it('produces category "node_lifecycle", handler "NodeLifecycleHandler", and a non-empty summary', () => {
    const result = pipeline.run({ nodeId: 'registry-node' }, 'updated', 'node-registry.updated.v1');
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('eventLabel is "Node Shutdown" when type contains "shutdown"', () => {
    const result = pipeline.run(
      { nodeId: 'compute-node-7' },
      'node-shutdown',
      'node-registry.events'
    );
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Shutdown');
    expect(result.summary).toContain('compute-node-7');
  });

  it('eventLabel is "Node Shutdown" when type contains "offline"', () => {
    const result = pipeline.run({ nodeId: 'worker-4' }, 'node-offline', 'node-registry.events');
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Shutdown');
    expect(result.summary).toContain('worker-4');
  });

  it('eventLabel is "Node Startup" when type contains "startup"', () => {
    const result = pipeline.run(
      { nodeId: 'compute-node-3' },
      'node-startup',
      'node-registry.events'
    );
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Startup');
    expect(result.summary).toContain('compute-node-3');
  });

  it('eventLabel is "Node Startup" when type contains "started"', () => {
    const result = pipeline.run(
      { nodeId: 'inference-node-1' },
      'node-started',
      'node-registry.events'
    );
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Startup');
    expect(result.summary).toContain('inference-node-1');
  });

  it('eventLabel is "Node Registration" when type contains "registr"', () => {
    const result = pipeline.run(
      { nodeId: 'api-node-2' },
      'node-registration',
      'node-registry.events'
    );
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Registration');
    expect(result.summary).toContain('api-node-2');
  });

  it('eventLabel is "Node Lifecycle" (default) when type matches no known keyword', () => {
    const result = pipeline.run(
      { nodeId: 'orchestrator-1' },
      'node-updated',
      'node-registry.events'
    );
    expect(result.category).toBe('node_lifecycle');
    expect(result.handler).toBe('NodeLifecycleHandler');
    expect(result.summary).toContain('Node Lifecycle');
    expect(result.summary).toContain('orchestrator-1');
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
