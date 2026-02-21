/**
 * Event Enrichment Handlers (OMN-2418)
 *
 * Single source of truth for event category classification and display-only
 * metadata derivation. All handlers implement the EnrichmentHandler interface
 * and are dispatched via EventEnrichmentPipeline (O(1) Map lookup).
 *
 * Invariant: handlers derive ONLY display metadata — no domain logic,
 * no calculated business values, no side effects.
 */

import type {
  EnrichmentHandler,
  EventCategory,
  EventEnrichment,
  EventArtifact,
} from '../../shared/projection-types.js';

export type { EnrichmentHandler };

// ============================================================================
// Module-private utilities
// ============================================================================

const WRAPPER_KEYS = ['data', 'payload', 'body', 'event', 'message'] as const;

/** Check top-level fields, then one wrapper level deep. */
function findField(payload: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (payload[key] != null) return payload[key];
  }
  for (const wk of WRAPPER_KEYS) {
    const wrapper = payload[wk];
    if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
      const inner = wrapper as Record<string, unknown>;
      for (const key of keys) {
        if (inner[key] != null) return inner[key];
      }
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && !isNaN(v) ? v : undefined;
}

/**
 * Truncates `s` to at most `max` characters (including the `'...'` suffix).
 * If `s` is already within `max`, it is returned unchanged.
 */
function truncate(s: string, max = 60): string {
  return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

function extractBashCommand(
  toolInput: unknown,
  payload: Record<string, unknown>
): string | undefined {
  if (toolInput && typeof toolInput === 'object') {
    const ti = toolInput as Record<string, unknown>;
    const cmd = str(ti['command']) ?? str(ti['cmd']) ?? str(ti['args']);
    if (cmd) return cmd;
  }
  return str(findField(payload, ['command', 'cmd', 'bash_command']));
}

// ============================================================================
// Category classifier
// ============================================================================

/**
 * Single source of truth for event category routing.
 *
 * Precedence (first match wins):
 * 1. `toolName` in payload → tool_event
 * 2. `type` or `topic` contains error/failed/failure → error_event
 * 3. `type` or `topic` contains routing, OR `selectedAgent` in payload → routing_event
 * 4. `type` or `topic` contains intent, OR `intent_category`/`intentCategory` in payload → intent_event
 * 5. `type` or `topic` contains heartbeat → node_heartbeat
 * 6. `type` or `topic` contains registration/lifecycle/node-registry → node_lifecycle
 * 7. Default → unknown
 */
export function deriveEventCategory(
  payload: Record<string, unknown>,
  type: string,
  topic: string
): EventCategory {
  const lType = type.toLowerCase();
  const lTopic = topic.toLowerCase();

  // Tool event: presence of a non-empty toolName field takes highest priority
  const toolName = str(findField(payload, ['toolName', 'tool_name']));
  if (toolName) return 'tool_event';

  // Error event
  if (
    lType.includes('error') ||
    lTopic.includes('error') ||
    lType.includes('failed') ||
    lType.includes('failure') ||
    lTopic.includes('failed') ||
    lTopic.includes('failure')
  ) {
    return 'error_event';
  }

  // Routing event
  if (
    lType.includes('routing') ||
    lTopic.includes('routing') ||
    // type-only: 'routing' in type names like 'routing-decision', 'rerouting'.
    // 'route' was intentionally removed — it is a prefix of 'router' and would
    // false-positive on type strings like 'router-metrics' or 'router-error-log'.
    findField(payload, ['selectedAgent', 'selected_agent']) !== undefined
  ) {
    return 'routing_event';
  }

  // Intent event
  if (
    lType.includes('intent') ||
    lTopic.includes('intent') ||
    findField(payload, ['intent_category', 'intentCategory']) !== undefined
  ) {
    return 'intent_event';
  }

  // Node heartbeat
  if (lType.includes('heartbeat') || lTopic.includes('heartbeat')) {
    return 'node_heartbeat';
  }

  // Node lifecycle
  if (
    lType.includes('registration') ||
    lType.includes('lifecycle') ||
    lTopic.includes('registration') ||
    lTopic.includes('lifecycle') ||
    lTopic.includes('node-registry')
  ) {
    return 'node_lifecycle';
  }

  return 'unknown';
}

// ============================================================================
// Handlers
// ============================================================================

const ToolExecutedHandler: EnrichmentHandler = {
  name: 'ToolExecutedHandler',
  category: 'tool_event',
  enrich(payload, type, _topic): EventEnrichment {
    const toolName = str(findField(payload, ['toolName', 'tool_name'])) || 'Tool';
    const toolInput = findField(payload, ['toolInput', 'tool_input', 'input']);
    const artifacts: EventArtifact[] = [];
    let filePath: string | undefined;
    let bashCommand: string | undefined;

    const lTool = toolName.toLowerCase();

    // Guard against array or primitive tool_input values — only plain objects should be used for field lookup
    const inputs =
      toolInput !== null && typeof toolInput === 'object' && !Array.isArray(toolInput)
        ? (toolInput as Record<string, unknown>)
        : undefined;

    // Recognized tools: read, readfile, write, edit, multiedit, glob, bash.
    // All other tools (e.g. grep, webfetch, task, todowrite) fall through
    // without populating filePath/bashCommand and produce a generic summary.
    if (lTool === 'read' || lTool === 'readfile') {
      filePath = str(
        inputs?.['file_path'] ?? findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() || filePath;
        artifacts.push({ kind: 'file_read', value: filePath, display: short });
      }
    } else if (lTool === 'write') {
      filePath = str(
        inputs?.['file_path'] ?? findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() || filePath;
        artifacts.push({ kind: 'file_write', value: filePath, display: short });
      }
    } else if (lTool === 'edit' || lTool === 'multiedit') {
      filePath = str(
        inputs?.['file_path'] ?? findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() || filePath;
        artifacts.push({ kind: 'file_edit', value: filePath, display: short });
      }
    } else if (lTool === 'glob') {
      const pattern = str(inputs?.['pattern'] ?? findField(payload, ['pattern', 'glob']));
      if (pattern) {
        artifacts.push({ kind: 'glob_pattern', value: pattern });
      }
    } else if (lTool === 'bash') {
      bashCommand = extractBashCommand(inputs, payload);
      if (bashCommand) {
        artifacts.push({
          kind: 'bash_command',
          value: bashCommand,
          display: truncate(bashCommand, 40),
        });
      }
    }

    // Summary: "ToolName target" e.g. "Read index.ts", "Bash ls -la"
    let summaryTarget: string;
    if (filePath) {
      summaryTarget = filePath.split('/').pop() || filePath;
    } else if (bashCommand) {
      summaryTarget = truncate(bashCommand, 40);
    } else {
      summaryTarget = str(findField(payload, ['target', 'name'])) ?? '';
    }
    const summary = truncate(summaryTarget ? `${toolName} ${summaryTarget}` : toolName);

    return {
      enrichmentVersion: 'v1',
      handler: 'ToolExecutedHandler',
      category: 'tool_event',
      summary,
      normalizedType: type,
      artifacts,
      toolName,
      filePath,
      bashCommand,
    };
  },
};

const RoutingDecisionHandler: EnrichmentHandler = {
  name: 'RoutingDecisionHandler',
  category: 'routing_event',
  enrich(payload, type, _topic): EventEnrichment {
    const selectedAgent =
      str(
        findField(payload, ['selectedAgent', 'selected_agent', 'agent', 'agentName', 'agent_name'])
      ) ?? 'unknown';
    const confidence = num(findField(payload, ['confidence', 'score', 'probability']));

    // Confidence normalization heuristic:
    //   - Values in [0, 1]:  fractional form  — multiply by 100 (0.95 → 95%)
    //   - Values >  1:       already-percent  — round directly (95 → 95%)
    // Edge case: values in (1, 2) exclusive (e.g. 1.5) are treated as
    // already-in-percent form and rounded to 2%, not multiplied (1.5 → 2%).
    // Producers SHOULD use either strictly fractional (0–1) or integer percent
    // (2–100) to avoid ambiguity in this range.
    const confPct =
      confidence !== undefined
        ? Math.min(
            100,
            Math.max(0, confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100))
          )
        : undefined;
    const confPart = confPct !== undefined ? ` (${confPct}%)` : '';
    const summary = truncate(`Selected ${selectedAgent}${confPart}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'RoutingDecisionHandler',
      category: 'routing_event',
      summary,
      normalizedType: type,
      artifacts: [],
      selectedAgent,
      confidence,
    };
  },
};

const IntentHandler: EnrichmentHandler = {
  name: 'IntentHandler',
  category: 'intent_event',
  enrich(payload, type, _topic): EventEnrichment {
    const intentType =
      str(findField(payload, ['intent_category', 'intentCategory', 'intent'])) ?? 'unknown';
    const confidence = num(findField(payload, ['confidence', 'score', 'probability']));

    // Confidence normalization heuristic — same rules as RoutingDecisionHandler:
    //   - Values in [0, 1]:  fractional (0.95 → 95%)
    //   - Values >  1:       already-percent (95 → 95%)
    // Values in (1, 2) exclusive are treated as already-in-percent and rounded.
    const confPct =
      confidence !== undefined
        ? Math.min(
            100,
            Math.max(0, confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100))
          )
        : undefined;
    const confPart = confPct !== undefined ? ` (${confPct}%)` : '';
    const summary = truncate(`${intentType}${confPart}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'IntentHandler',
      category: 'intent_event',
      summary,
      normalizedType: type,
      artifacts: [],
      intentType,
      confidence,
    };
  },
};

const NodeHeartbeatHandler: EnrichmentHandler = {
  name: 'NodeHeartbeatHandler',
  category: 'node_heartbeat',
  enrich(payload, type, _topic): EventEnrichment {
    const nodeId = str(findField(payload, ['nodeId', 'node_id', 'id', 'name'])) ?? 'unknown';
    const healthStatus =
      str(findField(payload, ['status', 'health', 'state', 'healthStatus'])) ?? 'healthy';

    const summary = truncate(`${nodeId} — ${healthStatus}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'NodeHeartbeatHandler',
      category: 'node_heartbeat',
      summary,
      normalizedType: type,
      artifacts: [],
      nodeId,
      healthStatus,
    };
  },
};

const NodeLifecycleHandler: EnrichmentHandler = {
  name: 'NodeLifecycleHandler',
  category: 'node_lifecycle',
  enrich(payload, type, _topic): EventEnrichment {
    const nodeId = str(findField(payload, ['nodeId', 'node_id', 'id', 'name'])) ?? 'unknown';

    // Derive a human-readable lifecycle event label from the type string
    const lType = type.toLowerCase();
    let eventLabel: string;
    if (lType.includes('registr')) {
      eventLabel = 'Node Registration';
    } else if (lType.includes('shutdown') || lType.includes('offline')) {
      eventLabel = 'Node Shutdown';
    } else if (lType.includes('startup') || lType.includes('started')) {
      eventLabel = 'Node Startup';
    } else {
      eventLabel = 'Node Lifecycle';
    }

    const summary = truncate(`${eventLabel}: ${nodeId}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'NodeLifecycleHandler',
      category: 'node_lifecycle',
      summary,
      normalizedType: type,
      artifacts: [],
      nodeId,
    };
  },
};

const ErrorEventHandler: EnrichmentHandler = {
  name: 'ErrorEventHandler',
  category: 'error_event',
  enrich(payload, type, _topic): EventEnrichment {
    const actionType = str(findField(payload, ['actionType', 'action_type'])) ?? type;
    const rawError = findField(payload, ['error', 'message', 'errorMessage', 'error_message']);

    // Step 1: find any direct string value for the error message.
    // If rawError is an object (e.g. `error: { code: 500 }`), str() returns undefined.
    // If rawError is an empty string, str() returns '' which is falsy.
    // In both falsy cases we fall back to a top-level sibling scan so that a payload like
    // { error: '', message: 'Connection refused' } can surface the sibling message.
    // Fallback is top-level scan only — avoid wrapper descent pulling unrelated fields.
    const directStr = str(rawError);
    const fallbackStr =
      !directStr && typeof payload === 'object' && payload !== null
        ? (['message', 'errorMessage', 'error_message'] as string[]).reduce<string | undefined>(
            (acc, key) => acc ?? str((payload as Record<string, unknown>)[key]),
            undefined
          )
        : undefined;
    const errorMsg = directStr || fallbackStr;

    // Step 2: if still no string, try extracting from a structured error object.
    const resolvedMsg =
      errorMsg !== undefined
        ? errorMsg
        : typeof rawError === 'object' && rawError !== null
          ? str(
              (rawError as Record<string, unknown>).message ??
                (rawError as Record<string, unknown>).error
            )
          : undefined;
    const errorMessage = resolvedMsg || 'Unknown error';

    const summary = truncate(`${actionType}: ${errorMessage}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'ErrorEventHandler',
      category: 'error_event',
      summary,
      normalizedType: type,
      artifacts: [],
      actionName: actionType,
      error: errorMessage,
    };
  },
};

const DefaultHandler: EnrichmentHandler = {
  name: 'DefaultHandler',
  category: 'unknown',
  enrich(payload, type, _topic): EventEnrichment {
    const actionName =
      str(findField(payload, ['actionName', 'action_name'])) ??
      str(findField(payload, ['actionType', 'action_type'])) ??
      type;

    const summary = truncate(actionName);

    return {
      enrichmentVersion: 'v1',
      handler: 'DefaultHandler',
      category: 'unknown',
      summary,
      normalizedType: type,
      artifacts: [],
      actionName,
    };
  },
};

// ============================================================================
// Pipeline
// ============================================================================

export class EventEnrichmentPipeline {
  private readonly handlers: Map<EventCategory, EnrichmentHandler>;
  private readonly defaultHandler: EnrichmentHandler;

  constructor() {
    this.defaultHandler = DefaultHandler;
    this.handlers = new Map<EventCategory, EnrichmentHandler>([
      ['tool_event', ToolExecutedHandler],
      ['routing_event', RoutingDecisionHandler],
      ['intent_event', IntentHandler],
      ['node_heartbeat', NodeHeartbeatHandler],
      ['node_lifecycle', NodeLifecycleHandler],
      ['error_event', ErrorEventHandler],
      // Explicit registration so unknown category has a documented handler, not just a nullish fallback
      ['unknown', DefaultHandler],
    ]);
  }

  /** Classify and enrich an event. Never throws — returns fallback on error. */
  run(payload: Record<string, unknown>, type: string, topic: string): EventEnrichment {
    try {
      const category = deriveEventCategory(payload, type, topic);
      // Defensive fallback: should never be reached if all EventCategory values have registered handlers
      const handler = this.handlers.get(category) ?? this.defaultHandler;
      return handler.enrich(payload, type, topic);
    } catch {
      // Do NOT delegate to defaultHandler.enrich here — it could also throw,
      // breaking the "never throws" contract. Return a hardcoded minimal object.
      return {
        enrichmentVersion: 'v1',
        handler: 'FallbackHandler',
        category: 'unknown',
        summary: 'Event processing error',
        // defensive: guard against untyped runtime callers
        normalizedType: String(type ?? ''),
        artifacts: [],
      };
    }
  }
}

// ============================================================================
// Singleton (lazy-initialized)
// ============================================================================

/** Module-level singleton, created on first call to getEnrichmentPipeline(). */
let _enrichmentPipeline: EventEnrichmentPipeline | undefined;

/**
 * Returns the shared EventEnrichmentPipeline singleton.
 * Lazy-initialized on first call to avoid import-time side effects.
 * Consumed by projection-bootstrap.ts (OMN-2419).
 */
export function getEnrichmentPipeline(): EventEnrichmentPipeline {
  if (_enrichmentPipeline === undefined) {
    _enrichmentPipeline = new EventEnrichmentPipeline();
  }
  return _enrichmentPipeline;
}

/** @internal — for testing only. Do not call from production code. */
export function resetEnrichmentPipelineForTesting(): void {
  if (process.env.NODE_ENV === 'production') return;
  _enrichmentPipeline = undefined;
}
