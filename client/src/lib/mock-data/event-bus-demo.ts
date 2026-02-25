/**
 * Demo Data: Event Bus Monitor (OMN-2298)
 *
 * Canned event bus snapshot for demo mode.
 *
 * Tells a coherent narrative:
 *   - An agent session starts → routes to "python-fastapi-expert"
 *   - Several tool calls execute (Read, Edit, Bash)
 *   - A pattern is discovered and promoted
 *   - A code analysis pipeline runs (cmd → completed)
 *   - Node heartbeats confirm platform health
 *   - Session closes with a successful outcome
 *
 * The snapshot is static (no live polling). Topic status rows reflect
 * realistic "last seen" data that can be computed client-side from the
 * canned events.
 */

import type { EventBusPayload } from '@shared/event-bus-payload';
import type { ProjectionEvent } from '@shared/projection-types';

// ============================================================================
// Time helpers
// ============================================================================

function msAgo(ms: number): number {
  return Date.now() - ms;
}

function secAgo(s: number): number {
  return msAgo(s * 1000);
}

function minAgo(m: number): number {
  return msAgo(m * 60 * 1000);
}

// ============================================================================
// Canned events (newest-last, projection sorts newest-first for display)
// ============================================================================

const DEMO_EVENTS: ProjectionEvent[] = [
  // ── Session start ──────────────────────────────────────────────────────────
  {
    id: 'demo-001',
    eventTimeMs: minAgo(12),
    ingestSeq: 1,
    topic: 'dev.onex.cmd.omniclaude.session-started.v1',
    type: 'session-started',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      sessionId: 'ses-demo-7f3a',
      correlationId: 'cor-demo-7f3a',
      model: 'claude-sonnet-4-6',
      trigger: 'user_prompt',
      userIntent: 'feat(dash): implement demo mode toggle',
    },
  },

  // ── Routing decision ───────────────────────────────────────────────────────
  {
    id: 'demo-002',
    eventTimeMs: minAgo(11.8),
    ingestSeq: 2,
    topic: 'onex.evt.omniclaude.routing-decision.v1',
    type: 'routing-decision',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      sessionId: 'ses-demo-7f3a',
      selectedAgent: 'frontend-developer',
      confidence: 0.94,
      candidateAgents: ['frontend-developer', 'python-fastapi-expert', 'code-quality-analyzer'],
      routingStrategy: 'hook-classifier',
    },
  },

  // ── Agent transformation (polymorphic) ────────────────────────────────────
  {
    id: 'demo-003',
    eventTimeMs: minAgo(11.7),
    ingestSeq: 3,
    topic: 'onex.evt.omniclaude.agent-transformation.v1',
    type: 'agent-transformation',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      fromAgent: 'polymorphic',
      toAgent: 'frontend-developer',
      transformationType: 'domain-specialization',
    },
  },

  // ── Manifest injected ─────────────────────────────────────────────────────
  {
    id: 'demo-004',
    eventTimeMs: minAgo(11.5),
    ingestSeq: 4,
    topic: 'dev.onex.evt.omniclaude.manifest-injected.v1',
    type: 'manifest-injected',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      sessionId: 'ses-demo-7f3a',
      patternsInjected: 8,
      tokenCount: 1240,
      injectionLatencyMs: 38,
    },
  },

  // ── Tool: Read ─────────────────────────────────────────────────────────────
  {
    id: 'demo-005',
    eventTimeMs: minAgo(10.9),
    ingestSeq: 5,
    topic: 'onex.evt.omniclaude.agent-actions.v1',
    type: 'tool-executed',
    source: 'frontend-developer',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      actionType: 'Read',
      toolName: 'Read',
      file_path: 'client/src/contexts/DemoModeContext.tsx',
      durationMs: 42,
      success: true,
    },
  },

  // ── Tool: Read 2 ──────────────────────────────────────────────────────────
  {
    id: 'demo-006',
    eventTimeMs: minAgo(10.4),
    ingestSeq: 6,
    topic: 'onex.evt.omniclaude.agent-actions.v1',
    type: 'tool-executed',
    source: 'frontend-developer',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      actionType: 'Read',
      toolName: 'Read',
      file_path: 'client/src/lib/data-sources/cost-source.ts',
      durationMs: 31,
      success: true,
    },
  },

  // ── Node heartbeat ────────────────────────────────────────────────────────
  {
    id: 'demo-007',
    eventTimeMs: minAgo(10),
    ingestSeq: 7,
    topic: 'dev.onex.evt.node.heartbeat.v1',
    type: 'node-heartbeat',
    source: 'NodeExtractionEffect',
    severity: 'info',
    payload: {
      nodeId: 'NodeExtractionEffect',
      healthStatus: 'healthy',
      uptimeMs: 3_840_000,
    },
  },

  // ── Intelligence code analysis command ────────────────────────────────────
  {
    id: 'demo-008',
    eventTimeMs: minAgo(9.8),
    ingestSeq: 8,
    topic: 'dev.archon-intelligence.intelligence.code-analysis-requested.v1',
    type: 'code-analysis-requested',
    source: 'omniintelligence',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-intel-01',
      requestId: 'req-demo-intel-01',
      filePath: 'client/src/contexts/DemoModeContext.tsx',
      language: 'typescript',
    },
  },

  // ── Tool: Edit ─────────────────────────────────────────────────────────────
  {
    id: 'demo-009',
    eventTimeMs: minAgo(9.2),
    ingestSeq: 9,
    topic: 'onex.evt.omniclaude.agent-actions.v1',
    type: 'tool-executed',
    source: 'frontend-developer',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      actionType: 'Edit',
      toolName: 'Edit',
      file_path: 'client/src/lib/mock-data/event-bus-demo.ts',
      durationMs: 88,
      success: true,
    },
  },

  // ── Pattern discovered ────────────────────────────────────────────────────
  {
    id: 'demo-010',
    eventTimeMs: minAgo(9),
    ingestSeq: 10,
    topic: 'dev.onex.evt.omniintelligence.pattern-discovered.v1',
    type: 'pattern-discovered',
    source: 'omniintelligence',
    severity: 'info',
    payload: {
      patternId: 'pat-demo-context-provider',
      patternName: 'React context provider with localStorage persistence',
      confidence: 0.89,
      repositoryHint: 'omnidash2',
    },
  },

  // ── Intelligence code analysis completed ──────────────────────────────────
  {
    id: 'demo-011',
    eventTimeMs: minAgo(8.6),
    ingestSeq: 11,
    topic: 'dev.archon-intelligence.intelligence.code-analysis-completed.v1',
    type: 'code-analysis-completed',
    source: 'omniintelligence',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-intel-01',
      requestId: 'req-demo-intel-01',
      patternsFound: 3,
      qualityScore: 0.91,
      durationMs: 1240,
    },
  },

  // ── Tool: Bash ─────────────────────────────────────────────────────────────
  {
    id: 'demo-012',
    eventTimeMs: minAgo(8.1),
    ingestSeq: 12,
    topic: 'onex.evt.omniclaude.agent-actions.v1',
    type: 'tool-executed',
    source: 'frontend-developer',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      actionType: 'Bash',
      toolName: 'Bash',
      command: 'npm run check',
      durationMs: 4210,
      success: true,
    },
  },

  // ── Router performance ─────────────────────────────────────────────────────
  {
    id: 'demo-013',
    eventTimeMs: minAgo(7.5),
    ingestSeq: 13,
    topic: 'onex.evt.omniclaude.performance-metrics.v1',
    type: 'router-performance',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      routingAccuracyRate: 0.97,
      avgConfidence: 0.91,
      p99LatencyMs: 142,
      requestsPerMinute: 4.2,
    },
  },

  // ── Node heartbeat 2 ──────────────────────────────────────────────────────
  {
    id: 'demo-014',
    eventTimeMs: minAgo(7),
    ingestSeq: 14,
    topic: 'dev.onex.evt.node.heartbeat.v1',
    type: 'node-heartbeat',
    source: 'NodeValidationCompute',
    severity: 'info',
    payload: {
      nodeId: 'NodeValidationCompute',
      healthStatus: 'healthy',
      uptimeMs: 7_200_000,
    },
  },

  // ── Pattern lifecycle: scoring ─────────────────────────────────────────────
  {
    id: 'demo-015',
    eventTimeMs: minAgo(6.5),
    ingestSeq: 15,
    topic: 'dev.onex.evt.omniintelligence.intelligence.pattern-scored.v1',
    type: 'pattern-scored',
    source: 'omniintelligence',
    severity: 'info',
    payload: {
      patternId: 'pat-demo-context-provider',
      scoreType: 'utilization',
      score: 0.84,
      usageCount: 12,
    },
  },

  // ── Pattern lifecycle: promoted ────────────────────────────────────────────
  {
    id: 'demo-016',
    eventTimeMs: minAgo(6),
    ingestSeq: 16,
    topic: 'dev.onex.evt.omniintelligence.intelligence.pattern-lifecycle-transitioned.v1',
    type: 'pattern-lifecycle-transitioned',
    source: 'omniintelligence',
    severity: 'info',
    payload: {
      patternId: 'pat-demo-context-provider',
      fromState: 'candidate',
      toState: 'active',
      transitionReason: 'confidence_threshold_met',
    },
  },

  // ── Agent status ──────────────────────────────────────────────────────────
  {
    id: 'demo-017',
    eventTimeMs: minAgo(5.5),
    ingestSeq: 17,
    topic: 'dev.onex.evt.omniclaude.agent-status.v1',
    type: 'agent-status',
    source: 'frontend-developer',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      agentName: 'frontend-developer',
      status: 'idle',
      lastActionType: 'Bash',
    },
  },

  // ── OmniClaude phase metrics ───────────────────────────────────────────────
  {
    id: 'demo-018',
    eventTimeMs: minAgo(4.8),
    ingestSeq: 18,
    topic: 'dev.onex.evt.omniclaude.phase-metrics.v1',
    type: 'phase-metrics',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      phase: 'implementation',
      tokensUsed: 18_420,
      toolCallCount: 6,
      elapsedMs: 420_000,
    },
  },

  // ── Session outcome ────────────────────────────────────────────────────────
  {
    id: 'demo-019',
    eventTimeMs: minAgo(4),
    ingestSeq: 19,
    topic: 'dev.onex.evt.omniclaude.session-outcome.v1',
    type: 'session-outcome',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-7f3a',
      sessionId: 'ses-demo-7f3a',
      outcome: 'success',
      totalToolCalls: 6,
      totalTokens: 18_420,
      durationMs: 480_000,
    },
  },

  // ── Second session: starts ~3 min ago ─────────────────────────────────────
  {
    id: 'demo-020',
    eventTimeMs: minAgo(3),
    ingestSeq: 20,
    topic: 'dev.onex.cmd.omniclaude.session-started.v1',
    type: 'session-started',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      sessionId: 'ses-demo-8b2c',
      correlationId: 'cor-demo-8b2c',
      model: 'claude-sonnet-4-6',
      trigger: 'user_prompt',
      userIntent: 'fix(validation): add missing error boundaries',
    },
  },

  // ── Routing for second session ─────────────────────────────────────────────
  {
    id: 'demo-021',
    eventTimeMs: minAgo(2.9),
    ingestSeq: 21,
    topic: 'onex.evt.omniclaude.routing-decision.v1',
    type: 'routing-decision',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-8b2c',
      sessionId: 'ses-demo-8b2c',
      selectedAgent: 'debug',
      confidence: 0.88,
      candidateAgents: ['debug', 'testing', 'code-quality-analyzer'],
      routingStrategy: 'hook-classifier',
    },
  },

  // ── Node heartbeat 3 (recent) ─────────────────────────────────────────────
  {
    id: 'demo-022',
    eventTimeMs: secAgo(90),
    ingestSeq: 22,
    topic: 'dev.onex.evt.node.heartbeat.v1',
    type: 'node-heartbeat',
    source: 'NodeRegistrationReducer',
    severity: 'info',
    payload: {
      nodeId: 'NodeRegistrationReducer',
      healthStatus: 'healthy',
      uptimeMs: 14_400_000,
    },
  },

  // ── Tool: Glob ────────────────────────────────────────────────────────────
  {
    id: 'demo-023',
    eventTimeMs: secAgo(75),
    ingestSeq: 23,
    topic: 'onex.evt.omniclaude.agent-actions.v1',
    type: 'tool-executed',
    source: 'debug',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-8b2c',
      actionType: 'Glob',
      toolName: 'Glob',
      pattern: 'client/src/**/*.tsx',
      durationMs: 18,
      success: true,
    },
  },

  // ── Agent manifest injections ─────────────────────────────────────────────
  {
    id: 'demo-024',
    eventTimeMs: secAgo(60),
    ingestSeq: 24,
    topic: 'dev.onex.evt.omniclaude.manifest-injected.v1',
    type: 'manifest-injected',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-8b2c',
      sessionId: 'ses-demo-8b2c',
      patternsInjected: 5,
      tokenCount: 840,
      injectionLatencyMs: 29,
    },
  },

  // ── OmniClaude transformation completed ───────────────────────────────────
  {
    id: 'demo-025',
    eventTimeMs: secAgo(30),
    ingestSeq: 25,
    topic: 'dev.onex.evt.omniclaude.transformation-completed.v1',
    type: 'transformation-completed',
    source: 'omniclaude',
    severity: 'info',
    payload: {
      correlationId: 'cor-demo-8b2c',
      fromAgent: 'polymorphic',
      toAgent: 'debug',
      durationMs: 62,
    },
  },

  // ── Most-recent node heartbeat ────────────────────────────────────────────
  {
    id: 'demo-026',
    eventTimeMs: secAgo(5),
    ingestSeq: 26,
    topic: 'dev.onex.evt.node.heartbeat.v1',
    type: 'node-heartbeat',
    source: 'NodeOrchestrationEffect',
    severity: 'info',
    payload: {
      nodeId: 'NodeOrchestrationEffect',
      healthStatus: 'healthy',
      uptimeMs: 21_600_000,
    },
  },
];

// ============================================================================
// Topic breakdown (pre-aggregated, mirrors live projection format)
// ============================================================================

function buildTopicBreakdown(events: ProjectionEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.topic] = (counts[e.topic] ?? 0) + 1;
  }
  return counts;
}

function buildEventTypeBreakdown(events: ProjectionEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

function buildTimeSeries(
  events: ProjectionEvent[],
  bucketMs: number
): Array<{ bucketKey: number; count: number }> {
  const buckets: Record<number, number> = {};
  for (const e of events) {
    const key = Math.floor(e.eventTimeMs / bucketMs) * bucketMs;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .map(([k, count]) => ({ bucketKey: Number(k), count }))
    .sort((a, b) => a.bucketKey - b.bucketKey);
}

// ============================================================================
// Demo snapshot factory
// ============================================================================

/**
 * Returns a fresh EventBusPayload snapshot for demo mode.
 *
 * Events are sorted newest-first (matching live projection behavior).
 * All aggregate fields are recomputed each call so relative timestamps stay
 * accurate as the user navigates around with demo mode enabled.
 */
export function getDemoEventBusSnapshot(): EventBusPayload {
  // Sort newest-first (live projection sends newest-first)
  const sorted = [...DEMO_EVENTS].sort((a, b) => b.eventTimeMs - a.eventTimeMs);

  const TIME_SERIES_BUCKET_MS = 15_000;

  return {
    events: sorted,
    topicBreakdown: buildTopicBreakdown(DEMO_EVENTS),
    eventTypeBreakdown: buildEventTypeBreakdown(DEMO_EVENTS),
    timeSeries: buildTimeSeries(DEMO_EVENTS, TIME_SERIES_BUCKET_MS),
    eventsPerSecond: 0.4,
    errorCount: 0,
    activeTopics: 8,
    totalEventsIngested: DEMO_EVENTS.length,
    // Burst / staleness — no active burst in demo
    monitoringWindowMs: 5 * 60 * 1000,
    stalenessThresholdMs: 10 * 60 * 1000,
    burstWindowMs: 30_000,
    windowedErrorRate: 0,
    burstInfo: null,
  };
}
